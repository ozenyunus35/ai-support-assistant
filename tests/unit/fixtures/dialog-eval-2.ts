// Second evaluation set for the conversation layer. Written after the first set had been used to fix the layer,
// so the first set is a tuning set now; its first run (96.7% all right, 0% wrong-and-confident, 0.5% needless hand-offs) came before any change made because of it; the two fixes it showed ("still sealed" read as unused, story clauses read as requests) make it a tuning set from then on.
// New shapes: order-date and business-day counts, a return question answered over two turns, three requests in one
// message, speed and PO box chains, texting shorthand and stories around the question.
import type { EvalCase } from "./dialog-eval";

export function dialogEval2(n: number, seed: number): EvalCase[] {
  let state = seed;
  const rnd = () => ((state = (state * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const ITEM = ["trail runners", "insulated vest", "two person tent", "down bag", "waterproof jacket", "backpack", "stove"];
  const COUNTRY = ["Germany", "Canada", "Japan", "Spain", "Australia", "France", "Switzerland", "New Zealand"];
  const STORY = ["so I ordered last week for a trip, ", "my partner bought this for me and ", "first time buying from you, ", "not sure if this is the right place but ", ""];
  const noise = (q: string) => {
    let t = q;
    if (rnd() < 0.3) t = t.replace(/\byou\b/g, "u").replace(/\bplease\b/g, "pls");
    if (rnd() < 0.3) t = pick(STORY) + t.charAt(0).toLowerCase() + t.slice(1);
    if (rnd() < 0.3) t = t.toLowerCase();
    return t;
  };
  const ORDERS = [
    { no: "NF-20481", status: "shipped" },
    { no: "NF-20517", status: "out-for-delivery" },
    { no: "NF-20388", status: "delivered" },
    { no: "NF-20602", status: "processing" },
  ];
  const make = (): EvalCase => {
    const f = pick(["order-basis", "business-days", "two-turn-return", "three-requests", "speed-chain", "country-speed", "cancel-after-lookup", "refund-wording", "plain-info"] as const);
    const item = pick(ITEM);
    if (f === "order-basis") {
      const used = rnd() < 0.5;
      const days = used ? pick([8, 20, 29, 35, 50, 70]) : pick([10, 40, 59, 61, 75, 100]);
      const text = noise(`I ordered the ${item} ${days} days ago and ${used ? "I have used it" : "it is unused"}. Can I return it?`);
      const certainIn = used ? days <= 30 : days <= 60; // delivery came after the order, so days since delivery <= days
      return certainIn ? { family: "return-stated", turns: [text], outcome: used ? "credit" : "refund", handoff: false, clarify: false } : { family: "return-unstated", turns: [text], clarify: true, handoff: false, has: [/deliver/i] };
    }
    if (f === "business-days") {
      const used = rnd() < 0.5;
      const days = used ? pick([6, 10, 14, 30, 40, 60]) : pick([10, 20, 30, 50, 60, 80]);
      const text = noise(`My ${item} arrived ${days} business days ago and ${used ? "I have used it" : "I never used it"}, can I return it?`);
      const calendar = Math.round(days * 1.4);
      return { family: "return-stated", turns: [text], outcome: used ? (calendar <= 30 ? "credit" : "past") : calendar <= 60 ? "refund" : "past", handoff: false, clarify: false, has: [/business days/i] };
    }
    if (f === "two-turn-return") {
      const days = pick([12, 29, 31, 44, 59, 61, 90]);
      const used = rnd() < 0.5;
      const first = noise(`The ${item} arrived ${days} days ago. Can I still return it?`);
      const second = used ? pick(["I used it", "It has been used a few times", "yes I used it", "used"]) : pick(["It is unused", "I never opened it", "no, unused", "still sealed"]);
      return { family: "follow-up", turns: [first, second], needsContext: true, outcome: used ? (days <= 30 ? "credit" : "past") : days <= 60 ? "refund" : "past", handoff: false, clarify: false };
    }
    if (f === "three-requests") {
      const dest = pick(COUNTRY);
      const o = pick(ORDERS);
      const days = pick([14, 29, 31, 45]);
      const text = noise(`Do you ship to ${dest}? Can I return a used ${item} after ${days} days? Where is my order ${o.no}?`);
      return { family: "multi", turns: [text], requests: 3, handoff: false, sources: ["international-shipping", "returns-policy"], order: o.no };
    }
    if (f === "speed-chain") {
      const speed = pick(["express", "overnight"]);
      const text = noise(`How much is ${speed} shipping?`);
      return { family: "follow-up", turns: [text, pick(["To a PO box?", "and to a po box?", "What about a PO box"])], needsContext: true, has: [/PO box/i, /street address|Standard/i], handoff: false };
    }
    if (f === "country-speed") {
      const c = pick(COUNTRY);
      return { family: "follow-up", turns: [noise(`Can you ship to ${c}?`), pick(["And overnight?", "what about express", "can I get overnight"])], needsContext: true, has: [new RegExp(c, "i"), /only for US delivery/i], handoff: false };
    }
    if (f === "cancel-after-lookup") {
      const o = pick(ORDERS);
      return { family: "cancel", turns: [pick([`where is ${o.no}`, `${o.no}`, `status of ${o.no}?`]), noise(pick(["Actually, cancel that order please", "can you cancel it", "I changed my mind, cancel it"]))], needsContext: true, outcome: "cancel-refused", has: [new RegExp(o.no)], hasNot: [/\b(?:I've|I have) cancelled|(?<!nothing )has been cancelled|(?<!nothing )was cancelled/i], handoff: false };
    }
    if (f === "refund-wording") {
      const n = pick([3, 8, 10, 11, 14, 20]);
      const text = noise(`The warehouse received my return ${n} business days ago and I paid with ${pick(["PayPal", "my card"])}. Still no refund.`);
      return { family: "refund-delay", turns: [text], outcome: n > 10 ? "past-review" : "within-review", handoff: false };
    }
    const q = pick([
      ["What is your return policy?", ["returns-policy"]],
      ["how do exchanges work", ["exchanges"]],
      ["can I get a store credit instead of a refund", ["returns-policy"]],
      ["how long are repairs", ["repairs"]],
      ["do you take paypal", ["payment-methods"]],
    ] as Array<[string, string[]]>);
    return { family: "return-stated", turns: [noise(q[0])], sources: q[1], handoff: false };
  };
  const cases: EvalCase[] = [];
  while (cases.length < n) cases.push(make());
  return cases;
}
