import type { Article, Category, SynonymGroup } from "./types";

/**
 * Help center of Northfold, a fictional outdoor gear store. Every policy, price,
 * address and phone number here is invented for the demo.
 */

export const CATEGORIES: Record<Category, { label: string; description: string }> = {
  orders: { label: "Orders & shipping", description: "Delivery times, tracking and changes to an order" },
  returns: { label: "Returns & exchanges", description: "Sending something back and getting your refund" },
  products: { label: "Products & sizing", description: "Fit, care and choosing the right gear" },
  warranty: { label: "Warranty & repairs", description: "Lifetime warranty claims and the repair program" },
  account: { label: "Account & payments", description: "Payment options, promo codes and your account" },
  club: { label: "Club, rentals & stores", description: "Membership points, gear rental and our stores" },
};

const day = (d: string) => `2026-${d}T09:00:00.000Z`;

export const ARTICLES: Article[] = [
  {
    id: "shipping-times",
    title: "Shipping times and costs",
    category: "orders",
    updatedAt: day("10-02"),
    body: `Orders placed before 2 pm Eastern on a business day leave our warehouse the same day. Orders placed later, on weekends or on holidays ship the next business day.

## Delivery options and prices in the US
- Standard: 3 to 5 business days. Free on orders over $75, otherwise $6.95.
- Express: 1 to 2 business days for $14.95.
- Overnight: next business day for $29, when ordered before 12 pm Eastern.

## Large items
Tents over 4 people, camp furniture and kayak carts ship by ground freight and can take 1 to 2 extra business days. They still ship free over $75.

## PO boxes and APO addresses
We ship Standard to PO boxes and APO/FPO addresses. The faster options need a street address.`,
  },
  {
    id: "international-shipping",
    title: "International shipping",
    category: "orders",
    updatedAt: day("09-18"),
    body: `We ship to Canada, the United Kingdom, the European Union, Norway, Switzerland, Australia, New Zealand, Singapore, Japan and the United Arab Emirates.

## Delivery times
International orders arrive in 5 to 10 business days. Shipping is free on international orders over $150, otherwise it is a flat $19.

## Duties and taxes
For the UK and the EU, import duties and VAT are calculated and charged at checkout, so there is nothing to pay on delivery. For every other country the carrier collects duties and taxes when the parcel arrives.

## Countries we don't ship to yet
If your country is not on the list, checkout will not offer it as a delivery address. We add countries a few times a year, and Club members hear about it first.`,
  },
  {
    id: "track-order",
    title: "Track your order",
    category: "orders",
    updatedAt: day("10-11"),
    body: `When your order ships we email a tracking link from orders@northfold.example. You can also see the status of every order under Account, then Orders.

## Tracking not updating
Tracking can take up to 24 hours to show the first scan after the shipping email arrives. If nothing changes for 3 business days, send us your order number and we will open a trace with the carrier.

## Marked as delivered but not received
Check around the delivery address and with neighbors, and wait until the end of the next business day, since carriers sometimes scan parcels early. If it still has not turned up, contact us within 14 days and we will send a replacement or a refund.`,
  },
  {
    id: "change-cancel-order",
    title: "Change or cancel an order",
    category: "orders",
    updatedAt: day("08-27"),
    body: `You can change or cancel an order within 60 minutes of placing it. Open the order from your confirmation email or under Account, then Orders, and choose Edit order or Cancel order.

## After the first hour
Once an order is being packed we can no longer change the address, the items or the shipping speed. You can still return anything you don't want once it arrives, free of charge for US orders.

## Wrong shipping address
If the order has already shipped, reply to the shipping email straight away. We will ask the carrier to redirect the parcel, which usually works for Standard and Express deliveries.`,
  },
  {
    id: "missing-damaged",
    title: "Missing or damaged items",
    category: "orders",
    updatedAt: day("09-30"),
    body: `If something arrives damaged, or an item is missing from your parcel, let us know within 14 days of delivery.

## What to send us
- Your order number, which starts with NF.
- A photo of the damage and of the shipping label.
- Which item is missing, if the parcel arrived incomplete.

We ship a replacement within one business day of hearing from you, and you don't need to send the damaged item back.`,
  },
  {
    id: "returns-policy",
    title: "Return policy",
    category: "returns",
    updatedAt: day("10-05"),
    body: `You can return unused items in their original condition within 60 days of delivery for a full refund to your original payment method.

## Used gear
Tents, jackets and other gear that has been used outdoors can be returned within 30 days for store credit instead of a refund, as long as it is clean and undamaged. After 30 days, faults are covered by our lifetime warranty instead.

## Items we can't take back
- Items marked Final sale.
- Opened food, fuel canisters and personal care products.
- Gift cards.

## Refund timing
Refunds are issued within 2 business days of your return arriving at our warehouse. Your bank may take another 3 to 5 business days to show the money in your account.`,
  },
  {
    id: "start-return",
    title: "How to start a return",
    category: "returns",
    updatedAt: day("10-05"),
    body: `Start a return at northfold.example/returns with your order number and the email address you used at checkout. Pick the items, choose a refund or an exchange, and print the label.

## Return shipping cost
Return labels are free for exchanges and for store credit. For refunds to your card, $6 is deducted from the refund to cover the label. International customers arrange and pay for their own return shipping.

## Returning in store
You can also bring returns to any Northfold store with your order number. In-store returns are always free and the refund is issued on the spot.

## Gifts
If the item was a gift, use the gift receipt number instead of an order number. The refund goes to you as store credit.`,
  },
  {
    id: "exchanges",
    title: "Exchanges for a different size or color",
    category: "returns",
    updatedAt: day("09-12"),
    body: `Exchanges are free. Start one at northfold.example/returns and choose Exchange next to the item.

## When the new item ships
We ship the replacement as soon as the carrier scans your return, so you don't have to wait for it to reach our warehouse.

## Different product or price
If you want a different product, return the original for store credit and place a new order. Any price difference is refunded or charged on the new order.`,
  },
  {
    id: "refund-status",
    title: "Where is my refund?",
    category: "returns",
    updatedAt: day("10-14"),
    body: `We send an email as soon as your refund is issued, usually within 2 business days of your return arriving at our warehouse.

## How long refunds take
- Cards: 3 to 5 business days after the refund email.
- PayPal: within 24 hours.
- Klarna: Klarna updates your payment plan within 5 business days.
- Store credit: straight away, as a code in the refund email.

If it has been more than 10 business days since your return was delivered to us, send us the tracking number of the return and we will look into it.`,
  },
  {
    id: "apparel-sizing",
    title: "Jacket and apparel sizing",
    category: "products",
    updatedAt: day("08-19"),
    body: `Every product page has a size chart with chest, waist, hip and inseam measurements. Measure over a thin base layer and compare against the chart, not against another brand's sizes.

## Fit names
- Trim fit sits close to the body and works best over a base layer.
- Regular fit leaves room for a fleece or light insulation underneath.
- Relaxed fit is cut for layering a puffy jacket underneath.

## Between two sizes
If you are between sizes in a Trim fit jacket, size up. In Regular and Relaxed fits, pick the smaller size. Exchanges are free if the fit is not right.`,
  },
  {
    id: "choosing-a-tent",
    title: "Choosing a tent",
    category: "products",
    updatedAt: day("07-30"),
    body: `Start with how many people will sleep in it, then the seasons you camp in, then how far you carry it.

## Capacity
Tent capacity assumes standard sleeping pads side by side with no room for gear. Most people choose one size up, for example the Ridge 3 for two people with packs inside.

## Three-season or four-season
Three-season tents like the Ridge and Meadow lines handle rain and wind from spring to autumn. The Summit line is a four-season tent built for snow loads and strong wind, and it is warmer but heavier.

## Weight
The Ridge 2 weighs 1.4 kg and packs to the size of a water bottle. The Meadow 4 weighs 5.2 kg and is meant for car camping.`,
  },
  {
    id: "waterproof-care",
    title: "Washing and caring for waterproof gear",
    category: "products",
    updatedAt: day("09-04"),
    body: `Dirt and body oils stop a waterproof jacket from breathing, so washing it regularly keeps it working.

## Washing a rain jacket
- Close all zips and Velcro tabs.
- Machine wash warm with a technical wash, not regular detergent.
- Never use fabric softener or bleach.
- Tumble dry on low for 20 minutes to reactivate the water-repellent finish.

## When water stops beading
If water soaks into the outer fabric after washing, apply a spray-on DWR treatment and tumble dry again. This does not mean the jacket is leaking: the membrane underneath stays waterproof.

## Tents and down
Never machine wash a tent. Rinse it by hand and dry it fully before storage. Down sleeping bags can be washed on a gentle cycle with a down wash and dried on low with clean tennis balls.`,
  },
  {
    id: "sleeping-bag-ratings",
    title: "Sleeping bag temperature ratings",
    category: "products",
    updatedAt: day("08-08"),
    body: `Our sleeping bags are tested to the ISO 23537 standard and show two ratings.

## Comfort and limit
- Comfort is the temperature at which a cold sleeper stays comfortable in a relaxed position.
- Limit is the lowest temperature at which a warm sleeper stays comfortable curled up.

Choose a bag whose comfort rating is a few degrees below the coldest night you expect. A sleeping pad with an R-value of 4 or more matters as much as the bag in cold weather.`,
  },
  {
    id: "lifetime-warranty",
    title: "Lifetime warranty",
    category: "warranty",
    updatedAt: day("10-09"),
    body: `Everything we make, from tents and backpacks to jackets and sleeping bags, is covered against defects in materials and workmanship for the life of the product. If a seam fails, a zip splits or a buckle breaks under normal use, we will repair or replace it.

## What is not covered
- Normal wear and tear, such as faded colors or worn knees.
- Damage from accidents, fire or animals.
- Gear from other brands that we resell, which carries the maker's own warranty.

## Making a warranty claim
Fill in the claim form at northfold.example/warranty with a photo of the problem and your order number or proof of purchase. We reply within 3 business days and send a free shipping label if the item needs to come to us.`,
  },
  {
    id: "repairs",
    title: "Repair program",
    category: "warranty",
    updatedAt: day("09-21"),
    body: `Our repair team in Portland fixes Northfold gear and most other brands, whether or not the damage is covered by the warranty.

## Prices
- Zip slider replacement: $15.
- Full zip replacement: from $35.
- Patch for a tear up to 5 cm: $20.
- Tent pole section: $12.

## Turnaround
Repairs take 2 to 3 weeks plus shipping. Warranty repairs are free, including shipping both ways. For paid repairs we send a quote before starting any work.`,
  },
  {
    id: "payment-methods",
    title: "Payment methods",
    category: "account",
    updatedAt: day("09-02"),
    body: `We accept Visa, Mastercard, American Express, Discover, PayPal, Apple Pay, Google Pay and Northfold gift cards.

## Pay in 4 with Klarna
Klarna lets you split orders from $50 to $1,000 into four interest-free payments every two weeks. Choose Klarna at checkout and the first payment is taken when the order ships.

## When you are charged
Cards are authorized when you place the order and charged when it ships. If part of an order ships later, you are only charged for that part when it leaves the warehouse.`,
  },
  {
    id: "promo-codes",
    title: "Promo codes, gift cards and price adjustments",
    category: "account",
    updatedAt: day("10-16"),
    body: `Enter a promo code in the cart before checkout. Only one promo code can be used per order, and codes can't be added after the order is placed.

## Price adjustments
If something you bought drops in price on our site within 14 days of delivery, contact us with your order number and we will refund the difference. This does not apply to Club rewards or clearance prices.

## Gift cards
Gift cards never expire and can be used online and in our stores. You can combine a gift card with a promo code and with another payment method.`,
  },
  {
    id: "account",
    title: "Managing your account",
    category: "account",
    updatedAt: day("08-14"),
    body: `Sign in at northfold.example/account to see orders, saved addresses, Club points and returns.

## Forgot your password
Choose Forgot password on the sign-in page and we will email a reset link that is valid for 30 minutes. Check the spam folder if it does not arrive within a few minutes.

## Changing your email or address
Update your email, addresses and communication preferences under Account, then Settings. Changes don't affect orders that have already been placed.

## Deleting your account
You can request deletion of your account and personal data under Account, then Privacy. We confirm the request by email and complete it within 30 days.`,
  },
  {
    id: "northfold-club",
    title: "Northfold Club membership",
    category: "club",
    updatedAt: day("10-01"),
    body: `Northfold Club is free to join. Members earn 1 point for every $1 spent online or in our stores.

## Using points
Every 500 points turns into a $25 reward that you can use on your next order. Rewards are valid for 12 months and can be combined with a promo code.

## Member benefits
- Free Standard shipping on every order, with no minimum.
- A 2x points bonus in your birthday month.
- Early access to seasonal sales and new countries we ship to.`,
  },
  {
    id: "gear-rental",
    title: "Gear rental",
    category: "club",
    updatedAt: day("07-22"),
    body: `Rent tents, backpacks, sleeping bags and stoves from our Denver and Portland stores. Rentals start at $12 a day with a 2-day minimum.

## Booking
Book online at northfold.example/rent at least 48 hours ahead. Pick up from 10 am on your start date and return by 6 pm on your end date.

## Damage and cleaning
Normal dirt is fine, we clean everything between rentals. Damage beyond normal use is charged at repair cost, up to the price of the item.

## Buying after renting
If you buy the same item within 30 days of the rental, we take the rental fee off the price.`,
  },
  {
    id: "stores",
    title: "Store locations and opening hours",
    category: "club",
    updatedAt: day("09-09"),
    body: `We have three stores. Every store handles returns, exchanges, repairs drop-off and Club sign-up.

## Our stores
- Denver, Lower Downtown. Phone (303) 555-0142.
- Portland, Pearl District. Phone (503) 555-0167.
- Seattle, Capitol Hill. Phone (206) 555-0118.

## Opening hours
All stores are open Monday to Saturday from 10 am to 8 pm and Sunday from 11 am to 6 pm. They close on Thanksgiving and Christmas Day.

## Buy online, pick up in store
Choose Pick up in store at checkout. Orders are ready in 2 hours during opening hours, and we hold them for 7 days.`,
  },
  {
    id: "contact-us",
    title: "Contact the support team",
    category: "account",
    updatedAt: day("10-18"),
    body: `Our support team is available by chat Monday to Friday from 8 am to 8 pm Eastern and Saturday from 9 am to 5 pm Eastern. Ask the assistant to talk to a person and a teammate joins the same chat.

## Email
Write to help@northfold.example at any time. We reply within one business day.

## Phone
Call (800) 555-0199 Monday to Friday from 9 am to 6 pm Eastern.`,
  },
  {
    id: "renew-trade-in",
    title: "Renew: trade in your used gear",
    category: "club",
    updatedAt: day("08-30"),
    body: `Trade in Northfold gear you no longer use and get store credit of up to $50 per item. We clean and repair it, then sell it at a lower price in the Renew section of our site.

## What we accept
Jackets, fleeces, tents, backpacks and sleeping bags from Northfold, in working condition. Items need to be clean, and we can't accept gear with broken zips or tears larger than 2 cm.

## How credit is calculated
Credit depends on the product and its condition, and you see the offer before you send anything. Club members get 20% more credit.`,
  },
  {
    id: "product-availability",
    title: "Out of stock items and restocks",
    category: "products",
    updatedAt: day("10-20"),
    body: `When a size or color is sold out, choose Notify me on the product page and we email you as soon as it is back.

## Restock dates
Most core products are restocked every 4 to 6 weeks. Seasonal colors and limited editions are usually not restocked.

## Pre-orders
Some new products can be pre-ordered. Your card is charged when the item ships, and you can cancel a pre-order at any time before then.`,
  },
];

/**
 * Customer wording mapped to the words the help center uses. Applied to both the
 * articles and the question, so "money back" finds the article about refunds.
 */
export const SYNONYMS: SynonymGroup[] = [
  ["refund", "money back", "reimburse", "reimbursement", "refunded"],
  ["return", "send back", "send it back", "give back", "returns"],
  ["exchange", "swap", "replace size", "different size", "another size"],
  ["shipping", "ship", "delivery", "deliver", "postage", "dispatch", "arrive", "arrival", "shipped"],
  ["track", "tracking", "where is my order", "wheres my order", "order status", "trace"],
  ["cancel", "cancellation", "stop my order", "cancelled"],
  ["damaged", "cracked", "smashed", "arrived broken", "broken in transit", "dented"],
  ["warranty", "guarantee", "guaranteed", "defect", "defective", "faulty", "broke", "broken", "breaks", "snapped", "stopped working"],
  ["repair", "fix", "mend", "patch", "fixing", "torn", "tear", "ripped", "hole"],
  ["zip", "zipper", "zippers"],
  ["price", "prices", "cost", "costs", "how much", "fee", "fees"],
  ["not received", "never arrived", "didnt arrive", "did not arrive", "hasnt arrived", "not here", "never got", "didnt get", "not arrived"],
  ["size", "sizing", "fit", "fits", "too small", "too big", "measurement"],
  ["jacket", "coat", "shell", "parka", "rain jacket", "raincoat"],
  ["wash", "washing", "clean", "laundry", "launder"],
  ["payment", "pay", "card", "credit card", "debit card", "installments", "instalments", "pay later", "afterpay"],
  ["promo", "promo code", "discount", "coupon", "voucher", "discount code"],
  ["password", "log in", "login", "sign in", "locked out"],
  ["points", "rewards", "loyalty", "loyalty program"],
  ["rent", "rental", "hire", "borrow", "renting"],
  ["store", "shop", "location", "locations", "showroom", "retail"],
  ["hours", "opening hours", "opening times", "what time", "closing time"],
  ["international", "abroad", "overseas", "worldwide", "outside the us", "another country"],
  ["duties", "customs", "import tax", "vat", "tariff", "tariffs"],
  ["restock", "back in stock", "sold out", "out of stock", "available again"],
  ["trade in", "trade-in", "sell my", "resell"],
].map((terms, i) => ({ id: `syn-${i + 1}`, terms }));
