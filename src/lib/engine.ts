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

const GREETING = /^(hi|hello|hey|hiya|good (morning|afternoon|evening)|yo)\b/i;
const THANKS = /\b(thanks|thank you|thx|cheers|perfect|awesome|great|got it|that helps|helpful)\b/i;
/** Word stems that may appear in a plain "thanks" message without making it a question. */
const THANKS_TERMS = new Set(["great", "perfect", "awesom", "helpful", "help", "good", "nic", "cool", "brilliant", "wonderful", "appreciat", "lovely"]);
const HUMAN = /\b(human|agent|representative|operator|real person|a person|someone real|live (chat|support)|talk to (someone|somebody|support|the team|a person)|speak (to|with))\b/i;
const ORDER_NO = /\bNF[-\s]?(\d{5})\b/i;
const MY_ORDER = /\bmy (order|package|parcel|delivery|shipment)\b/i;

export const fold = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "");

export const words = (s: string) => fold(s).split(/[^a-z0-9]+/).filter(Boolean);

/** A deliberately small suffix stripper: enough to match plurals and verb forms. */
export function stem(w: string): string {
  if (/^us(e|es|ing)$/.test(w)) return "use";
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

  function analyse(text: string, correct: boolean): Analysis {
    const raw = words(text);
    const corrections: Rewrite[] = [];
    let seq = raw.map((w) => ({ w, s: stem(w), stop: STOP.has(w) }));
    if (correct) {
      seq = seq.map((t) => {
        if (t.stop || t.w.length < 5 || /\d/.test(t.w) || vocab.has(t.s)) return t;
        const max = t.w.length >= 9 ? 2 : 1;
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
      const hit = cands?.find((p) => p.seq.every((w, k) => seq[i + k]?.s === w));
      if (hit) {
        const from = seq.slice(i, i + hit.seq.length).map((t) => t.w).join(" ");
        // Only a real rewrite counts as a synonym, not a plural or a fixed typo of the same word.
        if (seq.slice(i, i + hit.seq.length).map((t) => t.s).join("_") !== hit.canon) synonyms.push({ from, to: hit.canon.replace(/_/g, " ") });
        terms.push(hit.canon);
        surface[hit.canon] ??= from;
        i += hit.seq.length;
        continue;
      }
      if (seq[i].stop) dropped.push(seq[i].w);
      else {
        terms.push(seq[i].s);
        surface[seq[i].s] ??= seq[i].w;
      }
      i++;
    }
    return { terms, surface, corrections, synonyms, dropped };
  }

  const chunks: Chunk[] = [];
  const df = new Map<string, number>();
  for (const article of articles) {
    const titleTerms = analyse(article.title, false).terms;
    for (const sec of sections(article.body)) {
      const tf = new Map<string, number>();
      const add = (terms: string[], w: number) => terms.forEach((t) => tf.set(t, (tf.get(t) ?? 0) + w));
      add(titleTerms, TITLE_WEIGHT);
      if (sec.heading) add(analyse(sec.heading, false).terms, HEADING_WEIGHT);
      add(analyse(sec.text, false).terms, 1);
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
  const N = Math.max(1, chunks.length);
  const avgLen = chunks.reduce((s, c) => s + c.len, 0) / N || 1;
  const idf = (t: string) => {
    const n = df.get(t) ?? 0;
    return Math.log(1 + (N - n + 0.5) / (n + 0.5));
  };
  const maxIdf = idf("\u0000");

  function scoreChunk(c: Chunk, terms: string[]) {
    let score = 0;
    const matched: string[] = [];
    for (const t of terms) {
      const f = c.tf.get(t);
      if (!f) continue;
      matched.push(t);
      score += (idf(t) * f * (K1 + 1)) / (f + K1 * (1 - B + (B * c.len) / avgLen));
    }
    return { score, matched };
  }

  function rank(terms: string[], k = 5) {
    const uniq = [...new Set(terms)];
    return chunks
      .map((c) => ({ c, ...scoreChunk(c, uniq) }))
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
  function confidenceOf(terms: string[], top: { c: Chunk; score: number } | undefined) {
    const uniq = [...new Set(terms)];
    if (!top || !uniq.length) return { coverage: 0, strength: 0, confidence: 0 };
    const inArticle = articleTerms.get(top.c.article.id)!;
    let covered = 0;
    let missing = 0;
    for (const t of uniq) {
      if (inArticle.has(t)) covered += idf(t);
      else if (df.has(t)) missing += idf(t) * 0.5;
      else missing += maxIdf;
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

    const top = ranked[0];
    if (!top || confidence < opts.threshold) return { ...base, kind: "handoff", confidence, handoff: true, text: "", citations: top ? [cite(top.c)] : [] };

    const citations = [cite(top.c)];
    const second = ranked.find((r) => r.c.article.id !== top.c.article.id);
    if (second && second.score >= top.score * 0.75) citations.push(cite(second.c));
    return { ...base, kind: "answer", confidence, text: compose(top.c, analysis.terms), citations, matched: top.matched.map((t) => analysis.surface[t] ?? t) };
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
