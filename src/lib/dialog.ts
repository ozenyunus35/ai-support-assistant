import { HUMAN, NOT_YET, OTHER_LANGUAGE, ORDER_NO, SHIPS_TO, US_STATES, fold, rephrase, titleCase, type Engine } from "./engine";
import type { AnswerKind, Citation, Order, OrderCard } from "./types";

/**
 * The conversation layer in front of the retrieval engine. It runs in the browser like the rest of the demo:
 *   1. facts: what the customer states (order number, country, days, used/unused, amounts), kept as numbers
 *   2. requests: the message is split by meaning, each request gets one intent; negated ones are dropped
 *   3. context: facts and the topic carried over from earlier messages of the same conversation
 *   4. policy rules decide what the facts mean (60 and 30 day windows, free shipping thresholds, order status)
 *   5. anything the rules do not cover goes to retrieval over the help center, as before
 * The widget and the playground call the same `respondTo`, so they cannot disagree.
 */

/** The numbers the rules below apply. A test checks that the help center text still states the same ones. */
export const POLICY = {
  refundDays: 60,
  creditDays: 30,
  usFreeOver: 75,
  intlFreeOver: 150,
  intlFlat: 19,
  usStandard: 6.95,
  labelFee: 6,
  editMinutes: 60,
  reportDays: 14,
  refundReviewBusinessDays: 10,
};

export const HANDOFF_REQUESTED = "I'm connecting you with a teammate. They'll reply right here.";

export type Topic = "ship" | "return" | "refund" | "exchange" | "order" | "warranty" | "other";
export type Speed = "standard" | "express" | "overnight";

export interface DaysFact {
  n: number;
  /** What the day count is measured from, when the customer said. */
  basis: "delivery" | "order" | "return-sent" | "warehouse" | "unknown";
  kind: "business" | "calendar";
}

/** What the customer stated. Every field is optional; old stored conversations have none of them. */
export interface Facts {
  orderNo?: string;
  country?: string;
  speed?: Speed;
  poBox?: boolean;
  amount?: number;
  days?: DaysFact;
  used?: boolean;
  defect?: boolean;
  animal?: boolean;
  finalSale?: boolean;
  payment?: string;
  /** The customer says the order has already shipped. */
  shipped?: boolean;
  /** The customer sounds frustrated; the reply opens with an apology. */
  annoyed?: boolean;
}

export interface DialogContext extends Facts {
  topic?: Topic;
  /** What the assistant last asked for, so a short answer ("unused") is read as that answer. */
  awaiting?: string;
}

export interface Part {
  intent: string;
  request: string;
  status: "answered" | "clarify" | "handoff";
  method: "rule" | "retrieval" | "lookup" | "smalltalk";
  text: string;
  citations: Citation[];
  /** Retrieval match, only for parts answered by searching the help center. */
  confidence?: number;
  /** The policy rule that decided the answer. */
  rule?: string;
  missing?: string[];
  order?: OrderCard;
  reason?: "requested" | "low-confidence";
}

export interface DialogReply {
  kind: AnswerKind;
  text: string;
  handoff: boolean;
  handoffReason?: "requested" | "low-confidence";
  confidence: number;
  citations: Citation[];
  matched: string[];
  order?: OrderCard;
  parts: Part[];
  facts: Facts;
  /** Phrases the customer said they do NOT mean. */
  negated: string[];
  /** What was taken from earlier messages. */
  contextUsed: string[];
  missing: string[];
  context: DialogContext;
  /** Requests that got an answer or a clarifying question, out of all the requests found. */
  covered: number;
  total: number;
  /** How the reply was decided: policy rules, retrieval over the help center, or both. */
  method: "rule" | "retrieval" | "mixed";
  notes: string[];
}

interface Opts {
  threshold: number;
  orders?: Order[];
  now?: number;
}

const cs = (...c: Array<Citation | undefined>) => c.filter((x): x is Citation => !!x);

// ---------------------------------------------------------------- facts

const NEG = /\b(?:do not|don'?t|dont|no need to|not asking (?:about|for)|i do not want|i don'?t want|not interested in|stop|forget(?: about)?|skip|never mind|leave out)\b[^,;.!?]*|\bnot (?:an?|the) [^,;.!?]*/giu;

/** Splits off what the customer says they do not mean: "Do not track NF-20481", "not asking about sizing". */
function stripNegated(text: string) {
  const negated: string[] = [];
  const kept = text.replace(NEG, (m) => {
    negated.push(m.trim());
    return " ";
  });
  return { kept: kept.replace(/\s+/g, " ").trim(), negated };
}

const COUNTRY_LIST = [...SHIPS_TO, ...NOT_YET].filter((c) => !["us", "america"].includes(c));

function findCountry(lower: string): string | undefined {
  const state = US_STATES.find((c) => new RegExp(`\\b${c}\\b`).test(lower));
  if (state) return "united states";
  if (/\b(the us|usa|united states|to america)\b/.test(lower)) return "united states";
  return COUNTRY_LIST.find((c) => new RegExp(`\\b${fold(c)}\\b`).test(lower));
}

const NUM_WORD: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

function findDays(raw: string): DaysFact | undefined {
  const lower = fold(raw);
  if (/\byesterday\b/.test(lower)) return { n: 1, basis: basisAround(lower, lower.indexOf("yesterday")), kind: "calendar" };
  const m = /\b(\d{1,3}|a|an|one|two|three|four|five|six)[\s-]*(business |working |calendar )?(day|week)s?\b(?!\s*(?:business|working))/.exec(lower);
  if (!m) return undefined;
  const base = /^\d/.test(m[1]) ? Number(m[1]) : NUM_WORD[m[1]];
  if (!base) return undefined;
  // "a day" is rarely a duration; "a week" is.
  if (m[3] === "day" && !/^\d/.test(m[1]) && !/ago|since/.test(lower.slice(m.index))) return undefined;
  const n = base * (m[3] === "week" ? 7 : 1);
  return { n, basis: basisAround(lower, m.index), kind: /business|working/.test(m[2] ?? "") ? "business" : "calendar" };
}

/** What a day count is measured from, read from the words just before it. */
function basisAround(lower: string, at: number): DaysFact["basis"] {
  const before = lower.slice(Math.max(0, at - 70), at + 40);
  if (/warehouse|you (?:got|received|have) (?:my|the) return|delivered to you|reached you|arrived at your/.test(before)) return "warehouse";
  if (/\breturned\b|sent (?:it |them )?back|mailed (?:it )?back|shipped (?:it )?back|dropped (?:it )?off/.test(before)) return "return-sent";
  if (/arrived|delivered|received|\bgot\b|came|showed up|delivery/.test(before)) return "delivery";
  if (/ordered|bought|purchased|placed|order/.test(before)) return "order";
  return "unknown";
}

const UNUSED = /\b(unused|unopened|(?:still )?sealed|never (?:used|opened|worn|taken)|not (?:been )?(?:used|worn|opened)|unworn|brand new|tags (?:are )?(?:still )?on|still (?:in|has) (?:the |its )?(?:packaging|box)|haven'?t (?:used|worn|opened))\b/;
const USED = /\b(used|wore|worn|wear|slept in|took (?:it|them) camping|one weekend|once|a few times|tried (?:it|them) on outside)\b/;

export function extractFacts(text: string): Facts {
  const raw = rephrase(text);
  const lower = fold(raw);
  const f: Facts = {};
  const no = ORDER_NO.exec(raw);
  if (no) f.orderNo = `NF-${no[1]}`;
  const country = findCountry(lower);
  if (country) f.country = country;
  const speed = /\b(overnight|next day)\b/.test(lower) ? "overnight" : /\bexpress|2 day|two day\b/.test(lower) ? "express" : /\bstandard\b/.test(lower) ? "standard" : undefined;
  if (speed) f.speed = speed;
  if (/\bp\.?o\.? ?box(?:es)?\b/.test(lower)) f.poBox = true;
  const amount = /[$€£]\s?(\d[\d,]*(?:\.\d+)?)/.exec(raw) ?? /\b(\d[\d,]*(?:\.\d+)?)\s*(?:dollars|usd|bucks)\b/i.exec(raw);
  if (amount) f.amount = Number(amount[1].replace(/,/g, ""));
  const days = findDays(raw);
  if (days) f.days = days;
  if (UNUSED.test(lower)) f.used = false;
  else if (USED.test(lower) && !/\bhow (?:do|can) i use\b/.test(lower)) f.used = true;
  if (/\b(zipper|zip|seam|buckle|pole|stitching|strap|sole|valve)\b.*\b(broke|broken|snapped|split|failed|ripped|came apart|stopped working)\b|\b(broke|snapped|split|failed)\b|\bdefect(?:ive)?\b|\bfaulty\b|\bstopped working\b/.test(lower) && !/arrived (?:damaged|broken)|damaged (?:in|during) (?:transit|shipping)/.test(lower)) f.defect = true;
  if (/\b(dog|cat|puppy|chew(?:ed)?|animal|rodent|mouse|mice|squirrel|bear)\b/.test(lower)) f.animal = true;
  if (/final sale/.test(lower)) f.finalSale = true;
  const pay = /\b(paypal|klarna|apple pay|google pay|amex|visa|mastercard|credit card|debit card|card|gift card|store credit)\b/.exec(lower);
  if (pay) f.payment = pay[1];
  if (/\b(already|has) (shipped|been shipped)\b|\bshipped already\b|\bhas shipped\b/.test(lower)) f.shipped = true;
  if (/\b(annoyed|frustrat\w*|angry|upset|fed up|furious|unhappy|disappointed)\b/.test(lower)) f.annoyed = true;
  return f;
}

// ---------------------------------------------------------------- requests

interface Request {
  text: string;
  intent: string;
}

/** True when a request has words of its own left after the negated part is cut ("I don't need tracking" leaves only "I"). */
const meaningful = (text: string) => stripNegated(text).kept.toLowerCase().replace(/\b(?:i|im|i'm|am|we|you|please|just|and|so|but|ok|okay|now|also|then|well|oh)\b/g, " ").replace(/[^a-z0-9]/g, "").length > 0;

const STARTER = "can|could|do|does|did|how|what|where|when|is|are|will|should|i|my|please|why|would|may";

/** Splits a message into requests: sentences, "X and can I Y", and lists "A, B and C" when each piece asks for something else. */
function splitRequests(text: string): string[] {
  const sentences = text.split(/(?<=[.?!])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  const out: string[] = [];
  const REAL = (i: string) => !["other", "statement", "filler"].includes(i);
  for (const s of sentences) {
    const pieces = s.split(new RegExp(`\\s*(?:,|;|\\+)?\\s+(?:and|also|plus)\\s+(?=(?:${STARTER})\\b)|\\s*;\\s*`, "i")).map((p) => p.trim()).filter(Boolean);
    for (const piece of pieces) {
      // "jacket too small, one item is missing, need it before Friday": split further only if each piece is its own request.
      const all = piece.split(/,\s*(?:and\s+)?/).map((p) => p.trim());
      const commas = all.filter((p) => p.split(/\s+/).length >= 3);
      if (commas.length > 1 && commas.length === all.length) {
        const intents = commas.map((p) => intentOf(p, {}));
        if (intents.every(REAL) && new Set(intents).size === intents.length) {
          out.push(...commas);
          continue;
        }
      }
      out.push(piece);
    }
  }
  return out;
}

const SMALLTALK = /^\W*(?:(?:hi|hello|hey|hiya)\b[\s,!.]*)?(?:how are you(?: doing)?|how'?s it going|how do you do)\b/i;
const INJECTION = /ignore (?:all |any )?(?:previous|prior|above|your) (?:instructions|rules)|disregard (?:all |your )?(?:previous|prior|instructions)|system prompt|pretend (?:you|to)|you are now/i;
const ACTION_REFUND = /\brefund\b[^.?!]*\b(?:now|immediately|right now|right away)\b|\btransaction (?:id|number)|\bconfirmation number\b|\b(?:process|issue) (?:a |my |the )?refund\b/i;
const CANCEL = /\bcancel\w*\b/i;
const NOT_RECEIVED = /\b(?:says|shows|marked|marks|tracking says|tracking shows|status says)?[^.?!]*\bdelivered\b[^.?!]*\b(?:never|not|haven'?t|hasn'?t|didn'?t|isn'?t|can'?t find|no sign|but no|but i)\b|\bnever (?:received|got|arrived)\b|\bdelivered\b[^.?!]*\bneighbou?rs?\b|\bneighbou?rs?\b[^.?!]*\bdelivered\b|\b(?:isn'?t|not|wasn'?t) (?:here|there|at my)\b[^.?!]*\bdelivered\b/i;
const REFUND_DELAY = /\b(?:returned|sent (?:it |them )?back|mailed (?:it |them )?back|shipped (?:it |them )?back|warehouse (?:received|got)|(?:delivered|arrived|reached|returned) (?:to|at) (?:your|the) warehouse|you (?:received|got) my return)\b[^.?!]*\b(?:no refund|refund|money)\b|\b(?:no|still no|haven'?t (?:got|received|had)) (?:refund|email)\b[^.?!]*\b(?:returned|return|warehouse)\b|\brefund\b[^.?!]*\b(?:hasn'?t|has not|not|still not|not yet|never)\b[^.?!]*\b(?:arrived|come|here|received|show|land)/i;
const MSG_RETURNED = /\b(?:returned|sent (?:it |them )?back|mailed (?:it |them )?back|shipped (?:it |them )?back|warehouse (?:received|got)|(?:delivered|arrived|reached) (?:to|at) (?:your|the) warehouse|(?:received|got) my return)\b/i;
const MSG_NO_REFUND = /\b(?:no refund|refund (?:hasn'?t|has not|still|not)|haven'?t (?:got|received|had) (?:my |a |the )?(?:refund|money)|no (?:refund )?email|still waiting)\b/i;
const MISSING = /\bmissing\b|\bonly \d+ of (?:the )?\d+\b|\b\d+ of (?:the )?\d+ items?\b|\bdidn'?t (?:come|arrive|get)\b|\bforgot (?:the|to)\b|\bleft out\b/i;
const SIZE_SWAP = /\btoo (?:small|big|large|tight|loose|short)\b|\b(?:larger|bigger|smaller|different|another|other|next) size\b|\bsize (?:up|down)\b|\btoo (?:small|big|large|tight|loose)\b.*\b(?:swap|exchange|replace)\b/i;
const EXCHANGE = /\b(?:exchange|swap|trade it for|replace it with)\b/i;
const DEADLINE = /\b(?:before|by) (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next week|the weekend)\b|\bneed (?:it|them) (?:by|before)\b/i;
const RETURN = /\breturn(?:ing)?\b|\bsend (?:it|this|them|that)? ?back\b|\bmoney back\b|\bcash refund\b|\bstore credit\b/i;
const RETURN_INFO = /\bhow (?:do|does|can|should) (?:i |we |a |the |your |an )?(?:returns?|returning|return an item|return something)(?: work)?\b|\b(?:return|returns) (?:policy|process|rules)\b|\bhow to return\b|\bhow (?:do|does) (?:a |the |your )?returns? work\b|\bhow returns work\b/i;
const STOCK = /\b(?:stock|in stock|price|cost|how much)\b/i;
const PRODUCT = /\b(?:ridge|summit|meadow|trailhead|alpine|shell|pack|tent|jacket|bag|stove|boots?)\b/i;
const SHIPPING = /\b(?:ship|ships|shipping|deliver|delivery|send)\b|\b(?:express|overnight|standard|po box|apo|fpo)\b/i;
const TRACK = /\b(?:track|tracking|where is|where'?s|status of)\b/i;

/** The intent of one request; "other" means the rules have nothing to add and retrieval answers it. */
function intentOf(text: string, ctx: DialogContext): string {
  const t = rephrase(text);
  const { kept } = stripNegated(t);
  const lower = fold(kept);
  const f = extractFacts(kept);
  if (!lower.replace(/\W/g, "")) return "other";
  if (/^(?:so |and |ok |okay )?(?:what (?:should|can|do|shall|would) (?:i|we) do(?: now| next)?|what now|what next|what are my options|what can you do|what can be done|what do you suggest|any ideas|any advice|help)\W*$/i.test(lower.trim())) return "filler";
  if (INJECTION.test(t)) return "injection";
  if (HUMAN.test(t)) return "human";
  if (SMALLTALK.test(t)) return "smalltalk";
  if (ACTION_REFUND.test(kept)) return "refund-action";
  if (CANCEL.test(kept)) return "cancel";
  if (NOT_RECEIVED.test(kept)) return "not-received";
  if (REFUND_DELAY.test(kept)) return "refund-delay";
  if (/\b(?:lifetime )?warranty\b/.test(lower) && f.animal) return "warranty";
  if (f.animal && (f.defect || /chew|damage|broke|ripped|tore|torn/.test(lower))) return "warranty";
  if (MISSING.test(kept) && !/arrived damaged/.test(lower)) return "missing";
  if (SIZE_SWAP.test(kept) && !/what size|which size|size chart|how does .* fit/.test(lower)) return "size-swap";
  if (EXCHANGE.test(kept)) return "exchange";
  if (DEADLINE.test(kept)) return "deadline";
  if (STOCK.test(kept) && PRODUCT.test(kept) && /\b(?:stock|current|live|colou?r|in (?:blue|green|red|black|sage))\b/.test(lower) && !/\b(?:shipping|delivery|return|refund|exchange|club|rental|repair)\b/.test(lower)) return "live-data";
  if (RETURN_INFO.test(lower) && !f.days && f.used === undefined && !f.finalSale && !f.defect) return "return-info";
  if (/\bdo you (?:have|carry|stock)\b[^?.!]*\bin stock\b/.test(lower)) return "live-data";
  const returnish = RETURN.test(kept) && (f.days || f.used !== undefined || f.finalSale || f.defect || /\b(?:cash|credit|still|can i|could i|eligible|allowed)\b/.test(lower) || (ctx.topic === "return" && /\bit\b/.test(lower)));
  if (returnish) return "return";
  if (f.finalSale && !SHIPPING.test(kept)) return "return";
  if (/\b(?:vat|duties|duty|customs|import (?:fees|taxes|duties))\b/.test(lower) && (f.country || ctx.country || ctx.topic === "ship")) return "ship";
  if (SHIPPING.test(kept) && (f.country || f.speed || f.poBox || f.amount !== undefined || /\bship(?:s|ping)? to\b|\bdo you (?:ship|deliver)\b/.test(lower))) return "ship";
  if (f.orderNo && !TRACK.test(kept)) {
    const rest = lower.replace(/\bnf[-\s]?\d{5}\b/g, " ").replace(/\b(?:its?|it is|my|order|number|is|the|here|this|that|ok|okay|sure|yes|yeah|so|hi|hello|hey|siparisim|nerede|please|thanks|thank|you)\b|[^a-z]/g, " ").trim();
    if (!rest) return "lookup";
  }
  if (f.orderNo && TRACK.test(kept)) return "lookup";
  // A short follow-up with only a fact in it continues the last topic: "What about Germany?", "And overnight?", "It's unused".
  const content = lower.replace(/\b(?:and|what|how|about|then|so|ok|okay|actually|sorry|it|its|is|are|was|to|a|an|the|for|in|on|yes|no|only|just|if|i|my|me|you|do|does|please|thanks|oh|well)\b|[^a-z0-9]/g, " ").trim();
  if (ctx.topic && (f.country || f.speed || f.poBox || f.amount !== undefined || f.used !== undefined || f.days || f.payment) && content.split(/\s+/).filter((w) => !/^\d+$/.test(w) && !(f.speed && w === f.speed) && !(f.used !== undefined && /used|unused|new/.test(w))).length <= 4) return `continue-${ctx.topic}`;
  if (f.country && !ctx.topic && content.split(/\s+/).length <= 2) return "ask-country";
  // "The tent arrived 31 days ago." tells us a fact; it asks for nothing, so it is not a request of its own.
  const hasFact = f.shipped || f.days || f.used !== undefined || f.orderNo || f.amount !== undefined || f.payment || f.defect || f.country;
  if (hasFact && !/\?/.test(text) && !/\b(?:tell|show|give|explain|help|need|want|how|what|where|when|why|please|should|will|can i|could i|do you|does|is it|are you|is there)\b/.test(lower)) return "statement";
  return "other";
}

// ---------------------------------------------------------------- handlers

const money = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

interface Ctx {
  engine: Engine;
  opts: Opts;
  facts: Facts;
  used: string[];
}

const DISPLAY: Record<string, string> = { uk: "the United Kingdom", "united kingdom": "the United Kingdom", britain: "the United Kingdom", england: "the United Kingdom", scotland: "the United Kingdom", wales: "the United Kingdom", uae: "the United Arab Emirates", "united arab emirates": "the United Arab Emirates", dubai: "the United Arab Emirates", usa: "the United States" };

function shipPart(c: Ctx, f: Facts, request: string): Part {
  const { engine } = c;
  const base = { request, method: "rule" as const, status: "answered" as const, intent: "ship" };
  const country = f.country;
  if (country && country !== "united states") {
    const name = DISPLAY[country] ?? titleCase(country);
    if (NOT_YET.includes(country)) {
      return { ...base, rule: "Country not on the shipping list", text: `We don't ship to ${name} yet. We ship to the US, Canada, the United Kingdom, the European Union, Norway, Switzerland, Australia, New Zealand, Singapore, Japan and the United Arab Emirates, and add countries a few times a year. Next: if you are somewhere else, checkout will not offer the country, and Club members hear first when we add one.`, citations: cs(engine.citation("international-shipping", /not ship/i) ?? engine.citation("international-shipping")) };
    }
    const eu = !["canada", "united kingdom", "uk", "britain", "england", "scotland", "wales", "norway", "switzerland", "australia", "new zealand", "singapore", "japan", "united arab emirates", "uae", "dubai"].includes(country);
    const dutyLine = eu || ["united kingdom", "uk", "britain", "england", "scotland", "wales"].includes(country) ? "Import duties and VAT are calculated and charged at checkout, so there is nothing to pay on delivery." : "Duties and taxes are collected by the carrier when the parcel arrives.";
    let price = `Shipping is free over ${money(POLICY.intlFreeOver)}, otherwise a flat ${money(POLICY.intlFlat)}.`;
    let rule = "International shipping: free only above $150";
    if (f.amount !== undefined) {
      const free = f.amount > POLICY.intlFreeOver;
      price = free
        ? `At ${money(f.amount)} the order is over ${money(POLICY.intlFreeOver)}, so shipping is free.`
        : `At ${money(f.amount)} the order is not over ${money(POLICY.intlFreeOver)} (the offer is for orders over, so exactly ${money(POLICY.intlFreeOver)} is not included), so shipping is the flat ${money(POLICY.intlFlat)}.`;
      rule = `International shipping: ${money(f.amount)} ${free ? ">" : "≤"} $150 threshold, ${free ? "free" : "flat $19"}`;
    }
    const speedNote = f.speed && f.speed !== "standard" ? `Our help center lists ${f.speed === "overnight" ? "Overnight" : "Express"} only for US delivery, so I can't promise it for ${name}. ` : "";
    if (speedNote) rule = `${rule}; ${f.speed} is listed for the US only`;
    return { ...base, rule, text: `${speedNote}Yes, we ship to ${name}. International orders arrive in 5 to 10 business days. ${price} ${dutyLine}`, citations: cs(engine.citation("international-shipping", /delivery times/i), engine.citation("international-shipping", /duties/i)) };
  }
  // United States, or no country: domestic options.
  const wantsPo = f.poBox;
  const speed = f.speed;
  const free = f.amount !== undefined ? f.amount > POLICY.usFreeOver : undefined;
  if (wantsPo && speed && speed !== "standard")
    return { ...base, rule: "PO boxes: Standard only", text: `${speed === "overnight" ? "Overnight" : "Express"} can't go to a PO box: only Standard ships to PO boxes and APO/FPO addresses, the faster options need a street address. Next: use a street address for ${speed}, or choose Standard (3 to 5 business days).`, citations: cs(engine.citation("shipping-times", /po box/i)) };
  if (wantsPo) return { ...base, rule: "PO boxes: Standard only", text: "Yes, we ship Standard to PO boxes and APO/FPO addresses. The faster options (Express and Overnight) need a street address.", citations: cs(engine.citation("shipping-times", /po box/i)) };
  if (speed === "express") return { ...base, rule: "US Express price", text: "Express takes 1 to 2 business days and costs $14.95. Orders placed before 2 pm Eastern on a business day leave the warehouse the same day.", citations: cs(engine.citation("shipping-times", /delivery options/i)) };
  if (speed === "overnight") return { ...base, rule: "US Overnight price", text: "Overnight delivers the next business day for $29, when ordered before 12 pm Eastern. It needs a street address, not a PO box.", citations: cs(engine.citation("shipping-times", /delivery options/i)) };
  const std = free === undefined ? `Standard takes 3 to 5 business days and is free on orders over ${money(POLICY.usFreeOver)}, otherwise ${money(POLICY.usStandard)}.` : free ? `At ${money(f.amount!)} the order is over ${money(POLICY.usFreeOver)}, so Standard (3 to 5 business days) is free.` : `At ${money(f.amount!)} the order is not over ${money(POLICY.usFreeOver)}, so Standard (3 to 5 business days) is ${money(POLICY.usStandard)}.`;
  return { ...base, rule: free === undefined ? "US delivery options" : `US free shipping: ${money(f.amount!)} ${free ? ">" : "≤"} $75`, text: `Yes, we ship everywhere in the United States. ${std} Express is $14.95 (1 to 2 business days) and Overnight is $29.`, citations: cs(engine.citation("shipping-times", /delivery options/i)) };
}

function returnPart(c: Ctx, f: Facts, request: string): Part {
  const { engine } = c;
  const P = POLICY;
  const base = { request, method: "rule" as const, intent: "return" };
  const policy = engine.citation("returns-policy", /^$/) ?? engine.citation("returns-policy");
  const usedGear = engine.citation("returns-policy", /used gear/i);
  const cantTake = engine.citation("returns-policy", /can'?t take back/i);
  const start = engine.citation("start-return", /return shipping/i);
  const warranty = engine.citation("lifetime-warranty", /claim/i);
  const warrantyLine = "The lifetime warranty is a separate path for defects (not for normal wear): fill in the claim form at northfold.example/warranty with a photo and your order number. We reply within 3 business days, and I can't confirm in advance that a claim will be accepted.";

  if (f.finalSale)
    return { ...base, status: "answered", rule: "Final sale items are excluded before any day count", text: `Items marked Final sale can't be returned, opened or not, and the number of days doesn't change that. Next: if the item arrived damaged, wrong or incomplete, that is a different request: report it within ${P.reportDays} days of delivery with your order number.`, citations: cs(cantTake) };

  const d = f.days;
  const labelNote = `Return labels are free for exchanges and store credit; for a refund to your card ${money(P.labelFee)} is deducted for the label.`;
  const unusedText = (n: number) => `Unused items in original condition can be returned within ${P.refundDays} days of delivery for a full refund, and day ${P.refundDays} is included. At ${n} days you are ${n <= P.refundDays ? "inside" : "past"} that window.`;
  const usedText = (n: number) => `Used gear (worn or used outdoors) can be returned within ${P.creditDays} days of delivery for store credit, not a cash refund, if it is clean and undamaged. Day ${P.creditDays} is included. At ${n} days you are ${n <= P.creditDays ? "inside" : "past"} that limit.`;
  const defectTail = f.defect ? ` ${warrantyLine}` : "";

  // Day counts measured from something other than delivery can't be applied to a window that counts from delivery.
  const fromOrder = d?.basis === "order";
  const orderNote = fromOrder ? " Return windows count from delivery, not from the order date." : "";
  const calendarNote = d?.kind === "business" ? " Return windows count calendar days, not business days." : "";
  const n = d ? (d.kind === "business" ? Math.round((d.n * 7) / 5) : d.n) : undefined;

  if (n === undefined) {
    return { ...base, status: "clarify", rule: "Return window needs the delivery date", missing: ["days since delivery"], text: `It depends on the date and the condition. Unused items can be returned within ${P.refundDays} days of delivery for a refund; used gear within ${P.creditDays} days for store credit. How many days ago was it delivered, and has it been used?${defectTail}`, citations: cs(policy, usedGear) };
  }
  if (f.used === undefined) {
    const both = `If it is unused: ${n <= P.refundDays ? `${n} days is inside the ${P.refundDays}-day window, so it can be returned for a full refund.` : `${n} days is past the ${P.refundDays}-day window.`} If it has been used: ${n <= P.creditDays ? `${n} days is inside the ${P.creditDays}-day limit for store credit.` : `${n} days is past the ${P.creditDays}-day limit for used gear.`}`;
    return { ...base, status: "clarify", rule: `Unused ${P.refundDays} days vs used ${P.creditDays} days, condition unknown`, missing: ["used or unused"], text: `I need one more detail: is the item unused, or has it been used? ${both}${orderNote}${calendarNote}${defectTail} Next: tell me whether it is unused or used and I'll give you the exact result.`, citations: cs(policy, usedGear, f.defect ? warranty : undefined) };
  }
  if (f.used === false) {
    const inside = n <= P.refundDays;
    if (!inside && fromOrder) return { ...base, status: "clarify", rule: "Order date is not the delivery date", missing: ["delivery date"], text: `${unusedText(n)}${orderNote} Next: what date was it delivered? If that is within ${P.refundDays} days you can still return it.${defectTail}`, citations: cs(policy, f.defect ? warranty : undefined) };
    return { ...base, status: "answered", rule: `Unused: ${n} days ${inside ? "≤" : ">"} ${P.refundDays}`, text: `${inside ? "Yes." : "Not for a refund."} ${unusedText(n)}${orderNote}${calendarNote} ${inside ? `Next: start the return at northfold.example/returns with your order number. ${labelNote}` : f.defect ? "" : "If something is wrong with it, a defect is a separate path under the lifetime warranty, which is reviewed case by case."}${defectTail}`.replace(/\s+/g, " ").trim(), citations: cs(policy, start && inside ? start : undefined, !inside || f.defect ? warranty : undefined) };
  }
  // Used.
  const inside = n <= P.creditDays;
  if (!inside && fromOrder) return { ...base, status: "clarify", rule: "Order date is not the delivery date", missing: ["delivery date"], text: `${usedText(n)}${orderNote} A cash refund isn't available for used gear. Next: what date was it delivered? If that is within ${P.creditDays} days, store credit is still possible.${defectTail}`, citations: cs(usedGear, f.defect ? warranty : undefined) };
  return { ...base, status: "answered", rule: `Used: ${n} days ${inside ? "≤" : ">"} ${P.creditDays}`, text: `${inside ? "You can return it for store credit, not a cash refund." : "A return for store credit is no longer possible."} ${usedText(n)}${orderNote}${calendarNote} ${inside ? `Next: start the return at northfold.example/returns. Store credit labels are free and the credit arrives as a code in the refund email.` : f.defect ? "" : "A defect after that is a separate path under the lifetime warranty (claim form at northfold.example/warranty); it is reviewed, so I can't promise it will be accepted, and normal wear is not covered."}${defectTail}`.replace(/\s+/g, " ").trim(), citations: cs(usedGear, !inside || f.defect ? warranty : undefined) };
}

const PAY_NAME: Record<string, string> = { paypal: "PayPal", klarna: "Klarna", visa: "Visa", mastercard: "Mastercard", amex: "American Express", "apple pay": "Apple Pay", "google pay": "Google Pay" };

function refundDelayPart(c: Ctx, f: Facts, request: string): Part {
  const { engine } = c;
  const P = POLICY;
  const base = { request, method: "rule" as const, intent: "refund-delay" };
  const cite = cs(engine.citation("refund-status", /^$/) ?? engine.citation("refund-status"), engine.citation("refund-status", /how long/i));
  const pay = f.payment ? ` Your payment method (${PAY_NAME[f.payment] ?? f.payment}) ${f.payment === "paypal" ? "is normally paid within 24 hours of the refund email" : f.payment === "klarna" ? "updates within 5 business days" : /card|visa|mastercard|amex/.test(f.payment) ? "takes 3 to 5 business days after the refund email" : "follows its own timing"}.` : "";
  const d = f.days;
  if (d && d.basis === "warehouse") {
    const over = d.kind === "business" ? d.n > P.refundReviewBusinessDays : d.n * (5 / 7) > P.refundReviewBusinessDays;
    return over
      ? { ...base, status: "answered", rule: `Delivered to warehouse ${d.n} ${d.kind} days > ${P.refundReviewBusinessDays} business days`, text: `That is past the ${P.refundReviewBusinessDays} business days after which we look into a missing refund. Refunds are normally issued within 2 business days of the return arriving.${pay} Next: send us the tracking number of the return (and your order number) so the team can check it. I can't see the refund or return from here.`, citations: cite }
      : { ...base, status: "answered", rule: `Delivered to warehouse ${d.n} days ≤ ${P.refundReviewBusinessDays} business days`, text: `Refunds are issued within 2 business days of the return arriving, so it should be on its way.${pay} If it has been more than ${P.refundReviewBusinessDays} business days since the return was delivered to us, send us the return tracking number and we will look into it.`, citations: cite };
  }
  if (d && (d.basis === "return-sent" || d.basis === "unknown")) {
    return { ...base, status: "clarify", rule: "Shipped date is not the warehouse delivery date", missing: ["date the return reached the warehouse"], text: `${d.n} ${d.kind === "business" ? "business " : ""}days since you sent it tells me when it left you, not when it reached us. Refunds are issued within 2 business days after the return arrives at our warehouse, plus 3 to 5 business days for a card.${pay} Next: what date does the carrier's tracking show it delivered to us? If that is more than ${P.refundReviewBusinessDays} business days ago, send us the return tracking number and we will look into it.`, citations: cite };
  }
  return { ...base, status: "clarify", rule: "Refund timing needs the warehouse delivery date", missing: ["date the return reached the warehouse"], text: `Refunds are issued within 2 business days after the return arrives at our warehouse, and your bank may take 3 to 5 more for a card.${pay} Next: do you know when the return was delivered to us? If it is more than ${P.refundReviewBusinessDays} business days, send us the return tracking number and we will look into it.`, citations: cite };
}

function cancelPart(c: Ctx, f: Facts, request: string): Part {
  const { engine, opts } = c;
  const base = { request, method: "rule" as const, intent: "cancel" };
  const change = engine.citation("change-cancel-order", /^$/) ?? engine.citation("change-cancel-order");
  const after = engine.citation("change-cancel-order", /first hour/i);
  const wrong = engine.citation("change-cancel-order", /wrong shipping/i);
  const order = f.orderNo ? opts.orders?.find((o) => o.number === f.orderNo) : undefined;
  const demo = "I can't cancel orders in this demo, and nothing has been cancelled.";
  const returnTail = "You can return it once it arrives: labels are free for exchanges and store credit, and $6 is deducted for the label on a card refund.";
  if (f.orderNo && !order) return { ...base, status: "clarify", rule: "Order not found", missing: ["valid order number"], text: `I couldn't find an order with the number ${f.orderNo}, so I can't tell whether it can still be cancelled. Please check the confirmation email: the number starts with NF followed by five digits.`, citations: cs(change) };
  if (!order) {
    if (f.shipped) return { ...base, status: "answered", rule: "Shipped orders can't be changed", text: `Once an order has shipped it can no longer be cancelled or changed; only orders within 60 minutes of being placed can. ${returnTail} If the address is wrong, reply to the shipping email straight away and we will ask the carrier to redirect the parcel. ${demo} Next: send me the order number if you want me to look at its status.`, citations: cs(after, wrong) };
    return { ...base, status: "clarify", rule: "Cancel needs an order", missing: ["order number"], text: `You can cancel an order within 60 minutes of placing it (Account, then Orders, then Cancel order). After that it can't be changed. Which order do you mean? Send me the number (it starts with NF). ${demo}`, citations: cs(change) };
  }
  const age = ((opts.now ?? Date.now()) - Date.parse(order.placedAt)) / 60_000;
  const when = age < 120 ? `${Math.max(1, Math.round(age))} minutes ago` : age < 2880 ? `${Math.round(age / 60)} hours ago` : `${Math.round(age / 1440)} days ago`;
  if (order.status === "processing" && age <= POLICY.editMinutes)
    return { ...base, status: "answered", rule: "Within 60 minutes and still processing", text: `${order.number} was placed ${when}, which is inside the 60-minute window, so you can cancel it yourself: open it from your confirmation email or under Account, then Orders, and choose Cancel order. ${demo}`, citations: cs(change) };
  if (order.status === "processing")
    return { ...base, status: "answered", rule: "Past 60 minutes: being packed", text: `${order.number} was placed ${when}, past the 60-minute window, and it is being packed, so it can no longer be changed or cancelled. ${returnTail} ${demo}`, citations: cs(after) };
  const state = order.status === "delivered" ? "already delivered" : order.status === "out-for-delivery" ? "out for delivery" : "already shipped";
  return { ...base, status: "answered", rule: `Status ${order.status}: cannot be cancelled`, text: `${order.number} was placed ${when} and is ${state}, so it can no longer be cancelled or changed. ${returnTail}${order.status === "shipped" ? " If the address is wrong, reply to the shipping email straight away and we will ask the carrier to redirect the parcel." : ""} ${demo}`, citations: cs(after, order.status === "shipped" ? wrong : undefined) };
}

function simplePart(c: Ctx, intent: string, request: string, f: Facts): Part | undefined {
  const { engine } = c;
  const base = { request, intent, method: "rule" as const, status: "answered" as const };
  switch (intent) {
    case "return-info": {
      const rep = engine.answer("What is your return policy?", { threshold: 0, orders: c.opts.orders });
      return { ...base, method: "retrieval", rule: "General return question: the return policy section", confidence: rep.confidence, text: rep.text, citations: rep.citations };
    }
    case "smalltalk":
      return { ...base, method: "smalltalk", text: "Hi! I'm doing well, thanks. Ask me about orders, shipping, returns, sizing or our warranty.", citations: [] };
    case "injection":
      return { ...base, rule: "Instructions in a message don't change the policy", text: "I can't change how I work or promise outcomes that the help center doesn't state. What I can tell you: refunds are issued within 2 business days of your return arriving at our warehouse, and your bank may take 3 to 5 more business days to show it. Next: tell me what you need help with and I'll answer from the help center.", citations: cs(engine.citation("refund-status", /^$/) ?? engine.citation("refund-status")) };
    case "refund-action":
      return { ...base, rule: "No payment actions in the demo", text: "I can't issue refunds or see transactions, so I can't refund anything now or give you a transaction ID. A refund is issued by the team after your return arrives at our warehouse, and the refund email is what confirms it. Next: start a return at northfold.example/returns with your order number.", citations: cs(engine.citation("start-return", /^$/) ?? engine.citation("start-return"), engine.citation("returns-policy", /refund timing/i)) };
    case "live-data":
      return { ...base, rule: "No live prices or stock", text: "I can't see live prices or stock. The product page at northfold.example shows the current price, sizes, colors and availability. I can help with shipping, returns, sizing or warranty questions.", citations: [] };
    case "not-received": {
      const fresh = !f.days || f.days.n <= 1;
      const timing = fresh
        ? "Since it was marked delivered only about a day ago, give it until the end of the next business day, because carriers sometimes scan parcels early; you have already checked with neighbors, which is the right first step."
        : "You are already past the wait of one business day that we ask for, and you have checked around the address.";
      return { ...base, rule: fresh ? "Delivered ≤ 1 day ago: wait until the end of the next business day" : "Delivered more than a business day ago: contact us (within 14 days)", text: `${timing} If it still has not turned up, contact us within ${POLICY.reportDays} days of delivery with your order number and we will send a replacement or a refund. I can't confirm a replacement from here.`, citations: cs(engine.citation("track-order", /delivered but not/i)) };
    }
    case "missing":
      return { ...base, rule: "Missing item: report within 14 days of delivery", text: `Sorry about that. Tell us within ${POLICY.reportDays} days of delivery: send your order number, a photo of the shipping label, and which item is missing. We ship a replacement within one business day of hearing from you. Next: reply with those three things, or use the contact details in the help center.`, citations: cs(engine.citation("missing-damaged", /what to send/i) ?? engine.citation("missing-damaged")) };
    case "size-swap": {
      const asked = /\blarger|bigger\b/i.test(request) ? "a larger size" : /\bsmaller\b/i.test(request) ? "a smaller size" : "a different size";
      return { ...base, status: "clarify", rule: "Exchange, not return or sizing advice", missing: ["which item and size"], text: `That sounds like an exchange, not a refund. Exchanges are free: start one at northfold.example/returns and choose Exchange next to the item, and we ship the replacement as soon as the carrier scans your return. Do you want to exchange your current item for ${asked}? Tell me which item and size.`, citations: cs(engine.citation("exchanges", /^$/) ?? engine.citation("exchanges")) };
    }
    case "exchange":
      return { ...base, rule: "Exchange steps", text: "Exchanges are free. Start one at northfold.example/returns and choose Exchange next to the item. We ship the replacement as soon as the carrier scans your return, so you don't have to wait for it to reach our warehouse.", citations: cs(engine.citation("exchanges", /^$/) ?? engine.citation("exchanges")) };
    case "deadline":
      return { ...base, rule: "No delivery-date promises", text: "I can't promise a delivery date for a replacement or exchange. The fastest options for a new order are Express (1 to 2 business days, $14.95) and Overnight (next business day, $29, when ordered before 12 pm Eastern). Next: tell the team the date you need it by when you report the issue.", citations: cs(engine.citation("shipping-times", /delivery options/i)) };
    case "warranty": {
      const text = f.animal
        ? "The lifetime warranty covers defects in materials and workmanship, but damage from animals is not covered, so a chewed tent is not a free replacement under it. Next: our repair program fixes Northfold gear whether or not the warranty applies. Paid repairs get a quote before any work starts, for example a patch for a tear up to 5 cm is $20 and a tent pole section $12."
        : "The lifetime warranty covers defects in materials and workmanship under normal use. It is reviewed per claim, so I can't confirm a repair or replacement in advance.";
      return { ...base, rule: f.animal ? "Warranty exclusion: animal damage" : "Warranty review", text, citations: cs(engine.citation("lifetime-warranty", /not covered/i), engine.citation("repairs", /prices/i)) };
    }
    case "ask-country":
      return { ...base, status: "clarify", rule: "Country without a topic", missing: ["what you want to know about the country"], text: `Are you asking whether we ship to ${titleCase(f.country!)}? Tell me if you meant shipping, delivery times or duties, and I'll answer.`, citations: [] };
  }
  return undefined;
}

// ---------------------------------------------------------------- the pipeline

const GROUP: Record<string, Topic> = { ship: "ship", return: "return", "return-info": "return", "refund-delay": "refund", exchange: "exchange", "size-swap": "exchange", cancel: "order", lookup: "order", warranty: "warranty", "not-received": "order", missing: "order" };

export function respondTo(engine: Engine, text: string, prior: DialogContext | undefined, opts: Opts): DialogReply {
  const ctx0: DialogContext = prior ?? {};
  const normal = rephrase(text);
  const { kept, negated } = stripNegated(normal);
  const messageFacts = extractFacts(kept || normal);
  // An order number named in a negated sentence ("Do not track NF-20481") is still the order being talked about.
  const named = ORDER_NO.exec(normal);
  if (named) messageFacts.orderNo = `NF-${named[1]}`;
  const requests: Request[] = splitRequests(normal).map((r) => ({ text: r, intent: "" }));
  const used: string[] = [];

  // Intents are read from each request with its negated part removed; facts are shared by the whole message.
  const ctx = ctx0;
  for (const r of requests) r.intent = intentOf(r.text, ctx);
  for (const r of requests) if (r.intent === "other" && /warranty|replac/i.test(r.text) && messageFacts.animal) r.intent = "warranty";
  for (const r of requests) if (r.intent === "other" && /\b(?:vat|duties|duty|customs)\b/i.test(r.text) && messageFacts.country) r.intent = "ship";
  // "My tent came 46 days ago. I haven't used it. What are my options?": the closing question is about the facts just stated.
  if (!requests.some((r) => !["statement", "filler", "other"].includes(r.intent) && !r.intent.startsWith("continue-"))) {
    const topic = messageFacts.days || messageFacts.used !== undefined || messageFacts.finalSale || messageFacts.defect ? "return" : messageFacts.country || messageFacts.amount !== undefined || messageFacts.speed || messageFacts.poBox ? "ship" : undefined;
    const f = requests.find((r) => r.intent === "filler");
    if (f && topic) f.intent = topic;
  }
  // A request that only adds a fact to a sibling request ("...and what if I spend $200?", "Return?" after "I used it, got it 12 days ago") belongs to that sibling's topic.
  const sibling = (name: string) => requests.some((r) => r.intent === name);
  for (const r of requests) {
    if (r.intent !== "other") continue;
    const rf = extractFacts(stripNegated(r.text).kept);
    if (sibling("ship") && (rf.amount !== undefined || rf.country || rf.speed || rf.poBox)) r.intent = "ship";
    else if (sibling("return") && (rf.days || rf.used !== undefined || rf.finalSale || rf.defect)) r.intent = "return";
    else if (RETURN.test(r.text) && (messageFacts.days || messageFacts.used !== undefined || messageFacts.finalSale || messageFacts.defect)) r.intent = "return";
  }
  // "I want to order $151 of gear to Spain. What will shipping cost?": the facts and the question are in different sentences.
  if (!sibling("ship") && (messageFacts.country || messageFacts.amount !== undefined) && !messageFacts.days) {
    const asks = requests.find((r) => r.intent === "other" && /\b(?:ship|ships|shipping|delivery|deliver|cost|pay|fee|free|price)\b/i.test(r.text));
    if (asks) {
      asks.intent = "ship";
      for (const r of requests) if (r !== asks && r.intent === "other") { const rf = extractFacts(r.text); if (rf.country || rf.amount !== undefined) r.intent = "statement"; }
    }
  }
  // "The warehouse received my return 12 business days ago. I paid with PayPal and there is no refund email." is one
  // question about a late refund; its sentences are facts for it, not requests of their own.
  if (MSG_RETURNED.test(normal) && MSG_NO_REFUND.test(normal) && !requests.some((r) => r.intent === "refund-delay")) {
    const first = requests.find((r) => ["return", "statement", "other"].includes(r.intent));
    if (first) {
      first.intent = "refund-delay";
      for (const r of requests) if (r !== first && ["return", "statement", "other"].includes(r.intent) && /refund|paypal|email|warehouse|return|card/i.test(r.text)) r.intent = "statement";
    }
  }
  // A clause with no question and no fact ("my partner bought this for me and ...") only tells a story; it is not a request when others are.
  if (requests.some((r) => !["other", "statement", "filler"].includes(r.intent)))
    for (const r of requests) if (r.intent === "other" && !/\b(?:how|what|where|when|why|which|can|could|do|does|did|is|are|will|should|tell|show|need|want|help|please)\b|\?/i.test(r.text)) r.intent = "statement";
  const real = requests.filter((r) => r.intent !== "statement" && !(r.intent === "filler" && requests.length > 1) && (r.intent !== "other" || meaningful(r.text)));

  const facts: Facts = { ...messageFacts };
  const take = <K extends keyof Facts>(k: K, label: string) => {
    if (facts[k] === undefined && ctx0[k] !== undefined) {
      facts[k] = ctx0[k];
      used.push(label);
    }
  };

  const parts: Part[] = [];
  const c: Ctx = { engine, opts, facts, used };
  const unusedCorrection = messageFacts.used !== undefined;

  for (const r of real) {
    const f = extractFacts(stripNegated(r.text).kept);
    const own: Facts = { ...facts, ...Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined)) };
    let intent = r.intent;
    if (intent.startsWith("continue-")) {
      const t = intent.slice(9) as Topic;
      intent = t === "ship" ? "ship" : t === "return" || t === "refund" || t === "exchange" || t === "warranty" ? (t === "refund" ? "refund-delay" : "return") : "other";
      if (intent !== "other") used.push(`continued the earlier ${t === "ship" ? "shipping" : t === "refund" ? "refund" : "return"} question`);
    }
    if (intent === "ship") {
      (["country", "speed", "amount", "poBox"] as const).forEach((k) => take(k, k === "country" ? "country from earlier" : k === "poBox" ? "PO box from earlier" : `${k} from earlier`));
      // A new country replaces the old one; a bare speed keeps the country.
      if (f.country) own.country = f.country;
      else if (ctx0.country) { own.country = ctx0.country; }
      if (!f.speed && ctx0.speed && !f.country && !f.poBox === false) own.speed = ctx0.speed;
      if (f.poBox && !f.speed && ctx0.speed) own.speed = ctx0.speed;
      if (ctx0.country && !messageFacts.country && !f.country && own.country === ctx0.country) used.push(`country ${titleCase(own.country)} from an earlier message`);
      if (f.poBox && !f.speed && ctx0.speed) used.push(`speed ${ctx0.speed} from an earlier message`);
      if (!f.amount && ctx0.amount !== undefined && f.country) own.amount = ctx0.amount;
      parts.push(shipPart(c, own, r.text));
    } else if (intent === "return") {
      for (const k of ["days", "used", "defect", "finalSale"] as const)
        if (f[k] === undefined && ctx0[k] !== undefined && !(k === "used" && unusedCorrection)) {
          (own as Record<string, unknown>)[k] = ctx0[k];
          used.push(`${k === "days" ? "days since delivery" : k === "used" ? "used/unused" : k} from an earlier message`);
        }
      parts.push(returnPart(c, own, r.text));
    } else if (intent === "refund-delay") {
      if (f.payment === undefined && ctx0.payment) own.payment = ctx0.payment;
      if (f.days === undefined && ctx0.days) own.days = ctx0.days;
      const rp = refundDelayPart(c, own, r.text);
      if (messageFacts.annoyed) rp.text = `Sorry about the wait. ${rp.text}`;
      parts.push(rp);
    } else if (intent === "cancel") {
      if (!f.orderNo && ctx0.orderNo && (/\b(that|this|the|it|my)\b/i.test(r.text) || true)) {
        own.orderNo = ctx0.orderNo;
        used.push(`active order ${ctx0.orderNo} from an earlier message`);
      }
      parts.push(cancelPart(c, own, r.text));
    } else if (intent === "lookup") {
      const number = own.orderNo!;
      const rep = engine.answer(number, { threshold: opts.threshold, orders: opts.orders });
      const turkish = OTHER_LANGUAGE.test(text);
      parts.push({ intent, request: r.text, method: "lookup", status: rep.kind === "order" ? "answered" : "clarify", rule: "Order number lookup", missing: rep.kind === "order" ? undefined : ["valid order number"], text: (turkish ? "I can only reply in English, but I found the order number in your message. " : "") + rep.text, citations: rep.citations, order: rep.order });
    } else if (intent === "human") {
      parts.push({ intent, request: r.text, method: "rule", status: "handoff", reason: "requested", rule: "Customer asked for a person", text: HANDOFF_REQUESTED, citations: [] });
    } else {
      const simple = simplePart(c, intent, r.text, own);
      if (simple) parts.push(simple);
      else {
        // Retrieval over the help center for what the rules don't cover, without the order number and the negated words.
        const q = stripNegated(r.text).kept.replace(ORDER_NO, " ").replace(/\s+/g, " ").trim() || r.text;
        const rep = engine.answer(q, { threshold: opts.threshold, orders: opts.orders });
        const status: Part["status"] = rep.handoff ? "handoff" : rep.kind === "clarify" ? "clarify" : "answered";
        parts.push({ intent: "other", request: r.text, method: rep.kind === "order" ? "lookup" : "retrieval", status, reason: rep.handoff ? "low-confidence" : undefined, confidence: rep.confidence, text: rep.text, citations: rep.citations, order: rep.order, rule: rep.notes?.[0] });
      }
    }
  }

  // A message made only of negated words ("Do not track NF-20481.") still carries its facts but asks for nothing.
  if (!parts.length) {
    const rep = engine.answer(kept || normal, { threshold: opts.threshold, orders: opts.orders });
    parts.push({ intent: "other", request: text, method: "retrieval", status: rep.handoff ? "handoff" : rep.kind === "clarify" ? "clarify" : "answered", reason: rep.handoff ? "low-confidence" : undefined, confidence: rep.confidence, text: rep.text, citations: rep.citations, order: rep.order });
  }

  // Two requests that got the same answer ("do you ship to Germany" and "what about VAT") are answered once.
  for (let i = parts.length - 1; i > 0; i--) if (parts.slice(0, i).some((p) => p.text === parts[i].text)) parts.splice(i, 1);

  // "Siparişim nerede? NF-20481": the order is found, and the English-only notice is already part of that answer.
  if (parts.some((p) => p.method === "lookup" && p.status === "answered"))
    for (let i = parts.length - 1; i >= 0; i--) if (/^Sorry, I can only answer in English/.test(parts[i].text)) parts.splice(i, 1);

  // Compose one reply.
  const handoffParts = parts.filter((p) => p.status === "handoff");
  const speak = parts.filter((p) => p.status !== "handoff");
  const requested = handoffParts.some((p) => p.reason === "requested");
  const lowOnly = handoffParts.filter((p) => p.reason !== "requested");
  const label = (p: Part) => {
    const named: Record<string, string> = { ship: "Shipping", return: "Return", "return-info": "Return", "refund-delay": "Refund", cancel: "Cancel", "size-swap": "Exchange", missing: "Missing item", "not-received": "Delivered, not received", exchange: "Exchange", deadline: "Delivery date", warranty: "Warranty", lookup: "Order" };
    return named[p.intent];
  };
  let out = "";
  if (speak.length === 1 && !handoffParts.length) out = speak[0].text;
  else {
    const blocks = speak.map((p) => (label(p) ? `${label(p)}: ${p.text}` : p.text));
    for (const p of handoffParts) if (p.reason === "requested") blocks.push(p.text);
    if (lowOnly.length) blocks.push(`I couldn't answer “${lowOnly.map((p) => p.request.trim().replace(/[.?!]+$/, "")).join("”, “")}” with enough confidence, so I've asked a teammate to look at ${lowOnly.length > 1 ? "those" : "that"}.`);
    out = blocks.join("\n");
  }
  const handoff = handoffParts.length > 0;
  const kind: AnswerKind = handoff && !speak.length ? "handoff" : speak.length ? (speak.every((p) => p.intent === "smalltalk") ? "greeting" : speak.length === 1 && speak[0].order ? "order" : speak.every((p) => p.status === "clarify") ? "clarify" : "answer") : "answer";
  const retrieval = parts.filter((p) => p.method === "retrieval" && p.confidence !== undefined);
  const confidence = retrieval.length ? Math.min(...retrieval.map((p) => p.confidence!)) : 1;
  const citations: Citation[] = [];
  for (const p of speak) for (const ci of p.citations) if (!citations.some((x) => x.articleId === ci.articleId && x.heading === ci.heading)) citations.push(ci);
  const order = speak.find((p) => p.order)?.order;
  const missing = [...new Set(parts.flatMap((p) => p.missing ?? []))];

  // Next context: the topic of the last request, plus the facts that are still relevant.
  const last = [...parts].reverse().find((p) => GROUP[p.intent]);
  const topic: Topic | undefined = last ? GROUP[last.intent] : parts.length === 1 && parts[0].intent === "smalltalk" ? ctx0.topic : ctx0.topic && parts.every((p) => p.intent === "other" && p.status !== "answered") ? ctx0.topic : last ? undefined : "other";
  const returnish = topic === "return" || topic === "refund" || topic === "exchange" || topic === "warranty";
  const next: DialogContext = { topic };
  const orderNo = facts.orderNo ?? ctx0.orderNo;
  if (orderNo) next.orderNo = orderNo;
  if (topic === "ship") {
    for (const k of ["country", "speed", "amount", "poBox"] as const) if (facts[k] !== undefined) (next as Record<string, unknown>)[k] = facts[k];
    if (facts.country === undefined && ctx0.country) next.country = ctx0.country;
    if (facts.speed === undefined && ctx0.speed) next.speed = ctx0.speed;
  }
  if (returnish) {
    for (const k of ["days", "used", "defect", "finalSale", "payment", "animal"] as const) {
      const v = facts[k] ?? ctx0[k];
      if (v !== undefined) (next as Record<string, unknown>)[k] = v;
    }
    if (unusedCorrection && messageFacts.used !== undefined) next.used = messageFacts.used;
  }
  if (parts.some((p) => p.missing?.length)) next.awaiting = missing[0];

  // Answered or asked back counts as covered; a request handed to a person is pending until they reply.
  const covered = parts.filter((p) => p.status !== "handoff").length;
  const ruled = parts.filter((p) => p.method !== "retrieval").length;
  const method: DialogReply["method"] = ruled === parts.length ? "rule" : ruled === 0 ? "retrieval" : "mixed";
  return {
    kind,
    text: out,
    handoff,
    handoffReason: requested ? "requested" : handoff ? "low-confidence" : undefined,
    confidence,
    citations,
    matched: [],
    order,
    parts,
    facts,
    negated,
    contextUsed: [...new Set(used)],
    missing,
    context: next,
    covered,
    total: parts.length,
    method,
    notes: parts.map((p) => p.rule).filter((x): x is string => !!x),
  };
}
