# Premium (Supporter subscription)

Built 2026-10-28, commit `b2d9507`. Perks are still to be discussed.

## Status

- The main menu's **News** is now **Premium**, with a gold crown icon (`premiumIcon` in `client/src/art/MenuIcons.ts`).
- Stripe is ported from console8. It's **off until the keys are set** (see Setup).
- Verified: both sides typecheck, the client builds, the tables are made on start, `POST /stripe/webhook` answers 400 while billing is off, other HTTP gets 404, and the WebSocket still connects.
- **Not verified yet:** the window's layout in a browser, and a real Stripe checkout (there are no keys yet).

## The window (`client/src/components/premium/Premium.ts`)

- The crown, "Supporter" and the price. The price is read from Stripe, so what's shown always matches what's charged; till Stripe's set up it shows `PRICE` ($4.99/mo, "not on sale just yet").
- Your status: "Renews Nov 28" (nothing for one that won't renew, or one given by hand - a far-off `premium_until` such as 2100).
- What you get (`PERKS`, one line each) and how it's billed.
- **Subscribe** or **Manage** along the bottom. Guests can't subscribe, and the server refuses them too.
- On coming back from Stripe (`?billing=done|cancel`), the window opens and says "Thank you" or "Checkout cancelled - nothing was charged", then tidies the address.

## Server (`server/src/managers/billing/`)

- `BillingManager` (`IBS.billing`) follows console8:
  - `C2S.PREMIUM_BUY` makes a Checkout Session and answers `S2C.PREMIUM_CHECKOUT { u }`, which the browser goes to.
  - `C2S.PREMIUM_MANAGE` opens the Customer Portal (change card, cancel).
  - `S2C.PREMIUM_STORE { on, p: price, u: premium until, s: renews }` is sent on sign-in and on changes.
  - `S2C.PREMIUM_REFUSED { w }` says why something couldn't be done.
- **Only the webhook grants Premium.** `customer.subscription.created/updated/deleted` set `player_subscription` and `player.premium_until`, so everything already checking `PlayerRecord.isPremium()` follows. Each event is handled once (`stripe_event`).
- `app.ts`: the game server's port now serves plain HTTP for `POST .../stripe/webhook`, alongside the WebSocket.
- Tables (`BillingRecord`, made on start): `player_stripe_customer`, `player_subscription`, `stripe_event`.
- `network/PremiumHandler` limits buy/manage asks to 5 a minute per player.
- The `.env` reading moved out of `DatabaseManager` into `utils/Env.ts` (`ENV`).

## Setup (`server/.env`, see `.env.example`)

- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`: billing stays off without both.
- `STRIPE_PRICE_PREMIUM`: a recurring $4.99/month Price made in the Stripe Dashboard. Premium isn't for sale without it.
- `PUBLIC_URL`: the client's address, where Stripe sends players back to.
- Dashboard webhook endpoint: `https://<server>/stripe/webhook` (any path ending in it works), sending the three `customer.subscription.*` events and `charge.dispute.created`.
- Local testing: `stripe listen --forward-to localhost:5301/stripe/webhook`
- Turn on the Customer Portal in the Dashboard.
- Dashboard, Settings, Public details: the Terms of Service and Privacy Policy URLs (`client/dist/legal/`). Checkout makes buyers tick "I agree to the Terms of Service and Refund Policy" (`consent_collection`) and fails if the Terms URL isn't set.

## Refunds, disputes, tax, deleted accounts

The policy is `client/dist/legal/refunds.html`: a full refund within 14 days of the first payment, none for renewals or part months, always for mistakes.
- **Refunds** are done by hand: Stripe Dashboard, the payment, Refund. If Supporter should end too, cancel the subscription there as well ("immediately"); its `customer.subscription.deleted` ends premium.
- **Disputes** (chargebacks): `charge.dispute.created` cancels the customer's active subscriptions at once, so they aren't charged again; premium ends with the subscription. Answer the dispute in the Dashboard.
- **Tax:** `STRIPE_AUTOMATIC_TAX=1` turns on Stripe Tax at checkout (set up your tax registrations in the Dashboard first). Off by default.
- **Deleting an account** (Settings, `server/src/managers/account`) deletes the Stripe customer first, which cancels its subscription straight away. If Stripe can't be reached, nothing's deleted.

## Perks

**Already live** (the only ones the window lists):
- A crown by your name in chat, and your name in gold (at the game tables too, though the window no longer lists it).
- Heroes keep working 72h after signing out, instead of 24 (`HeroTasks.AWAY_PREMIUM_MS`).
- A to-do list of 20 for each hero instead of 10 (`TODO_PREMIUM`, `todoMost` in `shared/Tasks.ts`; checked on the server too).
- 10 beds in the barracks instead of 5 (`BARRACKS_SLOTS_PREMIUM`, `barracksSlots` in `shared/Heroes.ts`; checked on the server).

The "what it never gives" section was cut (the user, 2026-10-28).

**Ideas to discuss:**
- **Convenience:** longer away time; a longer to-do list per hero; more roster slots (`PlayerRecord.maxMembers`/`maxParties` already have a TODO saying they depend on the subscription); one extra free hire a day on the hiring board.
- **Looks:** camp tents and banners in Supporter colours; a crown on the leaderboards; name colours you choose; special emotes in camp chatter.
- **Social:** more favourite friends than 5; private game rooms; a Supporters chat channel.
- **Information:** a "while you were away" report on sign-in; a history of your heroes' fights.

When perks are added, update `PERKS` in `Premium.ts` so the window never promises more than the server does.

## Cosmetics catalog (who each look is for)

Each hero cosmetic choice is **Free**, **Supporter** or in a **pack** (`Catalog` in `shared/Wardrobe.ts`). Sort them in the admin menu's **Cosmetics** editor: drag a choice into another band, or click several and drag them together. Changes are only kept once you press Save, and everyone online gets the new catalog straight away.
- Tables: `cosmetic_pack`, `cosmetic_tier` (look, value, tier: 0 free, -1 Supporter, else a pack id), and `player_cosmetic_pack` (who owns which pack). Until something is sorted, dyes 16-31 and the choices added since the first sorting (`NEWER_FROM`: hairstyles 8+, outfits 6+, backdrops 20+) are Supporter and everything else is free.
- Wayfolk's own hairstyles and outfits (not Lithalia's) are in `client/src/people/ownlooks.json`, numbered on from Lithalia's.
- **Packs can't be bought yet.** To give a player a pack, add a `player_cosmetic_pack` row by hand. The server won't remove a pack that anyone owns; empty it instead.
- Heroes on the hiring board only get free looks.
