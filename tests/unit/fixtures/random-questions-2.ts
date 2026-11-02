// Second random generator, written before the second round of changes. Seed 11 was used to
// check changes; other seeds were never looked at.
// Different templates and different noise than tests/unit/fixtures/random-questions.ts:
// texting shorthand, run-on context, questions buried in a story, missing punctuation.
export function randomQuestions2(n: number, seed: number): Array<{ q: string; want: string }> {
  let state = seed;
  const rnd = () => ((state = (state * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const ITEM = ["parka", "two person tent", "40L pack", "down bag", "fleece jacket", "camp stove", "trail runners", "waterproof jacket", "insulated vest"];
  const T: Record<string, string[]> = {
    "shipping-times": ["what does shipping cost", "when will my order ship if I order now", "is there free delivery", "how quick is express delivery", "do you ship to po boxes"],
    "international-shipping": ["can you send orders to spain", "do I pay customs on orders to canada", "is international delivery free over a certain amount", "how many days to ship to japan"],
    "track-order": ["has my order shipped yet", "I can't find my tracking number", "parcel says delivered but it isn't here", "my package hasn't moved in a week"],
    "change-cancel-order": ["I need to cancel an order", "can I update the address on my order", "I ordered the wrong size, can I change it before it ships", "can I still add an item to my order"],
    "missing-damaged": ["my {item} is damaged", "part of my order is missing", "I received the wrong product", "my {item} arrived torn"],
    "returns-policy": ["what can I return and when", "can I return a {item} after 40 days", "can I return something I used once", "are final sale items returnable"],
    "start-return": ["how do I start a return", "do I have to pay return shipping", "can I return in store", "where's the return form"],
    "exchanges": ["I'd like to exchange my {item}", "can I swap for another size", "exchange for a different colour"],
    "refund-status": ["when do I get my refund", "my refund hasn't arrived", "how long until the money is back on my card"],
    "apparel-sizing": ["how does the {item} fit", "what size should I get", "is the sizing true to size"],
    "choosing-a-tent": ["help me choose a tent", "what tent for winter", "which tent for solo backpacking"],
    "waterproof-care": ["how do I clean my waterproof jacket", "my jacket stopped repelling water", "can I tumble dry my rain jacket"],
    "sleeping-bag-ratings": ["how cold can my {item} go", "what do comfort ratings mean", "which bag for freezing nights"],
    "lifetime-warranty": ["is the {item} covered by warranty", "my {item} broke after a year", "how do I file a warranty claim"],
    "repairs": ["can my {item} be repaired", "what do repairs cost", "how long are repairs"],
    "payment-methods": ["which cards do you take", "can I pay in installments", "do you accept paypal"],
    "promo-codes": ["my discount code doesn't work", "can I stack coupons", "do gift cards ever expire"],
    "account": ["reset my password", "I can't sign in", "delete my data"],
    "northfold-club": ["what does the club cost", "how do club points work", "club member perks"],
    "gear-rental": ["do you rent gear", "how much to rent a {item}", "how do rentals work"],
    "stores": ["store opening times", "which cities have stores", "can I collect my order from a store"],
    "contact-us": ["how do I get in touch", "phone number for support", "customer service email"],
    "renew-trade-in": ["can I trade in my {item}", "do you give credit for old gear", "how does the trade in program work"],
    "product-availability": ["the {item} is out of stock", "when do you restock", "can I preorder"],
    OUT: ["what's the meaning of life", "book me a flight", "do you sell fishing rods", "what's your ceo's name", "are you hiring drivers", "translate hello into german"],
  };
  const SHORT: Array<[RegExp, string]> = [[/\byou\b/g, "u"], [/\byour\b/g, "ur"], [/\bplease\b/g, "pls"], [/\bhow\b/g, "hw"], [/\bwhat\b/g, "wat"], [/\bbecause\b/g, "cuz"]];
  const STORY = ["so I ordered last week for a trip, ", "my partner bought this for me and ", "first time buying from you guys, ", "I'm going camping on saturday and ", "I already emailed but no reply, ", "not sure if this is the right place but "];
  const END = ["", "", " thx", " ty", "...", " ?", " !!", " please help"];
  function noise(s: string) {
    let q = s.replace(/\{item\}/g, () => pick(ITEM));
    if (rnd() < 0.3) for (const [re, w] of SHORT) q = q.replace(re, w);
    if (rnd() < 0.3) q = pick(STORY) + q;
    if (rnd() < 0.2) q = q.replace(/[?.!,']/g, "");
    if (rnd() < 0.25) {
      const words = q.split(" ");
      const i = Math.floor(rnd() * words.length);
      if (words[i].length > 4) words[i] = words[i].slice(0, -1); // last letter cut off
      q = words.join(" ");
    }
    if (rnd() < 0.4) q = q.toLowerCase();
    return q + pick(END);
  }
  const ids = Object.keys(T);
  return Array.from({ length: n }, () => {
    const want = pick(ids);
    return { q: noise(pick(T[want])), want };
  });
}
