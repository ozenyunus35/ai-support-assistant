import { createEngine, type Reply } from "./engine";
import { ARTICLES, SYNONYMS } from "./kb";
import type { Agent, Conversation, Customer, DemoState, Message, Order, Settings } from "./types";

/** Bump when the shape of the stored state changes, so old browsers reseed. */
export const STATE_VERSION = 4;

export const AGENTS: Agent[] = [
  { id: "ag-sam", name: "Sam Rivera", title: "Support lead" },
  { id: "ag-priya", name: "Priya Nair", title: "Support specialist" },
  { id: "ag-leo", name: "Leo Martins", title: "Support specialist" },
];

/** The signed-in admin in the demo. */
export const ME = AGENTS[0];

export const DEFAULT_SETTINGS: Settings = {
  assistantName: "Northfold Assistant",
  greeting: "Hi! I answer from the Northfold help center, and I'll bring in a teammate whenever you need one. What can I help with?",
  suggestions: ["How long do refunds take?", "Do you ship to Canada?", "Where is my order NF-20481?", "How do I wash a rain jacket?"],
  threshold: 0.45,
  handoffMessage: "I'm not confident I have the right answer for this, so I've asked a teammate to join. They'll reply right here.",
  replyTime: "The team usually replies in under 10 minutes",
};

const DAY = 86_400_000;

function orders(now: number): Order[] {
  const at = (d: number) => new Date(now - d * DAY).toISOString();
  const eta = (d: number) => new Date(now + d * DAY).toISOString();
  return [
    { number: "NF-20481", email: "visitor@mail.example", items: ["Ridge 2 tent, Sage", "Ridge 2 footprint"], status: "shipped", carrier: "UPS Ground", placedAt: at(2), eta: eta(2) },
    { number: "NF-20517", email: "visitor@mail.example", items: ["Alpine Shell jacket, M"], status: "out-for-delivery", carrier: "USPS Priority", placedAt: at(3), eta: eta(0) },
    { number: "NF-20388", email: "visitor@mail.example", items: ["Trailhead 40L pack", "Merino crew, L"], status: "delivered", carrier: "FedEx Home", placedAt: at(9), eta: at(5) },
    { number: "NF-20602", email: "visitor@mail.example", items: ["Summit 3 tent", "Down 15° sleeping bag"], status: "processing", carrier: "UPS Ground", placedAt: at(0.1), eta: eta(5) },
  ];
}

const FIRST = ["Maya", "Jonas", "Aisha", "Daniel", "Elena", "Kenji", "Olivia", "Marcus", "Sofia", "Liam", "Hana", "Noah", "Chloe", "Omar", "Isla", "Mateo", "Freya", "Arjun", "Zoe", "Lucas", "Nora", "Ethan", "Leila", "Felix", "Grace", "Ravi", "Emma", "Tobias", "Mila", "Samir"];
const LAST = ["Holloway", "Brandt", "Okafor", "Lindqvist", "Moreau", "Tanaka", "Reyes", "Whitfield", "Castell", "Nakamura", "Albright", "Ferreira", "Kowalski", "Haddad", "Sutherland", "Vance", "Ellison", "Mehta", "Calloway", "Duarte"];
const PLACES = ["Denver, US", "Portland, US", "Seattle, US", "Austin, US", "Boston, US", "Chicago, US", "Toronto, CA", "Vancouver, CA", "London, UK", "Manchester, UK", "Berlin, DE", "Amsterdam, NL", "Stockholm, SE", "Zurich, CH", "Singapore, SG", "Dubai, AE", "Sydney, AU", "Auckland, NZ"];

/** Questions the assistant can answer from the help center. */
const ANSWERABLE = [
  "How long does a refund take?",
  "Do you ship to Canada?",
  "Can I get my money back if the tent is used?",
  "What payment methods do you accept?",
  "How do I wash my rain jacket?",
  "Is there a warranty on backpacks?",
  "My zipper broke, is that covered?",
  "I'm between sizes in a trim jacket, which one should I get?",
  "What are your store hours on Sunday?",
  "Can I change my shipping address?",
  "How much is express shipping?",
  "Do I pay customs in the UK?",
  "Can I use two promo codes?",
  "How do I reset my password?",
  "What does the comfort rating mean on sleeping bags?",
  "Is the Summit tent good for snow?",
  "My parcel says delivered but it's not here",
  "How do I return a gift?",
  "Can I pay with Klarna?",
  "How many points do I need for a reward?",
  "Can I trade in my old jacket?",
  "How do I start a return?",
  "Is return shipping free?",
  "Can I exchange for a different size?",
  "How long does international shipping take?",
  "Do you deliver to PO boxes?",
  "Can I cancel my order?",
  "My tent arrived damaged",
  "How much does a zip repair cost?",
  "How do I make a warranty claim?",
  "Do gift cards expire?",
  "The jacket I bought is now cheaper, can I get the difference?",
  "How do I rent a tent?",
  "Where are your stores?",
  "Can I pick up my order in store?",
  "How do I delete my account?",
  "When am I charged for my order?",
  "Which tent should I get for two people?",
  "How do I know when a sold out size is back?",
  "Is Northfold Club free?",
];

/** The questions people ask most, picked more often so the topic mix looks real. */
const COMMON = [
  "How long does a refund take?",
  "How do I start a return?",
  "How long does shipping take?",
  "Do you ship to Canada?",
  "Can I exchange for a different size?",
  "Is return shipping free?",
  "How much is express shipping?",
  "Can I cancel my order?",
];

const ORDER_ASKS = ["Where is my order?", "Can you check my order status?", "Where's my package?", "When will my order arrive?"];

/** Questions outside the help center, with the reply a teammate gave. */
const UNANSWERED: Array<[string, string]> = [
  ["Do you sell kayaks?", "We don't sell kayaks, only kayak carts and dry bags. Sorry about that! The Portage cart fits most sit-on-top kayaks if that helps."],
  ["Do you price match Amazon?", "We only adjust prices against our own site, so we can't match other retailers. If the item drops in price with us within 14 days of delivery, we refund the difference."],
  ["Do you have a student discount?", "We don't have a student discount at the moment. Northfold Club is free though, and gets you free shipping on every order plus a $25 reward for every 500 points."],
  ["Do you ship to Brazil?", "Not yet, sorry! South America is on our list for next year, and Club members hear first when we add a country."],
  ["The stove leaks gas around the valve, what do I do?", "Please stop using it and keep it outdoors. I've opened warranty claim W-3318 and emailed you a prepaid label. We'll send a replacement as soon as the carrier scans it."],
  ["When will the green Ridge 2 be back in stock?", "The Sage green Ridge 2 is due back on November 14. I've added you to the restock email, so you'll hear the moment it's live."],
  ["Is the new footprint compatible with a 2019 Ridge 2?", "Yes, the Ridge 2 floor shape hasn't changed since 2018, so the current footprint fits your 2019 tent."],
  ["I was charged twice for one order", "Sorry about the worry! The second line is a card authorization that drops off within 3 business days. I checked and only one payment was captured."],
  ["Can I bring my dog to the Denver store?", "Of course! Dogs on a leash are welcome in all three stores, and there's a water bowl by the door in Denver."],
  ["Is your down responsibly sourced?", "Yes, all the down in our jackets and sleeping bags is certified to the Responsible Down Standard, and the certificates are listed on each product page."],
  ["Do you offer team pricing for a company order of 25 jackets?", "Yes, we offer team pricing from 10 items. I've passed your details to our team sales desk and they'll email a quote within one business day."],
  ["Can I order the Alpine Shell in a custom color?", "We don't offer custom colors, sorry. The Alpine Shell comes in five colors, and we're adding two more in spring."],
];

const ITEMS = ["Ridge 2 tent, Sage", "Alpine Shell jacket, M", "Trailhead 40L pack", "Merino crew, L", "Down 15° sleeping bag", "Meadow 4 tent", "Camp chair", "Insulated bottle, 750 ml", "Rain pants, S", "Fleece hoodie, XL"];

const FOLLOW_UPS = ["Thanks, that helps!", "Perfect, thank you", "Great, thanks!", "Got it, cheers"];
const HUMAN_ASKS = ["Can I talk to a person?", "I'd like to speak to someone please", "Can a human help me with this?"];

/** Small deterministic PRNG so the seed looks the same in every browser. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The newest handoffs are still open: three wait for a person (moved to the last
 * hour so the queue looks live) and two have a reply and wait for the customer.
 */
function openRecentHandoffs(conversations: Conversation[], now: number) {
  const recent = conversations.filter((c) => c.handoffAt).slice(0, 5);
  const waits = [7, 19, 42];
  recent.forEach((c, i) => {
    const firstAgent = c.messages.findIndex((m) => m.role === "agent");
    delete c.resolvedBy;
    if (i < waits.length) {
      c.messages = c.messages.slice(0, firstAgent);
      delete c.assigneeId;
      c.status = "needs-human";
      const shift = now - waits[i] * 60_000 - Date.parse(c.handoffAt!);
      for (const m of c.messages) m.at = new Date(Date.parse(m.at) + shift).toISOString();
      c.handoffAt = new Date(Date.parse(c.handoffAt!) + shift).toISOString();
      c.startedAt = c.messages[0].at;
    } else {
      c.messages = c.messages.slice(0, firstAgent + 1);
      c.status = "agent";
    }
    c.updatedAt = c.messages[c.messages.length - 1].at;
  });
  conversations.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export function createSeed(now = Date.now()): DemoState {
  const engine = createEngine(ARTICLES, SYNONYMS);
  const rand = rng(20261029);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
  const settings = DEFAULT_SETTINGS;
  const conversations: Conversation[] = [];
  const seedOrders: Order[] = orders(now);
  let msgSeq = 0;
  const msg = (m: Omit<Message, "id">): Message => ({ id: `m${++msgSeq}`, ...m });
  const iso = (t: number) => new Date(t).toISOString();

  const assistantMsg = (r: Reply, t: number): Message =>
    msg({
      role: "assistant",
      text: r.handoff ? settings.handoffMessage : r.text,
      at: iso(t),
      answer: { kind: r.kind, confidence: r.confidence, citations: r.citations, matched: r.matched },
      order: r.order,
    });

  // About 60 days of history, busier on weekdays, so analytics can compare two 30-day periods.
  const days = 60;
  let n = 0;
  for (let d = days - 1; d >= 0; d--) {
    const date = new Date(now - d * DAY);
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    const growth = 1 + (days - d) / days / 2;
    const count = Math.round((weekend ? 3 : 5) * growth + rand() * 3);
    for (let i = 0; i < count; i++) {
      // Spread across 8 am to 10 pm, never in the future.
      const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
      let t = startOfDay + (8 + rand() * 14) * 3_600_000;
      if (t > now - 20 * 60_000) t = now - (20 + rand() * 300) * 60_000;
      const first = pick(FIRST);
      const last = pick(LAST);
      const customer: Customer = { name: `${first} ${last}`, email: `${first}.${last}@mail.example`.toLowerCase(), location: pick(PLACES) };
      const id = `c${String(++n).padStart(4, "0")}`;
      const messages: Message[] = [];
      const roll0 = rand();
      const unanswered = roll0 < 0.2;
      const lookup = !unanswered && roll0 < 0.33;
      const [question, agentText] = unanswered ? pick(UNANSWERED) : lookup ? [pick(ORDER_ASKS), ""] : [rand() < 0.4 ? pick(COMMON) : pick(ANSWERABLE), ""];
      messages.push(msg({ role: "customer", text: question, at: iso(t) }));
      let r = engine.answer(question, { threshold: settings.threshold, orders: seedOrders });
      t += 1_200 + rand() * 900;
      messages.push(assistantMsg(r, t));
      if (r.kind === "clarify") {
        // Order lookups: the customer sends the number and gets the order card.
        const ageDays = (now - t) / DAY;
        const number = `NF-${18000 + seedOrders.length * 7 + Math.floor(rand() * 7)}`;
        const status: Order["status"] = ageDays > 6 ? "delivered" : pick(["processing", "shipped", "shipped", "out-for-delivery"] as const);
        seedOrders.push({ number, email: customer.email, items: [pick(ITEMS), ...(rand() < 0.5 ? [pick(ITEMS)] : [])], status, carrier: pick(["UPS Ground", "USPS Priority", "FedEx Home"]), placedAt: iso(t - (1 + rand() * 3) * DAY), eta: iso(t + (status === "delivered" ? -1 : 1 + rand() * 3) * DAY) });
        t += 20_000 + rand() * 40_000;
        messages.push(msg({ role: "customer", text: rand() < 0.5 ? number : `It's ${number}`, at: iso(t) }));
        r = engine.answer(messages[messages.length - 1].text, { threshold: settings.threshold, orders: seedOrders });
        t += 1_000;
        messages.push(assistantMsg(r, t));
      }
      const conv: Conversation = { id, customer, status: "resolved", startedAt: messages[0].at, updatedAt: iso(t), topic: r.citations[0] && !r.handoff ? ARTICLES.find((a) => a.id === r.citations[0].articleId)?.category : undefined, messages };

      let handoff = r.handoff;
      let reply = agentText;
      if (!handoff) {
        const roll = rand();
        const rated = messages[messages.length - 1];
        if (roll < 0.62) rated.feedback = "up";
        else if (roll < 0.72) {
          rated.feedback = "down";
          // Some people who didn't like the answer ask for a person.
          if (rand() < 0.6) {
            t += 40_000 + rand() * 60_000;
            const ask = pick(HUMAN_ASKS);
            messages.push(msg({ role: "customer", text: ask, at: iso(t) }));
            const hr = engine.answer(ask, { threshold: settings.threshold });
            t += 1_000;
            messages.push(assistantMsg(hr, t));
            handoff = true;
            reply = "Hi, happy to help with this. I've looked at your account and sorted it out, you'll get a confirmation email in a minute.";
          }
        }
        if (!handoff && rand() < 0.45) {
          t += 30_000 + rand() * 90_000;
          messages.push(msg({ role: "customer", text: pick(FOLLOW_UPS), at: iso(t) }));
          const tr = engine.answer(messages[messages.length - 1].text, { threshold: settings.threshold });
          t += 900;
          messages.push(assistantMsg(tr, t));
        }
      }

      if (handoff) {
        conv.handoffAt = iso(t);
        const agent = pick(AGENTS);
        t += (2 + rand() * 12) * 60_000;
        messages.push(msg({ role: "agent", agentId: agent.id, text: reply, at: iso(t) }));
        conv.assigneeId = agent.id;
        conv.resolvedBy = "agent";
        if (rand() < 0.5) {
          t += 60_000 + rand() * 120_000;
          messages.push(msg({ role: "customer", text: pick(FOLLOW_UPS), at: iso(t) }));
        }
      } else conv.resolvedBy = "ai";

      for (const m of messages) if (Date.parse(m.at) > now - 30_000) m.at = iso(now - 30_000);
      conv.updatedAt = messages[messages.length - 1].at;
      conversations.push(conv);
    }
  }

  conversations.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  openRecentHandoffs(conversations, now);
  return {
    version: STATE_VERSION,
    articles: ARTICLES,
    synonyms: SYNONYMS,
    conversations,
    agents: AGENTS,
    orders: seedOrders,
    settings,
  };
}
