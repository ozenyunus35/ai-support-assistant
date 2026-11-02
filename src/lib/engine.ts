import { REAL_WORDS } from "./dictionary";
import type { AnswerKind, Article, Citation, Order, OrderCard, SynonymGroup } from "./types";

/**
 * The answer engine. It runs entirely in the browser:
 *   1. analyse: words -> light stemming -> spelling fixes -> synonym phrases -> stop words removed
 *   2. retrieve: BM25 over article sections, with title and heading terms weighted up
 *   3. score confidence from how much of the question the best section covers
 *   4. compose an answer from the best section's most relevant sentences, with its source
 * In production the same retrieval step would feed an LLM (see README); the
 * confidence threshold and handoff logic stay the same.
 */

const STOP = new Set(
  `a about above after again all also am an and any are as at be been before being both but by can could did do does doing done
  for from had has have having he her here hers him his how i id if im in into is isnt it its ive just let lets me might mine more
  most much must my myself no nor not now of off ok okay on once only or other our ours out over own please really same she should
  so some such than that thats the their them then there these they this those through to too under until up us very was we were
  what whats when where which while who whom why will with would yes yet you your yours hi hello hey thanks thank thx cheers
  tell know want wanted need needed like get got help question wondering say said dont cant wont doesnt didnt cannot
  still ever anyone something anything way go going make sure youre many lot old says`.split(/\s+/),
);

/**
 * Words that carry mood, urgency or small talk but not what the question is about
 * ("asap", "honestly", "third time I ask"). They are dropped like stop words, so a
 * frustrated, wordy message finds the same article as a short one.
 */
const FILLER = new Set(
  `asap urgent urgently quickly soon honestly seriously literally basically actually really totally super so very
  disappointed frustrated annoyed angry upset unhappy sad mad furious confused worried sorry please pls plz kindly
  guys hey hiya hi there folks team nah yeah yep nope ugh omg lol hmm well also again already just only even
  third second first time times ask asked asking tried trying wonder wondering curious quick wanted hoping hope
  week weeks day days today yesterday tomorrow monday tuesday wednesday thursday friday ago last
  came come comes went thing things stuff bit little bought purchased ordered got received
  red blue green black white grey gray yellow orange purple pink brown navy`.split(/\s+/),
);

/**
 * Words that are common across the help center and say little about which article
 * fits ("how long does it take", "find", "use", the product itself). They still count,
 * at a lower weight, so the customer's intent (return, refund, exchange) decides.
 */
const GENERIC = new Map<string, number>(
  `long tak find use check new good back item order product gear mean run work need know way kind jacket tent boot bag backpack sleep thing wait`
    .split(/\s+/)
    .map((w) => [w, 0.4]),
);
/** What the customer wants done weighs more than what it is about: "return my online order at a store" is about returning. */
const INTENT = new Set(["chang", "return", "refund", "exchang", "cancel", "track", "repair", "warranty", "damag", "miss", "not_receiv", "trad_in", "rent", "restock", "contact"]);
const weightOf = (t: string) => GENERIC.get(t) ?? (INTENT.has(t) ? 1.5 : 1);

/**
 * Phrases customers split around other words: "send my order back" is "send back",
 * "the tent came broken" is "arrived damaged" (not a warranty claim), "your email" is the support email.
 */
/** Texting shorthand, expanded before matching: "hw do u track ur order pls". */
const SHORTHAND: Record<string, string> = {
  u: "you", ur: "your", r: "are", pls: "please", plz: "please", hw: "how", wat: "what", wut: "what", cuz: "because", bc: "because",
  thx: "thanks", ty: "thanks", abt: "about", pkg: "package", msg: "message", rn: "now", wanna: "want to", gonna: "going to", dont: "do not", cant: "cannot",
};

function rephrase(text: string) {
  return text
    .replace(/[\p{L}']+/gu, (w) => SHORTHAND[w.toLowerCase()] ?? w)
    .replace(/\b(send|give|take|bring|mail|post)\s+((?:[\p{L}'-]+\s+){1,3}?)back\b/giu, "$1 back $2")
    .replace(/\b(?:support|customer service|helpline|help line)\s+(?:phone(?: number)?|number|line)\b|\bphone(?: number)?\s+(?:for|of)\s+(?:support|customer service)\b|\bcall (?:you|support|customer service)\b|\byour phone(?: number)?\b/giu, "contact phone")
    // "Shipping rates" are prices; "rate" would otherwise share a stem with sleeping bag "ratings".
    .replace(/\brates?\b/giu, "prices")
    // "What's your email?" asks for ours; "change my email" is about the account.
    .replace(/\byour e-?mail(?: address)?\b/giu, "support email")
    .replace(/\b(arrived|came|showed up|was delivered|got here)\s+(?:(?:all|completely|totally|already)\s+)?(broken|broke|damaged|cracked|smashed|dented|torn|ripped|bent|crushed|snapped|scratched|leaking)\b/giu, "arrived damaged")
    .replace(/\b(broken|broke|damaged|cracked|smashed|dented|torn|ripped|bent|crushed|snapped|scratched)\s+(when|as|once)\s+(it|they|the \w+)\s+(arrived|came|got here)\b/giu, "arrived damaged")
    // "update the address on my order", "add an item to my order": a change to the order itself.
    .replace(/\badd\s+((?:[\p{L}'-]+\s+){0,3}?)(?:to|in)\s+(?:my|the|this)\s+order\b/giu, "add to my order $1")
    .replace(/\b(change|update|edit|fix|correct|remove)\s+((?:[\p{L}'-]+\s+){0,3}?)(?:on|in|from)\s+(?:my|the|an|this)\s+order\b/giu, "$1 my order $2")
    // "my refund hasn't arrived" is about the refund, not a missing parcel.
    .replace(/\b(refund|money)\s+((?:[\p{L}'-]+\s+){0,2}?)(?:hasn'?t|has not|didn'?t|did not|never|still hasn'?t|not yet)\s+(?:arrived|come|came|shown up|showed up|been received|received|landed)\b/giu, "refund not received")
    .replace(/\b(?:club|membership)\s+(?:cost|costs|price|fee)\b|\b(?:cost|price) of (?:the )?(?:club|membership)\b/giu, "club cost")
    .replace(/\b(?:received|got|sent me|you sent)\s+(?:the|a|an)?\s*wrong\b/giu, "wrong item")
    // "only 2 of the 3 items came", "half my order": part of the order is missing.
    .replace(/\b(?:only|just)\s+(?:\d+|one|two|three|four|some|part)\s+(?:of|out of)\s+(?:the|my)?\s*(?:\d+|one|two|three|four|five)?\b/giu, "missing item ")
    .replace(/\bhalf\s+(?:of\s+)?(?:my|the)\s+(?:order|package|parcel|items|stuff)\b/giu, "missing item");
}

/** "not the return policy", "I don't want a refund": the words right after are what the customer doesn't mean. */
const NEGATION = /\b(?:not (?:the|a|an|about|for)|(?:don'?t|do not|no) (?:want|need|have)(?: to| a| an| the)?|instead of|rather than|other than)\s+((?:[\p{L}\d'-]+\s*){1,3})/giu;

/** Questions about things a store's help center doesn't cover, answered without guessing. */
const JOBS = /\b(hiring|jobs?|careers?|vacanc(y|ies)|internships?|employment|work (for|at) (you|northfold))\b/i;

const GREETING = /^(hi|hello|hey|hiya|good (morning|afternoon|evening)|yo)\b/i;
const THANKS = /\b(thanks|thank you|thx|cheers|perfect|awesome|great|got it|that helps|helpful)\b/i;
/** Word stems that may appear in a plain "thanks" message without making it a question. */
const THANKS_TERMS = new Set(["great", "perfect", "awesom", "helpful", "help", "good", "nic", "cool", "brilliant", "wonderful", "appreciat", "lovely"]);
const IDENTITY = /\b(who|what) are you\b|\bare you (a |an )?(bot|robot|human|real|ai|person)\b|\byour name\b/i;
const HOW_TO = /^\s*(how (do|can|should|would) (i|we|you)|how to)\b/i;
const PRICE = /\b(price|prices|cost|costs|how much)\b/i;
const POLICY_WORDS = /\b(ship|shipping|deliver|delivery|return|refund|exchange|fee|fees|membership|club|rent|rental|repair|warranty|label|duties|tax|klarna|gift card|went down|gone down|dropped|drop|adjustment|difference)\b/i;
const SHIP_WORDS = /\b(ship|ships|shipping|deliver|delivers|delivery|send|post)\b/i;
// Letters and words that only show up when someone writes in another language.
/** A money amount in a help center section: "$6.95", "€19". */
const AMOUNT = /[$€£]\s?\d/;

/** Confidence given to a clear winner; a stricter threshold set by the team still hands these off. */
const CLEAR_WINNER = 0.5;
/** A section matching the customer's intent wins when it scores at least this share of the best one. */
const NAMED_RATIO = 0.6;

/** Weather forecasts: nothing in the help center can answer them, however much they mention rain or snow. */
const WEATHER = /\b(weather|forecast|will it (rain|snow)|is it (going to )?(rain|snow)|(rain|snow)(ing)? (today|tomorrow|tonight|this weekend))\b/i;
const OTHER_LANGUAGE = /[ığşİĞŞñ¿¡ßœ]|\b(nasıl|neden|nerede|kargo|sipariş|iade|merhaba|cómo|dónde|envío|pedido|hola|wie|wo|bestellung|versand|rückgabe|hallo|bonjour|commande|livraison|où|olá|encomenda)\b/i;

/** Countries the help center lists in "International shipping", plus the US itself. */
const SHIPS_TO = ["united states", "usa", "us", "america", "canada", "united kingdom", "uk", "britain", "england", "scotland", "wales", "norway", "switzerland", "australia", "new zealand", "singapore", "japan", "united arab emirates", "uae", "dubai",
  "germany", "france", "spain", "italy", "netherlands", "holland", "belgium", "austria", "ireland", "portugal", "poland", "sweden", "denmark", "finland", "greece", "czechia", "czech republic", "hungary", "romania", "bulgaria", "croatia", "slovakia", "slovenia", "estonia", "latvia", "lithuania", "luxembourg", "malta", "cyprus"];
/** US states: "delivery to California" is a domestic shipping question. */
const US_STATES = ["alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut", "delaware", "florida", "georgia", "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine", "maryland", "massachusetts", "michigan", "minnesota", "mississippi", "missouri", "montana", "nebraska", "nevada", "new hampshire", "new jersey", "new mexico", "new york", "north carolina", "north dakota", "ohio", "oklahoma", "oregon", "pennsylvania", "rhode island", "south carolina", "south dakota", "tennessee", "texas", "utah", "vermont", "virginia", "washington", "west virginia", "wisconsin", "wyoming", "puerto rico"];
const NOT_YET = ["turkey", "türkiye", "turkiye", "mexico", "brazil", "argentina", "chile", "colombia", "peru", "india", "pakistan", "bangladesh", "china", "hong kong", "taiwan", "south korea", "korea", "indonesia", "malaysia", "thailand", "vietnam", "philippines", "russia", "ukraine", "israel", "saudi arabia", "qatar", "kuwait", "egypt", "morocco", "nigeria", "kenya", "south africa", "iceland", "serbia"];
const titleCase = (c: string) => (c.length <= 3 ? c.toUpperCase() : c.replace(/\b\p{L}/gu, (m) => m.toUpperCase()));

const HUMAN = /\b(human|agent|representative|operator|real person|a person|someone real|live (chat|support)|talk to (someone|somebody|support|the team|a person)|speak (to|with))\b/i;
const ORDER_NO = /\bNF[-\s]?(\d{5})\b/i;
const MY_ORDER = /\bmy (order|package|parcel|delivery|shipment)\b/i;

export const fold = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "");

// "Pre-order", "e-mail" and "trade-in" read the same as "preorder", "email" and "tradein".
export const words = (s: string) => fold(s).replace(/([a-z])-(?=[a-z])/g, "$1").split(/[^a-z0-9]+/).filter(Boolean);

/** A deliberately small suffix stripper: enough to match plurals and verb forms. */
/** Irregular verb forms customers use a lot: "you sent me", "I wore them", "it broke". */
const IRREGULAR: Record<string, string> = { sent: "send", wore: "wear", worn: "wear", bought: "buy", paid: "pay", torn: "tear", tore: "tear", broke: "break", broken: "break", came: "come", went: "go", got: "get", took: "take", taken: "take", gave: "give", given: "give", slept: "sleep", lost: "lose", left: "leave" };

export function stem(w: string): string {
  if (IRREGULAR[w]) return IRREGULAR[w];
  if (/^us(e|es|ing)$/.test(w)) return "use";
  // Short words the rules below would cut to something else ("shoes" → "sho", then read as "show").
  if (/^(shoe|toe|hoe)s?$/.test(w)) return w.replace(/s$/, "");
  if (w.length <= 3 || /^\d/.test(w)) return w;
  let s = w;
  if (s.endsWith("ies") && s.length > 4) s = s.slice(0, -3) + "y";
  else if (s.endsWith("sses")) s = s.slice(0, -2);
  else if (s.endsWith("s") && !/(ss|us|is)$/.test(s)) s = s.slice(0, -1);
  if (s.endsWith("ing") && s.length > 5) s = s.slice(0, -3);
  else if (s.endsWith("ed") && s.length > 4) s = s.slice(0, -2);
  if (/([^aeiouslz])\1$/.test(s)) s = s.slice(0, -1);
  if (s.endsWith("e") && s.length > 3) s = s.slice(0, -1);
  return s;
}

function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      best = Math.min(best, v);
    }
    if (best > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length];
}

export interface Rewrite {
  from: string;
  to: string;
}

export interface Analysis {
  terms: string[];
  /** The customer's own word or phrase for each term, for display. */
  surface: Record<string, string>;
  corrections: Rewrite[];
  synonyms: Rewrite[];
  dropped: string[];
  /** The question after shorthand and split phrases were normalised, when that changed it. */
  rephrased?: string;
}

interface Phrase {
  seq: string[];
  canon: string;
}

interface Chunk {
  id: number;
  article: Article;
  heading: string | null;
  text: string;
  tf: Map<string, number>;
  len: number;
}

export interface Hit {
  articleId: string;
  title: string;
  heading: string | null;
  score: number;
  matched: string[];
  text: string;
}

export interface Reply {
  kind: AnswerKind;
  text: string;
  confidence: number;
  citations: Citation[];
  matched: string[];
  handoff: boolean;
  order?: OrderCard;
  /** What the confidence was computed from, for the retrieval details view. */
  signals?: Signals;
  /** Rules that changed the ranking or the confidence, in order, for the playground. */
  notes?: string[];
}

/** Per-question signals about the best article; confidence is a fitted function of these. */
export interface Signals {
  coverage: number;
  strength: number;
  /** How far the best article is ahead of the next one: log of the score ratio, 0..3. */
  margin: number;
  /** Share of the question's words that the help center never uses. */
  unknown: number;
  /** 1 when the question states an intent ("return", "repair") and the best section matches it, -1 when it doesn't, 0 without one. */
  intent: number;
}

export interface Explanation {
  analysis: Analysis;
  hits: Hit[];
  coverage: number;
  strength: number;
  confidence: number;
  reply: Reply;
}

const K1 = 1.2;
const B = 0.75;
const TITLE_WEIGHT = 2.5;
const HEADING_WEIGHT = 1.5;

/** Splits an article body into sections at "## " headings. */
export function sections(body: string): Array<{ heading: string | null; text: string }> {
  const out: Array<{ heading: string | null; text: string }> = [];
  let heading: string | null = null;
  let lines: string[] = [];
  const flush = () => {
    const text = lines.join("\n").trim();
    if (text) out.push({ heading, text });
  };
  for (const line of body.split("\n")) {
    const m = /^##\s+(.*)$/.exec(line);
    if (m) {
      flush();
      heading = m[1].trim();
      lines = [];
    } else lines.push(line);
  }
  flush();
  return out;
}

/** Sentences and bullet items of a section, in order. */
export function units(text: string): Array<{ text: string; bullet: boolean }> {
  const out: Array<{ text: string; bullet: boolean }> = [];
  for (const para of text.split(/\n\s*\n/)) {
    for (const line of para.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      if (t.startsWith("- ")) out.push({ text: t.slice(2).trim(), bullet: true });
      else for (const s of t.match(/(?:[^.!?]|[.!?](?!\s|$))+(?:[.!?]+|$)/g) ?? []) if (s.trim()) out.push({ text: s.trim(), bullet: false });
    }
  }
  return out;
}

export function createEngine(articles: Article[], synonymGroups: SynonymGroup[]) {
  const phrases = new Map<string, Phrase[]>();
  const vocab = new Map<string, number>();
  for (const g of synonymGroups) {
    const canonSeq = words(g.terms[0] ?? "").map(stem);
    if (!canonSeq.length) continue;
    const canon = canonSeq.join("_");
    for (const term of g.terms) {
      const seq = words(term).map(stem);
      if (!seq.length) continue;
      const list = phrases.get(seq[0]) ?? [];
      list.push({ seq, canon });
      list.sort((a, b) => b.seq.length - a.seq.length);
      phrases.set(seq[0], list);
      for (const w of seq) vocab.set(w, (vocab.get(w) ?? 0) + 1);
    }
  }

  /** A real word the help center doesn't use ("boots", "stakes"): never "corrected" into one it does. */
  const isRealWord = (w: string) =>
    REAL_WORDS.has(w) || [/s$/, /es$/, /ed$/, /d$/, /ing$/, /ly$/].some((r) => r.test(w) && REAL_WORDS.has(w.replace(r, ""))) || (/ing$/.test(w) && REAL_WORDS.has(w.replace(/ing$/, "e")));

  function analyse(text: string, correct: boolean): Analysis {
    // Questions only: drop what the customer says they don't mean.
    const negated = correct ? fold(text).replace(NEGATION, " ") : text;
    const normal = correct ? rephrase(negated) : text;
    const raw = words(normal);
    const corrections: Rewrite[] = [];
    let seq = raw.map((w) => ({ w, s: stem(w), stop: STOP.has(w) || (correct && FILLER.has(w)) }));
    if (correct) {
      seq = seq.map((t) => {
        if (t.stop || t.w.length < 4 || /\d/.test(t.w) || vocab.has(t.s) || isRealWord(t.w)) return t;
        const max = t.w.length >= 8 ? 2 : 1;
        let best: string | null = null;
        let bestD = max + 1;
        let bestF = 0;
        for (const [v, f] of vocab) {
          if (v[0] !== t.s[0] || Math.abs(v.length - t.s.length) > max) continue;
          const d = editDistance(t.s, v, max);
          if (d < bestD || (d === bestD && f > bestF)) {
            best = v;
            bestD = d;
            bestF = f;
          }
        }
        if (best && bestD <= max) {
          corrections.push({ from: t.w, to: best });
          return { ...t, s: best };
        }
        return t;
      });
    }
    const synonyms: Rewrite[] = [];
    const dropped: string[] = [];
    const terms: string[] = [];
    const surface: Record<string, string> = {};
    for (let i = 0; i < seq.length; ) {
      const cands = phrases.get(seq[i].s);
      let end = i;
      const hit = cands?.find((p) => {
        // A phrase may have small words in between: "send it back", "money to be back".
        let j = i;
        for (const [k, w] of p.seq.entries()) {
          let gap = 0;
          while (k > 0 && seq[j] && seq[j].s !== w && STOP.has(seq[j].w) && gap < 2) {
            j++;
            gap++;
          }
          if (seq[j]?.s !== w) return false;
          j++;
        }
        end = j;
        return true;
      });
      if (hit) {
        const span = seq.slice(i, end).filter((t, k) => k === 0 || !STOP.has(t.w) || hit.seq.includes(t.s));
        const from = seq.slice(i, end).map((t) => t.w).join(" ");
        // Only a real rewrite counts as a synonym, not a plural or a fixed typo of the same word.
        if (span.map((t) => t.s).join("_") !== hit.canon) synonyms.push({ from, to: hit.canon.replace(/_/g, " ") });
        terms.push(hit.canon);
        surface[hit.canon] ??= from;
        i = end;
        continue;
      }
      // Numbers the help center never mentions ("4 days", "180cm") say nothing about the topic.
      if (seq[i].stop || (correct && /^\d/.test(seq[i].w) && !vocab.has(seq[i].s))) dropped.push(seq[i].w);
      else {
        terms.push(seq[i].s);
        surface[seq[i].s] ??= seq[i].w;
      }
      i++;
    }
    return { terms, surface, corrections, synonyms, dropped, rephrased: correct && normal !== negated ? normal.replace(/\s+/g, " ").trim() : undefined };
  }

  const chunks: Chunk[] = [];
  const df = new Map<string, number>();
  const PRICE_TERM = analyse("price", false).terms[0];
  for (const article of articles) {
    const titleTerms = analyse(article.title, false).terms;
    for (const sec of sections(article.body)) {
      const tf = new Map<string, number>();
      const add = (terms: string[], w: number) => terms.forEach((t) => tf.set(t, (tf.get(t) ?? 0) + w));
      add(titleTerms, TITLE_WEIGHT);
      if (sec.heading) add(analyse(sec.heading, false).terms, HEADING_WEIGHT);
      add(analyse(sec.text, false).terms, 1);
      // A section that states amounts answers "how much": it counts as mentioning a price.
      if (AMOUNT.test(sec.text)) add([PRICE_TERM], 1);
      let len = 0;
      tf.forEach((v) => (len += v));
      chunks.push({ id: chunks.length, article, heading: sec.heading, text: sec.text, tf, len });
      for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    }
  }
  for (const article of articles) for (const w of words(`${article.title} ${article.body}`)) if (!STOP.has(w)) vocab.set(stem(w), (vocab.get(stem(w)) ?? 0) + 1);
  const articleTerms = new Map<string, Set<string>>();
  for (const c of chunks) {
    const set = articleTerms.get(c.article.id) ?? new Set<string>();
    c.tf.forEach((_, t) => set.add(t));
    articleTerms.set(c.article.id, set);
  }
  // Words in a section's article title and heading: what the section is named after.
  const nameTerms = new Map(chunks.map((c) => [c.id, new Set(analyse(`${c.article.title} ${c.heading ?? ""}`, false).terms)]));
  const titleTerms = new Map(articles.map((a) => [a.id, new Set(analyse(a.title, false).terms)]));
  const titleTermsOf = (a: Article) => titleTerms.get(a.id)!;
  const N = Math.max(1, chunks.length);
  const avgLen = chunks.reduce((s, c) => s + c.len, 0) / N || 1;
  const idf = (t: string) => {
    const n = df.get(t) ?? 0;
    return Math.log(1 + (N - n + 0.5) / (n + 0.5));
  };
  const maxIdf = idf("\u0000");

  function scoreChunk(c: Chunk, terms: string[]) {
    let score = 0;
    let found = 0;
    let total = 0;
    const matched: string[] = [];
    for (const t of terms) {
      const w = weightOf(t) * idf(t);
      total += w;
      const f = c.tf.get(t);
      if (!f) continue;
      matched.push(t);
      found += w;
      score += (w * f * (K1 + 1)) / (f + K1 * (1 - B + (B * c.len) / avgLen));
    }
    // Sections that answer more of the question rank above ones that repeat one word of it.
    return { score: total ? score * (0.6 + 0.4 * (found / total)) : 0, matched };
  }

  /** Intent words in a section's title and heading: "How long refunds take" is about refunds. */
  const subjectOf = new Map(chunks.map((c) => [c.id, [...new Set([...analyse(c.article.title, false).terms, ...(c.heading ? analyse(c.heading, false).terms : [])])].filter((t) => INTENT.has(t))]));

  function rank(terms: string[], k = 5) {
    const uniq = [...new Set(terms)];
    // A section about another intent than the question's ranks lower: "how long does shipping take" isn't about refunds.
    const offSubject = (c: Chunk) => {
      const subject = subjectOf.get(c.id)!;
      return subject.length && !subject.some((t) => uniq.includes(t)) ? 0.7 : 1;
    };
    return chunks
      .map((c) => {
        const r = scoreChunk(c, uniq);
        return { c, ...r, score: r.score * offSubject(c) };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  /**
   * Confidence combines two signals:
   * - coverage: how much of the question (weighted by IDF) the best article talks about. Words the
   *   help center never uses count fully against it; known words found elsewhere count half.
   * - strength: how strongly the best section matches, squashed into 0..1.
   */
  function signalsOf(terms: string[], ranked: Array<{ c: Chunk; score: number; matched: string[] }>): Signals {
    const top = ranked[0];
    const { coverage, strength } = confidenceOf(terms, top);
    const uniq = [...new Set(terms)];
    if (!top || !uniq.length) return { coverage, strength, margin: 0, unknown: 1, intent: 0 };
    const runnerUp = ranked.find((r) => r.c.article.id !== top.c.article.id);
    const margin = Math.min(3, Math.max(0, Math.log(top.score / Math.max(0.5, runnerUp?.score ?? 0))));
    const unknown = uniq.filter((t) => !df.has(t)).length / uniq.length;
    const intents = uniq.filter((t) => INTENT.has(t));
    const intent = !intents.length ? 0 : top.matched.some((t) => intents.includes(t)) ? 1 : -1;
    return { coverage, strength, margin, unknown, intent };
  }

  function confidenceOf(terms: string[], top: { c: Chunk; score: number } | undefined) {
    const uniq = [...new Set(terms)];
    if (!top || !uniq.length) return { coverage: 0, strength: 0, confidence: 0 };
    const inArticle = articleTerms.get(top.c.article.id)!;
    let covered = 0;
    let missing = 0;
    for (const t of uniq) {
      if (inArticle.has(t)) covered += weightOf(t) * idf(t);
      else if (df.has(t)) missing += weightOf(t) * idf(t) * 0.5;
      else missing += Math.min(1, weightOf(t)) * maxIdf;
    }
    const coverage = covered / (covered + missing);
    const strength = top.score / (top.score + 4);
    const lift = Math.min(1, Math.max(0, (strength - 0.35) / 0.3));
    const confidence = Math.min(1, coverage ** 1.2 * (0.2 + 0.8 * lift));
    return { coverage, strength, confidence };
  }

  /** Picks the sentences of a section that answer the question, keeping their order. */
  function compose(c: Chunk, terms: string[]): string {
    const us = units(c.text).map((u) => ({ ...u, score: scoreTerms(analyse(u.text, false).terms, terms) }));
    const bullets = us.filter((u) => u.bullet);
    const headingHit = c.heading ? analyse(c.heading, false).terms.some((t) => terms.includes(t)) : false;
    const pick = new Set<number>();
    if (bullets.length >= 2 && (headingHit || bullets.some((b) => b.score > 0))) {
      us.forEach((u, i) => {
        if (u.bullet) pick.add(i);
      });
      const lead = us.findIndex((u) => !u.bullet);
      if (lead >= 0 && lead < us.findIndex((u) => u.bullet)) pick.add(lead);
      const after = us.findLastIndex((u) => u.bullet);
      us.forEach((u, i) => i > after && !u.bullet && u.score > 0 && pick.add(i));
    } else {
      const ranked = us.map((u, i) => ({ i, s: u.score })).sort((a, b) => b.s - a.s || a.i - b.i);
      const best = ranked[0];
      if (!best || best.s === 0) [0, 1].forEach((i) => i < us.length && pick.add(i));
      else {
        pick.add(best.i);
        ranked.slice(1, 3).forEach((r) => r.s > 0 && pick.add(r.i));
        // A sentence that leads into the next one ("...:" or a short follow-up) reads better with it.
        if (us[best.i + 1] && !pick.has(best.i + 1) && pick.size < 3 && us[best.i + 1].text.length < 140) pick.add(best.i + 1);
      }
    }
    // Neighbouring sentences stay one paragraph; bullets and gaps start a new line.
    // A list without its own lead-in gets the section heading as one.
    let out = us[Math.min(...pick)]?.bullet && c.heading ? `${c.heading}:` : "";
    let prev = -2;
    for (const i of [...pick].sort((a, b) => a - b)) {
      const u = us[i];
      const joins = !u.bullet && prev === i - 1 && !us[prev].bullet;
      out += (out ? (joins ? " " : "\n") : "") + (u.bullet ? `- ${u.text}` : u.text);
      prev = i;
    }
    return out;
  }

  function scoreTerms(unitTerms: string[], q: string[]) {
    const set = new Set(unitTerms);
    return [...new Set(q)].reduce((s, t) => s + (set.has(t) ? idf(t) : 0), 0);
  }

  const cite = (c: Chunk): Citation => ({ articleId: c.article.id, title: c.article.title, heading: c.heading });

  function search(query: string, k = 5): Hit[] {
    const { terms } = analyse(query, true);
    return rank(terms, k).map((r) => ({ articleId: r.c.article.id, title: r.c.article.title, heading: r.c.heading, score: r.score, matched: r.matched, text: r.c.text }));
  }

  /** Searches articles rather than sections: one result per article, best section first. */
  function searchArticles(query: string, k = 6) {
    const seen = new Set<string>();
    return search(query, 30)
      .filter((h) => !seen.has(h.articleId) && seen.add(h.articleId))
      .slice(0, k);
  }

  function explain(question: string, opts: { threshold: number; orders?: Order[] }): Explanation {
    const analysis = analyse(question, true);
    const ranked = rank(analysis.terms);
    const conf = confidenceOf(analysis.terms, ranked[0]);
    const hits = ranked.map((r) => ({ articleId: r.c.article.id, title: r.c.article.title, heading: r.c.heading, score: r.score, matched: r.matched, text: r.c.text }));
    return { analysis, hits, ...conf, reply: respond(question, opts, analysis, ranked, conf.confidence) };
  }

  function answer(question: string, opts: { threshold: number; orders?: Order[] }): Reply {
    const analysis = analyse(question, true);
    const ranked = rank(analysis.terms);
    return respond(question, opts, analysis, ranked, confidenceOf(analysis.terms, ranked[0]).confidence);
  }

  function respond(question: string, opts: { threshold: number; orders?: Order[] }, analysis: Analysis, ranked: ReturnType<typeof rank>, confidence: number): Reply {
    const base = { citations: [] as Citation[], matched: analysis.terms.map((t) => analysis.surface[t] ?? t), handoff: false };
    const content = analysis.terms;
    const trackChunk = chunks.find((c) => c.article.id === "track-order");

    const orderNo = ORDER_NO.exec(question);
    if (orderNo) {
      const number = `NF-${orderNo[1]}`;
      const order = opts.orders?.find((o) => o.number === number);
      if (!order) return { ...base, kind: "clarify", confidence: 1, text: `I couldn't find an order with the number ${number}. Please check the confirmation email, the number starts with NF followed by five digits.` };
      const card: OrderCard = { number: order.number, status: order.status, items: order.items, carrier: order.carrier, eta: order.eta, placedAt: order.placedAt };
      return { ...base, kind: "order", confidence: 1, order: card, text: ORDER_TEXT[order.status], citations: trackChunk ? [cite(trackChunk)] : [] };
    }

    if (HUMAN.test(question)) return { ...base, kind: "handoff", confidence: 1, handoff: true, text: "" };

    if (IDENTITY.test(question))
      return { ...base, kind: "greeting", confidence: 1, text: "I'm Northfold's virtual assistant. I answer from our help center, show you the article I used, and pass you to a person when I'm not sure." };

    if (JOBS.test(question))
      return { ...base, kind: "clarify", confidence: 0, text: "I can only help with orders, shipping, returns and our gear. Open roles at Northfold are listed at northfold.example/careers." };

    if (WEATHER.test(question))
      return { ...base, kind: "clarify", confidence: 0, text: "I can't check the weather, sorry. I can help with orders, shipping, returns, sizing and choosing gear for the conditions you expect." };

    if (OTHER_LANGUAGE.test(question))
      return { ...base, kind: "clarify", confidence: 0, text: "Sorry, I can only answer in English for now. Could you ask again in English? If you prefer, type “talk to a person” and the team will reply by email." };

    // "Do you ship to Turkey?": answer from the country list instead of guessing.
    const lower = fold(question);
    const shipping = SHIP_WORDS.test(question) || /\b(to|in)\b/.test(lower);
    const state = US_STATES.find((c) => new RegExp(`\\b${c}\\b`).test(lower));
    const yes = SHIPS_TO.find((c) => new RegExp(`\\b${fold(c)}\\b`).test(lower)) ?? (state && "united states");
    const no = NOT_YET.find((c) => new RegExp(`\\b${fold(c)}\\b`).test(lower));
    const intl = chunks.find((c) => c.article.id === "international-shipping" && !c.heading) ?? chunks.find((c) => c.article.id === "international-shipping");
    if (SHIP_WORDS.test(question) && shipping && (yes || no) && intl) {
      const country = titleCase(no ?? yes!);
      const domestic = yes && ["united states", "usa", "us", "america"].includes(yes);
      const text = no
        ? `We don't ship to ${country} yet. We ship to the US, Canada, the United Kingdom, the European Union, Norway, Switzerland, Australia, New Zealand, Singapore, Japan and the United Arab Emirates, and add countries a few times a year.`
        : domestic
          ? "Yes, we ship everywhere in the United States. Standard shipping takes 3 to 5 business days and is free on orders over $75, otherwise $6.95."
          : `Yes, we ship to ${country}. International orders arrive in 5 to 10 business days, and shipping is free over $150, otherwise a flat $19.`;
      // A US address is answered from the domestic article, so the source matches the answer.
      const us = domestic && (chunks.find((c) => c.article.id === "shipping-times" && /delivery options/i.test(c.heading ?? "")) ?? chunks.find((c) => c.article.id === "shipping-times"));
      return { ...base, kind: "answer", confidence: 1, text, citations: [cite(us || intl)], matched: [country] };
    }

    // Prices and stock of single products live on the product pages, not in the help center,
    // unless the question clearly matches an article about other things ("how much credit for used gear").
    const policyMatch = ranked[0] && confidence >= opts.threshold && ranked[0].matched.filter((t) => t !== "pric").length >= 2;
    if (PRICE.test(question) && !POLICY_WORDS.test(question) && !policyMatch)
      return { ...base, kind: "clarify", confidence: 1, text: "I can't see live prices or stock. The product page at northfold.example shows the current price, sizes and availability. I can help with shipping, returns, sizing or warranty questions." };

    if (THANKS.test(question) && content.every((t) => THANKS_TERMS.has(t)))
      return { ...base, kind: "thanks", confidence: 1, text: "You're welcome! Is there anything else I can help with?" };

    if (!content.length) {
      if (GREETING.test(question.trim())) return { ...base, kind: "greeting", confidence: 1, text: "Hi! Ask me anything about orders, returns, sizing or our warranty." };
      return { ...base, kind: "clarify", confidence: 0, text: "Could you tell me a little more? For example: “How long do refunds take?” or “Do you ship to Canada?”" };
    }

    if (MY_ORDER.test(question) && (content.includes("track") || /\b(where|when|status)/i.test(question))) {
      return {
        ...base,
        kind: "clarify",
        confidence: 1,
        text: "I can check that for you. What's your order number? It starts with NF and is in your confirmation email.",
        citations: trackChunk ? [cite(trackChunk)] : [],
      };
    }

    // Each rule below may move a close section to the top; what it did is kept for the playground.
    const notes: string[] = [];
    // Shorthand expanded ("hw do u…" → "how do you…") so the question-shape rules see it.
    const asked = analysis.rephrased ?? question;
    const where = (r: (typeof ranked)[number]) => r.c.article.title + (r.c.heading ? ` › ${r.c.heading}` : "");
    const promote = (i: number, why: string) => {
      notes.push(`${why}: ${where(ranked[i])} moved above ${where(ranked[0])}`);
      ranked = [ranked[i], ...ranked.filter((_, j) => j !== i)];
      confidence = confidenceOf(analysis.terms, ranked[0]).confidence;
    };

    // "How do I return…" wants the step-by-step article when it is a close match.
    if (HOW_TO.test(asked) && ranked[0] && !ranked[0].c.article.title.startsWith("How to")) {
      const howTo = ranked.findIndex((r) => r.c.article.title.startsWith("How to") && r.score >= ranked[0].score * 0.45);
      if (howTo > 0) promote(howTo, "“How do I…” question");
    }

    // "Is shipping free?" means the US unless the question names a country or says international.
    if (ranked[0]?.c.article.id === "international-shipping" && !yes && !no && !content.some((t) => ["international", "duti"].includes(t))) {
      const domestic = ranked.findIndex((r) => r.c.article.id === "shipping-times" && r.score >= ranked[0].score * 0.5);
      if (domestic > 0) promote(domestic, "No country named, so US shipping");
    }

    // The customer's intent ("repair", "return", "cancel") outweighs a rarer side word ("down" in
    // "patch a hole in my down jacket"): prefer a close section that matches the intent.
    const intents = content.filter((t) => INTENT.has(t));
    const said = intents.map((t) => `“${analysis.surface[t] ?? t}”`).join(", ");
    if (intents.length && ranked[0] && !ranked[0].matched.some((t) => intents.includes(t))) {
      const byIntent = ranked.findIndex((r) => r.matched.some((t) => intents.includes(t)) && r.score >= ranked[0].score * NAMED_RATIO);
      if (byIntent > 0) promote(byIntent, `Intent ${said}`);
    }
    // A section named after the intent ("Exchanges…", "Where is my refund?") beats one that only mentions
    // it, unless that one matches clearly more of the question ("money back for a used tent" is about used gear).
    const named = (r: (typeof ranked)[number]) => intents.some((t) => nameTerms.get(r.c.id)!.has(t));
    if (intents.length && ranked[0] && !named(ranked[0])) {
      const first = ranked[0];
      const i = ranked.findIndex((r) => named(r) && r.score >= first.score * NAMED_RATIO && new Set(r.matched).size >= new Set(first.matched).size - 1);
      if (i > 0) promote(i, `Section named after ${said}`);
    }

    // "How much…" wants the section of the best article that states an amount, when it scores close.
    if (content.includes(PRICE_TERM) && ranked[0] && !AMOUNT.test(ranked[0].c.text)) {
      const priced = ranked.findIndex((r) => r.c.article.id === ranked[0].c.article.id && AMOUNT.test(r.c.text) && r.score >= ranked[0].score * 0.8);
      if (priced > 0) promote(priced, "Price question, so the section with amounts");
    }

    // "How do I…" wants the steps in the article's opening section, unless it asks about one of the
    // article's specific cases ("return in store", "return a gift").
    if (HOW_TO.test(asked) && ranked[0]?.c.heading) {
      const lead = ranked.findIndex((r) => r.c.article.id === ranked[0].c.article.id && !r.c.heading && r.score >= ranked[0].score * 0.6);
      const own = [...nameTerms.get(ranked[0].c.id)!].filter((t) => !titleTermsOf(ranked[0].c.article).has(t));
      if (lead > 0 && !own.some((t) => content.includes(t))) promote(lead, "“How do I…” wants the steps");
    }

    const top = ranked[0];
    // Nothing in the question matches the help center at all (gibberish, off-topic): ask again rather than open a ticket.
    if (!top || (confidence < 0.12 && !top.matched.length))
      return { ...base, kind: "clarify", confidence, text: "I'm not sure I understood. I can help with orders, shipping, returns, sizing and warranty. Try “How do I start a return?”, or type “talk to a person”." };
    // A clear winner: the best article matches strongly, covers a good part of the question and
    // scores well above any other article, so a few words the help center never uses ("stuck", "half")
    // aren't enough to hand off. A weaker match also counts when it is at least twice as strong as any
    // other article and doesn't miss the intent the customer stated.
    const signals = signalsOf(analysis.terms, ranked);
    if (confidence < opts.threshold) {
      const { coverage, strength, margin, intent } = signals;
      const clear = (strength >= 0.5 && coverage >= 0.4 && margin >= Math.log(1.5)) || (strength >= 0.4 && coverage >= 0.3 && margin >= Math.log(2) && intent >= 0);
      if (clear) {
        notes.push(`Clear winner: ${Math.exp(margin).toFixed(1)}× the score of the next article, confidence raised to ${Math.round(CLEAR_WINNER * 100)}%`);
        confidence = Math.max(confidence, CLEAR_WINNER);
      }
    }
    if (confidence < opts.threshold) return { ...base, kind: "handoff", confidence, handoff: true, text: "", citations: [cite(top.c)], signals, notes };

    const citations = [cite(top.c)];
    const second = ranked.find((r) => r.c.article.id !== top.c.article.id);
    if (second && second.score >= top.score * 0.75) citations.push(cite(second.c));
    return { ...base, kind: "answer", confidence, text: compose(top.c, analysis.terms), citations, matched: top.matched.map((t) => analysis.surface[t] ?? t), signals, notes };
  }

  return { analyse, search, searchArticles, answer, explain, chunkCount: chunks.length };
}

export type Engine = ReturnType<typeof createEngine>;

const ORDER_TEXT: Record<Order["status"], string> = {
  processing: "Your order is being packed and will ship within one business day. You'll get a tracking link by email as soon as it leaves the warehouse.",
  shipped: "Good news, your order is on its way.",
  "out-for-delivery": "Your order is out for delivery today.",
  delivered: "This order was delivered. If you can't find it, check around the delivery address and with neighbors, and tell me if it still hasn't turned up by the end of the next business day.",
};
