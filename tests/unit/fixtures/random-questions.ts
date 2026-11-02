// Random customer questions for quality checks: templates per article, slot fillers and
// real-world noise (typos, casing, filler, emotional openers, sign-offs). The engine was
// never tuned on these seeds; see tests/unit/quality.test.ts.

export function randomQuestions(n: number, seed: number): Array<{ q: string; want: string }> {
  let state = seed;
  const rnd = () => ((state = (state * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const ITEM = ["jacket", "tent", "backpack", "sleeping bag", "fleece", "stove", "boots", "rain shell", "daypack", "hiking pants"];
  const STATE = ["ohio", "texas", "oregon", "new york", "colorado", "maine", "arizona"];
  const COUNTRY = ["canada", "germany", "japan", "australia", "the uk", "france", "norway"];
  const COLOR = ["black", "blue", "green", "red", "grey"];
  const STORE = ["denver", "portland", "seattle"];
  const fill = (s: string) =>
    s.replace(/\{item\}/g, () => pick(ITEM)).replace(/\{state\}/g, () => pick(STATE)).replace(/\{country\}/g, () => pick(COUNTRY))
      .replace(/\{color\}/g, () => pick(COLOR)).replace(/\{store\}/g, () => pick(STORE)).replace(/\{n\}/g, () => String(2 + Math.floor(rnd() * 12)));

  const T: Record<string, string[]> = {
    "shipping-times": ["how fast is standard shipping", "what are your shipping rates", "how many days for delivery to {state}", "how much do I need to spend for free shipping", "does express get here by friday", "how much does overnight delivery cost", "when do orders placed on sunday ship"],
    "international-shipping": ["do you deliver to {country}", "how long does shipping to {country} take", "will I pay import duties in {country}", "what does international shipping cost", "which countries do you ship to"],
    "track-order": ["where's my package", "how can I track my order", "tracking says delivered but there's no package", "my tracking hasn't updated in {n} days", "my parcel is late"],
    "change-cancel-order": ["can I cancel my order", "I need to change my shipping address", "can I change the size on my order", "please cancel the order I just placed", "how do I edit my order"],
    "missing-damaged": ["my {item} arrived damaged", "an item was missing from my box", "you sent the wrong {item}", "the {item} came broken", "my order arrived with something missing"],
    "returns-policy": ["what is your return policy", "how many days do I have to return a {item}", "can I return a used {item}", "can I return sale items", "is there a time limit on returns"],
    "start-return": ["how do I return my {item}", "where do I get a return label", "can I return my online order at the {store} store", "how do I send my order back", "do returns cost anything"],
    "exchanges": ["can I exchange my {item} for a bigger size", "I want the {item} in {color} instead", "how do I exchange for a different size", "swap my {item} for a smaller one"],
    "refund-status": ["where is my refund", "I still haven't got my refund", "how long do refunds take", "when will I get my money back"],
    "apparel-sizing": ["what size {item} should I buy", "does the {item} run small", "I'm between two sizes", "how does your sizing work"],
    "choosing-a-tent": ["which tent is best for {n} people", "what's the lightest tent you sell", "do I need a four season tent", "what tent should I get for backpacking"],
    "waterproof-care": ["how do I wash my rain jacket", "my jacket is wetting out", "can I put my rain shell in the washing machine", "how do I restore water repellency"],
    "sleeping-bag-ratings": ["what do the sleeping bag temperature ratings mean", "what's the difference between comfort and limit rating", "which sleeping bag for cold nights", "how warm is a {n} degree bag"],
    "lifetime-warranty": ["is my {item} under warranty", "how does the lifetime warranty work", "my {item} broke, is it covered", "what isn't covered by the warranty"],
    "repairs": ["can you repair my {item}", "how much is a zipper repair", "do you fix tears", "how long does a repair take"],
    "payment-methods": ["what payment methods do you accept", "can I pay with paypal", "do you take klarna", "when is my card charged", "can I use apple pay"],
    "promo-codes": ["how do I use a promo code", "can I use two discount codes", "do gift cards expire", "the price went down after I bought it"],
    "account": ["I can't log in", "how do I reset my password", "how do I change my email", "how do I delete my account"],
    "northfold-club": ["how does the club work", "how do I earn points", "what are the club benefits", "is the membership free"],
    "gear-rental": ["can I rent a {item}", "how much is gear rental", "how do I book a rental", "what if I damage a rental"],
    "stores": ["where is your {store} store", "what are your store hours", "are you open on sunday", "do you have a store in {store}"],
    "contact-us": ["how do I contact support", "what's your phone number", "what's your email address", "when is chat support available"],
    "renew-trade-in": ["can I trade in my old {item}", "how much credit for a used {item}", "do you buy back used gear", "how does trade in work"],
    "product-availability": ["when will the {item} be back in stock", "the {item} is sold out", "can I pre-order", "will you restock the {color} {item}"],
    OUT: ["do you sell kayaks", "what's the best hiking trail in {state}", "tell me a joke", "who won the game last night", "can you help with my math homework", "do you have a student discount", "is the {item} vegan", "what's the stock price of northfold", "recommend a restaurant in {store}"],
  };

  const OPEN = ["", "", "", "hi, ", "hello! ", "quick question: ", "ugh. ", "hey, ", "sorry to bother you but ", "I've been waiting all week and I'm really frustrated. "];
  const CLOSE = ["", "", "", "?", "??", " thanks", " thank you!", " pls", " asap", " 🙏"];
  const KEYS = "qwertyuiopasdfghjklzxcvbnm";
  function typo(s: string) {
    const words = s.split(" ");
    const i = Math.floor(rnd() * words.length);
    const w = words[i];
    if (w.length < 5) return s;
    const j = 1 + Math.floor(rnd() * (w.length - 2));
    const op = Math.floor(rnd() * 4);
    words[i] = op === 0 ? w.slice(0, j) + w.slice(j + 1) // drop
      : op === 1 ? w.slice(0, j) + w[j + 1] + w[j] + w.slice(j + 2) // swap
        : op === 2 ? w.slice(0, j) + w[j] + w.slice(j) // double
          : w.slice(0, j) + pick(KEYS.split("")) + w.slice(j + 1); // wrong key
    return words.join(" ");
  }
  function noise(s: string) {
    let q = s;
    if (rnd() < 0.35) q = typo(q);
    if (rnd() < 0.1) q = typo(q);
    if (rnd() < 0.3) q = q.toLowerCase();
    else if (rnd() < 0.3) q = q[0].toUpperCase() + q.slice(1);
    if (rnd() < 0.05) q = q.toUpperCase();
    return pick(OPEN) + q + pick(CLOSE);
  }

  const ids = Object.keys(T);
  return Array.from({ length: n }, () => {
    const want = pick(ids);
    return { q: noise(fill(pick(T[want]))), want };
  });
}
