// The messages, both ways: { r: route, ...short fields }. A handler is picked by
// the route name's first three letters (TIT, ADV, HER...). Add new ones at the end.

export enum C2S {

    TITLE_SIGN_IN,
    TITLE_SIGN_UP,

    ADVENTURER_HIRE,

    // (the node editor's: each in the place an older one was, so the others keep their numbers)
    NOED_NODE_LIST,     // {}: every node (NOED_NODE_LIST back)
    NOED_NODE_ADD,      // { t: token, x, y, e?: [ids to link it to], u?: [a, b] the link it splits, n?, s?, ty?, te? }
    NOED_NODE_REMOVE,   // { t: token, i: [ids] }: not places, nor where heroes are or are going
    NOED_NODE_PUT,      // { t: token, n: [nodes: partial for one there, whole to bring one back], d?: [ids to remove] }: all or nothing

    // (unused: the old location editor, gone; kept so the others keep their numbers)
    LOED_LOCATION_ADD,
    LOED_LOCATION_REMOVE,
    LOED_LOCATION_UPDATE,

    HERO_BOARD,         // {}: the offers on the hiring board
    HERO_HIRE,          // { i: offer }
    HERO_TODO,          // { h: hero id, q: [Task], f: default TaskKind }: a hero's to-do list

    CHAT_SAY,           // { c: channel, t: text }

    FRIEND_LIST,        // {}: the whole list (FRIEND_LIST back)
    FRIEND_ASK,         // { n: their name }
    FRIEND_ANSWER,      // { i: player id, y: 1 yes, 0 no }: an ask of theirs
    FRIEND_CANCEL,      // { i: player id }: an ask of yours
    FRIEND_REMOVE,      // { i: player id }
    FRIEND_FAVOURITE,   // { i: player id, f: 1 on, 0 off }
    FRIEND_BLOCK,       // { i: player id }
    FRIEND_UNBLOCK,     // { i: player id }
    FRIEND_FIND,        // { i: player id }: where their heroes are, once (FRIEND_HEROES back)

    WHISPER_SAY,        // { i: friend's player id, t: text }
    WHISPER_SEEN,       // {}: the whispers to you, seen

    HERO_EQUIP,         // { h: hero id, s: Slot, i: item id from the stash (0: take off what is there) }
    HERO_LOOKS,         // { h: hero id, l: Looks }: their cosmetics (shared/Wardrobe.ts; HERO_LOOKS back)
    HERO_SCENE,         // { h: hero id, s: [scene, pose] }: their status window's backdrop and pose (shared/Scenes.ts; HERO_SCENE back)

    GAME_ROOMS,         // { g: Game }: a game's rooms (GAME_ROOMS back)
    GAME_WATCH,         // { g: Game, i: room id }: into a room, watching (out of any other; GAME_ROOM back)
    GAME_LEAVE,         // {}: out of the room (and its seat)
    GAME_SIT,           // { s: seat }: in the room you're watching
    GAME_STAND,         // {}: up from your seat, still watching
    GAME_SAY,           // { t: text }: in the room's chat
    GAME_HIT,           // {}: another card, on your turn
    GAME_HOLD,          // {}: no more cards (blackjack's "stand"), on your turn
    GAME_STATS,         // { n: player's name }: their blackjack (GAME_STATS back)

    LEADER_BOARD,       // { b: board (shared/Leaderboards.ts) }: its top rows and where you stand (LEADER_BOARD back)

    PREMIUM_BUY,        // {}: subscribe (PREMIUM_CHECKOUT back, Stripe's page)
    PREMIUM_MANAGE,     // {}: change your card or cancel (PREMIUM_CHECKOUT back, Stripe's portal)
    PREMIUM_COLOR,      // { k: its place in NAME_COLORS (shared/Chat.ts) }: a Supporter's name colour (PREMIUM_STORE back)

    COSMETIC_SAVE,      // { c: Catalog }: an editor's sorting of the cosmetics (shared/Wardrobe.ts; COSMETIC_CATALOG back, to everyone)

    PLAYER_RENAME,      // { n: display name (shared/Names.ts) }: yours (PLAYER_NAME or PLAYER_REFUSED back)

    MARKET_LIST,        // { t: Sort or "" (all), q: search }: listings on the market (shared/Market.ts; MARKET_LIST back)
    MARKET_MINE,        // {}: your listings, buy orders and recent sales (MARKET_MINE back)
    MARKET_SELL,        // { i: item id, n: amount, p: price each }: from your stash onto the market, sold first to buy orders at that or more (MARKET_DONE or MARKET_REFUSED back)
    MARKET_BUY,         // { l: listing id, n: amount, p: price each (as you saw it) }: some or all of a listing (MARKET_DONE or MARKET_REFUSED back)
    MARKET_CANCEL,      // { l: listing id }: one of yours off the market, back to your stash (MARKET_DONE or MARKET_REFUSED back)

    CHAT_REPORT,        // { k: line number (ChatLine.k), w: reason (REPORT_REASONS) }: a line of someone else's, for the moderators (CHAT_NOTE back)

    PLAYER_GUIDE_SEEN,  // { s: Step }: a first step done in the client (shared/Guide.ts StepDef.seen: the Inventory opened)

    GUILD_FOUND,        // { n: name, t: tag }: a guild of your own, for GUILD_COST gold (shared/Guilds.ts; GUILD and GUILD_DONE, or GUILD_REFUSED, back)
    GUILD_BROWSE,       // { q: search }: guilds to join (GUILD_LIST back)
    GUILD_JOIN,         // { i: guild id }: one open to all
    GUILD_ANSWER,       // { i: guild id, y: 1 yes, 0 no }: an invite to you
    GUILD_INVITE,       // { n: their name }: into yours (an officer or the leader)
    GUILD_UNINVITE,     // { i: player id }: an invite of your guild's taken back
    GUILD_LEAVE,        // {}
    GUILD_KICK,         // { i: player id }
    GUILD_RANK,         // { i: player id, k: Rank (MEMBER or OFFICER) }: the leader's
    GUILD_LEAD,         // { i: player id }: the lead handed to them (you an officer then)
    GUILD_NOTICE,       // { m: text }: along the guild's top
    GUILD_OPEN,         // { o: 1 open to all, 0 by invite }
    GUILD_DISBAND,      // {}: the leader's: the guild gone
    GUILD_SAY,          // { t: text }: in the guild's chat
    GUILD_HALL,         // {}: the guild hall's storage (GUILD_HALL back; shared/Guilds.ts)
    GUILD_PUT,          // { i: item, n: how many }: from your stash into the hall
    GUILD_TAKE,         // { i: item, n: how many }: out of it, as your rank allows

    HERO_JOURNAL,       // { h: hero id }: their journal (shared/Journal.ts; HERO_JOURNAL back)

    // signing in (before it: AuthConnection) and your account (once in: PlayerHandler)
    TITLE_FORGOT_PASSWORD,  // { l: email }: a password reset link emailed, if it's an account's (TITLE_FORGOT_SENT back either way)
    TITLE_CONFIRM_EMAIL,    // { tok }: from a confirm link (?confirm=): that email proven yours (TITLE_EMAIL_CONFIRMED or TITLE_REFUSED back)
    PLAYER_SAVE_ACCOUNT,    // { t: "email", l: email, p: password } or { t: "google", tok: ID token }: a guest's account saved as that, keeping everything (PLAYER_ACCOUNT_SAVED or PLAYER_SAVE_REFUSED back)
    PLAYER_SIGN_OUT,        // { tok: this browser's remember-me token }: it stops working (PLAYER_SIGNED_OUT back)
    PLAYER_RESEND_CONFIRM,  // {}: the confirm link for your email sent again (PLAYER_CONFIRM_SENT or PLAYER_SAVE_REFUSED back)

    ANALYTICS_GET,      // { s: 1, staff counted too }: an editor's snapshot of the game (shared/Analytics.ts; ANALYTICS or ANALYTICS_REFUSED back)
    ANALYTICS_HELLO,    // { d: "desktop" | "tablet" | "phone", s: where they came from }: as they sign in, for their session (server analytics/Tracker)
    ANALYTICS_PRESENCE, // { a: 1 playing, 0 idle }: as it changes (shared/Analytics.ts IDLE_AFTER_MS)
    ANALYTICS_OPENED,   // { w: ComponentType's name }: a window opened

    // your data (server managers/account; the privacy policy, client/dist/legal)
    PLAYER_EXPORT,      // {}: a copy of everything kept about you (PLAYER_EXPORT or PLAYER_DELETE_REFUSED back)
    PLAYER_DELETE,      // { c: "DELETE", p: password (email accounts) }: your account erased (PLAYER_DELETED, then the connection closes; or PLAYER_DELETE_REFUSED)

    // trading between two players (shared/Trade.ts)
    TRADE_ASK,          // { i: their player id }: asking someone signed in to trade (TRADE_ASKED to both, or TRADE_REFUSED)
    TRADE_ANSWER,       // { y: 1 yes, 0 no }: the ask to you
    TRADE_CANCEL,       // {}: your ask taken back, or the trade called off
    TRADE_OFFER,        // { g: gold, i: [[item id, amount]] }: your whole offer (both Readys cleared)
    TRADE_READY,        // { v: 1 ready, 0 not }
    TRADE_CONFIRM,      // {}: once both are ready; when both have, it goes through

    // the admin panel (shared/Admin.ts; editors and up: giving things, roles and purchases admins only)
    ADMIN_FIND,         // { q: name or #id ("": those signed in) }: players (ADMIN_FOUND back)
    ADMIN_PLAYER,       // { i: player id }: their account (ADMIN_PLAYER back)
    ADMIN_MUTE,         // { i: player id, m: minutes (0: unmuted) } (ADMIN_PLAYER and ADMIN_DONE back)
    ADMIN_GOLD,         // { i: player id, g: gold (less than 0: taken) } (ADMIN_PLAYER and ADMIN_DONE back)
    ADMIN_ROLE,         // { i: player id, o: Role } (ADMIN_PLAYER and ADMIN_DONE back)
    ADMIN_REPORTS,      // {}: the open chat reports (ADMIN_REPORTS back)
    ADMIN_REPORT_DONE,  // { i: report number } (ADMIN_REPORTS back)
    ADMIN_SAY,          // { t: text }: a line in General from "Announcement", to everyone
    ADMIN_EVENT,        // { k: EventKind (-1: any), s?: 1 k is a SightKind instead (shared/Sights.ts) }: an event (or a sight) started somewhere it fits
    ADMIN_STASH,        // { i: player id }: their stash (ADMIN_STASH back)
    ADMIN_ITEM,         // { i: player id, m: item, n: amount (less than 0: taken) }: admins (ADMIN_STASH and ADMIN_DONE back)
    ADMIN_MARKET,       // { i: player id }: their market history (ADMIN_MARKET back)
    ADMIN_PURCHASES,    // { i: player id }: admins: Supporter, subscription, packs (ADMIN_PURCHASES back)
    ADMIN_PACK,         // { i: player id, k: pack id, v: 1 given, 0 taken }: admins (ADMIN_PURCHASES and ADMIN_DONE back)
    ADMIN_SUPPORTER,    // { i: player id, d: days (ADMIN_SUPPORTER_DAYS) }: admins: Supporter time given (ADMIN_PURCHASES and ADMIN_DONE back)
    ADMIN_LOG,          // { i: player id }: what staff did to them (ADMIN_LOG back)
    ADMIN_DEMO,         // { o: 1 on, 0 off }: demo mode, told of every party and fight (ADMIN_DEMO_PARTIES and ADMIN_DEMO_FIGHT while on)
    ADMIN_BAN,          // { i: player id, d: days (ADMIN_BAN_DAYS; -1: unbanned), w: why } (ADMIN_PLAYER and ADMIN_DONE back)
    ADMIN_FEEDBACK,     // {}: the open feedback (shared/Feedback.ts; ADMIN_FEEDBACK back)
    ADMIN_FEEDBACK_DONE,    // { i: its number }: dealt with (ADMIN_FEEDBACK back)

    FEEDBACK_SEND,      // { k: FEEDBACK_KINDS, t: the words, v: the client's version, d: device }: (FEEDBACK_SENT or FEEDBACK_REFUSED back)

    HERO_CHOICE,       // { h: hero id, o: the way picked, by its place in the moment (-1: let them pick) }: the answer to a moment on the road (shared/Choices.ts; HERO_CHOSE back)

    SEASON_TITLE,       // { t: one of your titles, by its place in SeasonState.t (-1: none) }: the one shown by your name (SEASON back)

    MARKET_WANTED,      // { t: Sort or "" (all), q: search }: buy orders on the market (shared/Market.ts; MARKET_WANTED back)
    MARKET_ORDER,       // { i: item id, n: amount, p: price each at most }: a buy order, its gold set aside (MARKET_DONE or MARKET_REFUSED back)
    MARKET_FILL,        // { o: order id, n: amount, p: price each (as you saw it) }: some of your stash sold to an order (MARKET_DONE or MARKET_REFUSED back)
    MARKET_UNORDER,     // { o: order id }: one of yours off the market, its gold back (MARKET_DONE or MARKET_REFUSED back)
    MARKET_HISTORY,     // { i: item id }: what it's sold for (MARKET_HISTORY back)

    EVENT_PAST,         // {}: the events window's log of those over (EVENT_PAST back)

    MAIL_LIST,          // {}: your mailbox (shared/Mail.ts; MAIL_LIST back)
    MAIL_SEND,          // { n: their name, t: note, g: gold, i: [[item id, amount]] }: a letter to a friend or guildmate (MAIL_DONE or MAIL_REFUSED back)
    MAIL_READ,          // { i: letter id }: opened (MAIL_UNREAD back)
    MAIL_TAKE,          // { i: letter id }: what's in it into your stash (MAIL_DONE and MAIL_LIST, or MAIL_REFUSED, back)
    MAIL_RETURN,        // { i: letter id }: sent back with what's in it (MAIL_DONE and MAIL_LIST, or MAIL_REFUSED, back)
    MAIL_DELETE,        // { i: letter id }: one with nothing left in it thrown away (MAIL_LIST back)

    EVENT_BUY,          // { i: sight id, k: lot, n: amount }: from a wandering merchant, a hero of yours in its town (shared/Sights.ts; EVENT_BOUGHT or EVENT_REFUSED back)

    // (the map editor's: shared/MapEdit.ts)
    MAPED_OPEN,         // {}: the map as the server has it (MAPED_WORLD back)
    MAPED_PAINT,        // MapPaint: tiles and corners painted (MAPED_PAINTED or MAPED_REFUSED back)
    MAPED_PLACE,        // { t: token, i: place id (0: a new one), a: MapPlace (null: removed) }: a place put, changed or taken off the map (MAPED_PLACED or MAPED_REFUSED back)

    HERO_VIEW,          // { h: hero id }: someone else's hero in a party with one of yours or at a place (EVENT_HERE), for their status window (HERO_VIEW back)
    EVENT_HERE,         // { p: place id }: the others' heroes there now, for its window (EVENT_HERE back)

    HERO_DISMISS,       // { h: hero id }: a hero let go, never the last (HERO_DISMISSED back)

    PLAYER_PROFILE,     // { n: their name }: a player's profile (shared/Profile.ts; PLAYER_PROFILE or PLAYER_PROFILE_REFUSED back)
    PLAYER_PROFILE_SET, // { a: about, v: 1 private }: yours (PLAYER_PROFILE or PLAYER_PROFILE_REFUSED back)

    GAME_BET,           // { s: slime }: the track's stake on it, at the slime race you're watching (or your bet moved to it)

    HERO_REROLL,        // {}: new offers on the hiring board now, for gold (rerollPrice; HERO_BOARD or HERO_REFUSED back)

    // formed parties (shared/Parties.ts): PARTY_LIST back with any change, PARTY_REFUSED if it can't be
    PARTY_MAKE,         // { h: [hero ids, yours, in none], n: name }: a new party of them
    PARTY_ADD,          // { i: party id, h: hero id }: one of your heroes into a party of yours (in none)
    PARTY_ASK,          // { i: party id, n: a hero's name }: that hero asked into a party of yours, their player signed in having 20s to answer (one of your own just comes in)
    PARTY_UNASK,        // { i: party id, p: player id }: an ask of yours taken back
    PARTY_ANSWER,       // { i: party id, h: the hero asked (0: no) }: an ask to you answered
    PARTY_LEAVE,        // { h: hero id }: a hero of yours out of their party
    PARTY_KICK,         // { i: party id, h: hero id }: anyone's out of a party of yours
    PARTY_DISBAND,      // { i: party id }: a party of yours, everyone out of it
    PARTY_TODO,         // { i: party id, q: [Task], b: backup Task or null }: a party of yours's to-do list (as HERO_TODO)
    PARTY_RENAME,       // { i: party id, n: name }
    PARTY_INVITES,      // { v: Invites }: who may ask your heroes in
    PARTY_PUBLIC,       // { i: party id, f: 1 public (its room filled by helpers), 0 private }

    PLAYER_CHEST_OPEN,  // { i: chest id, b?: 1 a mimic beaten }: the loot chest up now opened (shared/Chests.ts; PLAYER_CHEST_OPENED back, PLAYER_CHEST_MIMIC if it bites, or PLAYER_CHEST with none if it's gone)
    PLAYER_ACHIEVE,     // { a: achievement id }: one done, as the client saw it (shared/Achievements.ts; PLAYER_ACHIEVED back the first time)

    HERO_SWAP,          // { o: hero id off the roster into the barracks (0: none), i: hero id out of it onto the roster (0: none) }: either or both, a swap (shared/Heroes.ts barracksSlots; HERO_SWAPPED or HERO_REFUSED back)

}

export enum S2C {

    NETWORK_UPDATED,

    TITLE_GUEST_CREDENTIALS,
    TITLE_SIGNED_IN,
    TITLE_REFUSED,      // { w: why, e: what to tell them }: w "credentials", "wait" (too many tries), "busy" (signing in already), "type", "guest" (forget this browser's guest login), "token" (forget its remember-me token), "reset" / "confirm" (that link's used up), "banned" (AdminManager.ban), "account" (anything else)

    ADVENTURER_HIRED,

    NOED_NODE_LIST,     // { n: [node] }
    NOED_NODES_CHANGED, // { t?: token (yours; none: another editor's), n: [nodes as they are now], d: [ids removed], a?: id added }
    NOED_REFUSED,       // { t: token, w: why }
    NOED_GRAPH,         // { n: [node] }: the travel graph, to everyone online, a moment after it's edited

    // (unused: the old location editor, gone; kept so the others keep their numbers)
    LOED_LOCATION_ADDED,
    LOED_LOCATION_REMOVED,
    LOED_LOCATION_UPDATED,

    HERO_BOARD,         // { e: ms until new offers, o: [offer or null (hired)], f: the first is free, c: a refresh's price now, g?: gold left (after one) }
    HERO_HIRED,         // { h: hero row [id, HeroData, HeroState], g: gold left, b?: 1 into the barracks, the roster full }
    HERO_REFUSED,       // { w: why }
    HERO_STATE,         // { h: hero id, s: HeroState, v: their skills' XP (HeroData.v) }: where a hero is, what they're doing and what they've learned
    HERO_STASH,         // { g: gold, i: [[item id, amount]] (only those changed; 0: none left), q: 1 only moved on or off a hero }: what heroes gathered, made and earned

    CHAT_SAID,          // { l: ChatLine }: a line said, to everyone (the last CHAT_KEPT a channel come with signing in, `chat`)

    FRIEND_LIST,        // { l: FriendList }: the whole list, whenever it changes (and with signing in, `friends`)
    FRIEND_REFUSED,     // { w: why }: an ask or the like that couldn't be
    FRIEND_DONE,        // { w: what }: an ask sent and the like
    FRIEND_PRESENCE,    // { f: FriendInfo }: a friend signed in or out
    FRIEND_HEROES,      // { o: friend's player id, h: [hero row] }: all their heroes (a favourite's with signing in, `friendHeroes`)
    FRIEND_HERO,        // { o: friend's player id, h: hero row }: a favourite's hero set off, got there or started something else
    FRIEND_GONE,        // { o: player id }: their heroes off your map (no longer a favourite or a friend)

    WHISPER_SAID,       // { l: Whisper }: to the two of them (those to you that waited, and the last ones, with signing in, `whispers`)

    HERO_GEAR,          // { h: hero id, g: HeroData.g }: what a hero wears and carries, changed (the stash with it, HERO_STASH)
    HERO_LOOKS,         // { h: hero id, l: Looks }: a hero's cosmetics, changed
    HERO_SCENE,         // { h: hero id, s: [scene, pose] }: a hero's status scene, changed

    GAME_ROOMS,         // { g: Game, l: [RoomInfo] }
    GAME_ROOM,          // { o: RoomState (a slime race's: RaceState), l: [RoomLine] (coming in only) }: the room you watch, whenever who sits or watches or the round changes
    GAME_SAID,          // { l: RoomLine }: to everyone in the room
    GAME_REFUSED,       // { w: why }
    GAME_GOLD,          // { g: gold }: yours, after paying an ante or winning a pot
    GAME_STATS,         // { o: BjStats }

    HERO_FIGHT,         // { h: hero id, f: Fight }: a fight of theirs just now (shared/Fights.ts), for their window to play back

    EVENT_LIST,         // { l: [EventView] }: the events on and the boons in effect (shared/Events.ts), whenever they change (and with signing in, `events`)
    TOWNS,              // { l: [TownRow] }: every town that's grown (shared/Towns.ts), as one does
    EVENT_REWARD,       // { n: event's name, g: gold, i: item id (0: none), t?: the top 3 [[player name, their rare find]], k?: your place (1 first) }: what you got for an event won

    HERO_PARTY,         // { h: hero id, m: [PartyMember] }: who's in a hero's party now, them included (shared/Parties.ts), whenever it changes

    LEADER_BOARD,       // { o: BoardView }: a leaderboard, asked for (shared/Leaderboards.ts)

    PREMIUM_STORE,      // { on: 1 if subscribing works, p: its price ("$4.99/mo"; "" not for sale), u: premium until (ms), s: 1 if a subscription's being paid for, k: their name's colour (NAME_COLORS) }: with signing in and whenever it changes
    PREMIUM_CHECKOUT,   // { u: url }: Stripe's page, for the browser to go to
    PREMIUM_REFUSED,    // { w: why }

    COSMETIC_CATALOG,   // { c: Catalog, o: [pack id]: those you own }: who each cosmetic is for (shared/Wardrobe.ts), with signing in and whenever it changes
    COSMETIC_REFUSED,   // { w: why }: an editor's save that couldn't be

    PLAYER_NAME,        // { n: display name }: yours, changed
    PLAYER_REFUSED,     // { w: why }: a name change that couldn't be

    MARKET_LIST,        // { l: [ListingRow], n: how many matched (more than SHOWN_MOST are cut) }
    MARKET_MINE,        // { l: [ListingRow], s: [SaleRow] (the last ones), m: how many listings you may have, o: [OrderRow] yours, om: how many orders you may have }
    MARKET_DONE,        // { w: what }: a listing, buy, order, fill or cancel done (the stash with it, HERO_STASH)
    MARKET_REFUSED,     // { w: why }
    MARKET_SOLD,        // { s: [SaleRow] }: things of yours bought (now, or while you were away: with signing in)
    MARKET_BACK,        // { i: item id, n: amount }: a listing of yours ran out of time, what was left back in your stash

    HERO_AWAY,          // { a: AwaySummary }: what your heroes did while you were away (shared/Away.ts), with signing in

    CHAT_NOTE,          // { t: text, w: 1 a warning }: a line in the chat for you only (a line refused, a report taken, a moderator's command's answer)

    PLAYER_GUIDE,       // { d: the first steps done (a bit a Step, shared/Guide.ts), s: the one just done (none: with signing in, `guide`) }

    GUILD,              // { s: GuildState }: your guild and the invites to you (shared/Guilds.ts), whenever they change (and with signing in, `guild`)
    GUILD_MEMBER,       // { m: GuildMember }: one of your guild signed in or out
    GUILD_LIST,         // { l: [GuildRow] }: Find a guild's
    GUILD_DONE,         // { w: what }
    GUILD_REFUSED,      // { w: why }
    GUILD_SAID,         // { l: ChatLine (c GUILD_CHANNEL) }: a line in your guild's chat (the last GUILD_KEPT come with signing in, in `chat`)

    HERO_JOURNAL,       // { h: hero id, j: [JournalEntry] }: their journal, oldest first (shared/Journal.ts)
    HERO_JOURNAL_LINE,  // { h: hero id, e: JournalEntry }: a line just written in it (or the last one counted again)

    TITLE_AUTH_OPTIONS,     // { g: Google's OAuth client id, or null (no Google sign-in) }: as each connection opens
    TITLE_FORGOT_SENT,      // {}: a reset link was emailed if the address has an account
    TITLE_EMAIL_CONFIRMED,  // { e: email }: a confirm link worked
    PLAYER_ACCOUNT_SAVED,   // { player, rt: remember-me token }: your guest account's an email or Google account now
    PLAYER_SAVE_REFUSED,    // { e: why, for you to read }
    PLAYER_SIGNED_OUT,      // {}: back to the title screen
    PLAYER_CONFIRM_SENT,    // { e: email }: a confirm link's on its way

    ANALYTICS,          // { a: Analytics }: the snapshot asked for (shared/Analytics.ts)
    ANALYTICS_REFUSED,  // { w: why }

    PLAYER_EXPORT,          // { d: your data (server managers/account) }: for the browser to save as a file
    PLAYER_DELETED,         // {}: your account's gone; the connection closes (code 4003)
    PLAYER_DELETE_REFUSED,  // { w: why }: an export or delete that couldn't be

    TRADE_ASKED,        // { a: TradeAsk }: an ask of yours sent, or one to you (shared/Trade.ts)
    TRADE_ASK_END,      // { w: why ("" it was accepted) }: the ask's over
    TRADE,              // { t: TradeView }: the trade, whenever it changes
    TRADE_END,          // { w: why, d: 1 it went through (the stash with it, HERO_STASH) }
    TRADE_REFUSED,      // { w: why }

    ADMIN_FOUND,        // { l: [AdminRow], q: what was searched for }
    ADMIN_PLAYER,       // { p: AdminPlayer }
    ADMIN_REPORTS,      // { l: [AdminReport], n: how many are open }
    ADMIN_DONE,         // { w: what was done }
    ADMIN_REFUSED,      // { w: why }
    ADMIN_STASH,        // { s: AdminStash }
    ADMIN_MARKET,       // { i: player id, l: [AdminTrade] }
    ADMIN_PURCHASES,    // { p: AdminPurchases }
    ADMIN_LOG,          // { i: player id, l: [AdminNote] }
    ADMIN_DEMO_PARTIES, // { u: [[FeaturedHero]], g: [leader's hero id] }: parties new or changed, leader first, and those gone; all of them at first (shared/Parties.ts)
    ADMIN_DEMO_FIGHT,   // { h: hero id, f: Fight }: a fight anyone just had, once for all in it (shared/Fights.ts)
    ADMIN_FEEDBACK,     // { l: [FeedbackRow], n: how many are open }

    FEEDBACK_SENT,      // {}: it's in
    FEEDBACK_REFUSED,   // { w: why }

    HERO_CHOSE,        // { h: hero id, m: moment id, o: the way taken, w: 1 it went well, t: what came of it (as in their journal) }: a moment on the road answered, by you or by them (the state with it, HERO_STATE)

    GUILD_WEEK,         // { w: WeekView, x: the guild's XP }: your guild's goals as they fill (shared/Guilds.ts; every few seconds while they change)
    GUILD_HALL,         // { h: HallView }: the guild hall's storage, asked for or changed
    SEASON,             // { s: SeasonState }: the season, your points, titles and backgrounds (shared/Seasons.ts), with signing in and as they change

    MARKET_WANTED,      // { l: [OrderRow], n: how many matched (more than SHOWN_MOST are cut) }
    MARKET_HISTORY,     // { h: PriceHistory }
    MARKET_GOT,         // { i: item id, n: amount, g: gold, s: seller's name ("": while you were away) }: things for a buy order of yours (now, or as you sign in)
    MARKET_UNFILLED,    // { i: item id, n: amount still wanted, g: gold back }: a buy order of yours ran out of time

    EVENT_PAST,         // { l: [PastEvent] }: the last PAST_MOST events over, newest first (shared/Events.ts)

    MAIL_LIST,          // { l: [Letter], u: unread }: your mailbox, newest first (shared/Mail.ts)
    MAIL_UNREAD,        // { u: unread, s: 1 as you sign in }: how many letters you've not opened
    MAIL_NEW,           // { n: who from, u: unread, b: 1 they sent yours back, 2 yours to them ran out and came back }: a letter just came
    MAIL_DONE,          // { w: what }: sent, taken or sent back (the stash with it, HERO_STASH)
    MAIL_REFUSED,       // { w: why }

    EVENT_SIGHTS,       // { l: [SightView] }: what's turned up on the map (shared/Sights.ts), whenever it changes (and with signing in, `sights`)
    EVENT_BOUGHT,       // { w: what }: bought from a wandering merchant (the stash with it, HERO_STASH)
    EVENT_REFUSED,      // { w: why }

    FRIEND_FOUGHT,      // { h: [hero id] }: a favourite's heroes (and those beside them) just fought, for a puff over them on the map

    EVENT_BUSY,         // { b: [[place id, heroes]] }: how many heroes (anyone's) are at each place with any, not on their way (shared/Places busyLevel), every BUSY_MS as it changes, and with signing in

    MAPED_WORLD,        // { l: [{ n: layer, d: runs }], e: terrain runs, o: 1 painting's on here }: the map's tiles as the server has them (shared/MapEdit.ts)
    MAPED_PAINTED,      // { t: token }: a MAPED_PAINT taken
    MAPED_REFUSED,      // { t: token, w: why }
    MAPED_TILES,        // { c: [layer, tile, number]..., e: [tile, terrain]... }: tiles another editor painted, to everyone online (the map changes as it's painted)
    MAPED_PLACED,       // { t: token, i: the place's id }: a MAPED_PLACE done
    MAPED_PLACES,       // { l: [WorldPlace] }: the map's places, to everyone online, as an editor changes them (shared/Places.ts)

    GAME_PLAYING,       // { n: how many sit at blackjack's tables, s: how many are at the slime races }: to everyone, as they change, and with signing in

    HERO_FEATURED,      // { l: [[FeaturedHero]] }: the featured parties on the map (shared/Parties.ts), leader first, to everyone as they change, and with signing in
    HERO_VIEW,          // { h: [id, HeroData, HeroState, their player's name] }: someone else's hero asked for (C2S.HERO_VIEW), as they are now
    EVENT_HERE,         // { p: place id, l: [[hero id, hero name]], n: how many in all }: the others' heroes there now, not on their way (C2S.EVENT_HERE; the first HERE_MOST, none of yours, none blocked either way)

    HERO_DISMISSED,     // { h: hero id }: a hero let go (C2S.HERO_DISMISS), gone; their gear back in the stash (HERO_STASH before it)

    PLAYER_PROFILE,     // { p: ProfileView }: a profile asked for, or yours as changed (shared/Profile.ts)
    PLAYER_PROFILE_REFUSED, // { w: why }: one that couldn't be found or saved

    PARTY_LIST,         // { l: [PartyView], a: [PartyAsk], v: Invites }: your formed parties (shared/Parties.ts), the asks to you and who may ask; with signing in, and whenever any of it changes
    PARTY_STATE,        // { i: party id, s: HeroState }: a formed party's state, changed (as HERO_STATE; its heroes' with it)
    PARTY_REFUSED,      // { w: why }
    PARTY_DONE,         // { w: what }: an ask sent and the like

    PLAYER_CHEST,       // { i: chest id (0: none now, the one up gone), t: ChestTier, e: ms till it's gone, d?: a daily chest's streak day }: a loot chest turned up (shared/Chests.ts)
    PLAYER_CHEST_OPENED, // { i: chest id, l: ChestLoot }: what was in it, now in the stash (HERO_STASH with it)
    PLAYER_CHEST_MIMIC, // { i: chest id, n: clicks to beat it, e: ms to do it in }: the chest up was a mimic (shared/Chests.ts)
    PLAYER_ACHIEVEMENTS, // { l: [[achievement id, when (ms)]] }: those done, with signing in (shared/Achievements.ts)
    PLAYER_ACHIEVED,    // { a: achievement id, t: when (ms) }: one done just now
    PLAYER_BOUNTY,      // { b: Bounty or null (none now) }: a bounty up, how far along, done (w), or gone (shared/Chests.ts)
    HERO_LUCKY,         // { h: hero id, m: material, n: how many more it brought }: a lucky gather (shared/Tasks.ts LUCKY_ODDS)
    PLAYER_DAILY,       // { s: the daily streak going now (0: none), t: 1 today's chest opened }: with signing in, and as today's is opened (shared/Chests.ts)

    HERO_SWAPPED,       // { o: hero row [id, HeroData, HeroState] now in the barracks, i: hero row now on the roster (either none: none) }: C2S.HERO_SWAP done

}