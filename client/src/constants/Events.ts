export enum Event {

    WINDOW_RESIZE,

    GLOBAL_POINTER_DOWN,
    GLOBAL_POINTER_UP,
    GLOBAL_POINTER_MOVE,

    NETWORK_CONNECTED,
    NETWORK_DISCONNECTED,

    INVENTORY_GOLD_UPDATED,
    INVENTORY_ITEM_ADDED,
    INVENTORY_ITEM_REMOVED,

    MAP_POINTER_DOWN,
    MAP_POINTER_UP,
    MAP_POINTER_LEAVE,
    MAP_POINTER_MOVE,
    MAP_LOCATION_POINTER_UP,
    MAP_FOLLOW,             // the map started or stopped following a hero's party (their id, or null)

    TITLE_SIGNED_IN,
    TITLE_REFUSED,          // not signed in ({ why: S2C.TITLE_REFUSED w, text: its e })
    TITLE_AUTH_OPTIONS,     // which sign-ins the server offers came (GoogleButton.clientId)
    TITLE_FORGOT_SENT,      // a password reset link was emailed (if the address has an account)
    TITLE_EMAIL_CONFIRMED,  // a confirm link worked (the email)

    RECRUIT_OPTIONS_GOT,
    RECRUIT_OPTIONS_HIRED,

    HERO_BOARD,
    HERO_HIRED,
    HERO_DISMISSED,         // a hero was let go, gone from the roster (their HeroRow, as they were)
    HERO_BARRACKS,          // the barracks changed: a hero into it or out of it (HERO_DISMISSED / HERO_SWAPPED with it), or hired into it
    HERO_SWAPPED,           // ({ out: HeroRow now in the barracks, into: HeroRow now on the roster }, either null): HeroHandler.swap done
    HERO_REFUSED,
    HERO_STATE,             // a hero's state came (their HeroRow)
    HERO_STASH,             // what heroes gathered, made and earned came (the inventory)
    HERO_LEVEL,             // a hero went up a level at a skill ({ hero: HeroRow, skill: Skill })
    HERO_FIGHT,             // a hero fought just now ({ hero: HeroRow, fight: Fight })
    HERO_PARTY,             // who's in a hero's party changed (their HeroRow; HeroRow.party)
    PARTY_LIST,             // your formed parties, or the asks to you, changed (IBC.data.parties)
    PARTY_STATE,            // a formed party's state came (its PartyRow)
    PARTY_SAID,             // something asked of your parties done, or refused ({ text, ok })
    HERO_JOURNAL,           // a hero's journal came, or a line in it (their HeroRow; HeroRow.journal)

    EVENTS_CHANGED,         // the dynamic events came or changed (EventsData)
    EVENT_PAST,             // the events window's log came ([PastEvent], shared/Events.ts)
    EVENT_HERE,             // the others' heroes at a place came ({ p: place id, l: [[hero id, name]], n: how many in all })
    SIGHTS_CHANGED,         // what's turned up on the map came or changed (SightsData)
    SIGHT_SAID,             // a merchant sold you something, or wouldn't ({ text, ok })

    CHAT_SAID,              // a line said in a channel came (its ChatLine)
    CHAT_TYPING,            // the chat started or stopped taking keys (true / false)
    CHAT_FILTER,            // hiding swearing turned on or off (Settings)
    GUIDE,                  // a first step done (the Step; shared/Guide.ts): IBC.data.player.guide changed

    FRIEND_LIST,            // the friend list changed (FriendsData.list)
    FRIEND_SAID,            // what came of an ask or the like ({ text, ok: done or not })
    FRIEND_HEROES,          // all a friend's heroes came (their player id)
    WHISPER_SAID,           // a whisper came (its Whisper)

    GUILD,                  // your guild or the invites to you changed (IBC.data.guilds)
    GUILD_LIST,             // Find a guild's guilds came (IBC.data.guilds.found)
    GUILD_WEEK,             // your guild's weekly goals filled some more (IBC.data.guilds.guild.w)
    SEASON,                 // the season, your points, titles or backdrops changed (IBC.data.season)
    GUILD_RESULT,           // what came of founding, inviting or the like ({ text, ok: done or not })

    GAME_ROOMS,             // a game's rooms came ({ game, rooms: [RoomInfo] })
    GAME_ROOM,              // the room you watch came or changed ({ room: RoomState, lines: [RoomLine] coming in, else undefined })
    GAME_SAID,              // a line said in the room you watch (its RoomLine)
    GAME_REFUSED,           // something in a game that couldn't be (why)
    GAME_STATS,             // a player's blackjack came (BjStats)
    GAME_PLAYING,           // how many sit at blackjack's tables or are at the slime races changed (IBC.net.game.playing, racing)

    LEADER_BOARD,           // a leaderboard came (its BoardView, shared/Leaderboards.ts)

    PREMIUM_STORE,          // the Supporter subscription came or changed (IBC.data.premium)
    PREMIUM_REFUSED,        // subscribing or managing it couldn't be (why)

    COSMETIC_CATALOG,       // who each cosmetic is for came or changed (IBC.data.cosmetics)
    COSMETIC_REFUSED,       // an editor's save of it couldn't be (why)

    ANALYTICS,              // the admin's snapshot of the game came (Analytics, shared/Analytics.ts)
    ANALYTICS_REFUSED,      // it couldn't be made (why)

    PLAYER_NAME,            // your display name changed (IBC.data.player.name)
    PLAYER_REFUSED,         // a name change couldn't be (why)
    PLAYER_ACCOUNT_SAVED,   // your guest account is an email or Google account now (IBC.data.player)
    PLAYER_SAVE_REFUSED,    // saving it, or sending a confirm link, couldn't be (why)
    PLAYER_CONFIRM_SENT,    // a confirm link is on its way (the email)
    PLAYER_EXPORTED,        // your data was saved as a file (Download my data)
    PLAYER_DELETE_REFUSED,  // downloading your data or deleting your account couldn't be (why)
    PLAYER_DELETED,         // your account's gone (the Delete account dialog closes)
    PLAYER_PROFILE,         // a profile came, asked for or yours as saved (ProfileView, shared/Profile.ts)
    PLAYER_PROFILE_REFUSED, // one couldn't be found or saved (why)

    MARKET_LIST,            // listings on the market came ({ rows: [ListingRow], n: how many matched })
    MARKET_MINE,            // your listings, orders and sales came ({ rows: [ListingRow], sales: [SaleRow], most: listings you may have, orders: [OrderRow], ordersMost })
    MARKET_WANTED,          // buy orders on the market came ({ rows: [OrderRow], n: how many matched })
    MARKET_HISTORY,         // what a thing has sold for came (PriceHistory)
    MARKET_DONE,            // a listing, buy, order, sale to one or cancel done (what)
    MARKET_REFUSED,         // one couldn't be (why)
    MARKET_CHANGED,         // something of yours sold or bought, or a listing or order came back

    TRADE_ASK,              // an ask to trade came, yours or to you (IBC.net.trade.ask)
    TRADE,                  // the trade changed (IBC.net.trade.view)
    TRADE_REFUSED,          // something about trading couldn't be (why)

    MAIL_LIST,              // your mailbox came (IBC.net.mail.letters)
    MAIL_UNREAD,            // how many letters you've not opened changed (IBC.net.mail.unread)
    MAIL_RESULT,            // a letter sent, taken or sent back, or refused ({ text, ok })

    ADMIN_FOUND,            // players found in the admin panel ([AdminRow], what was searched for; shared/Admin.ts)
    ADMIN_PLAYER,           // a player picked there (AdminPlayer)
    ADMIN_REPORTS,          // the open chat reports ([AdminReport], how many are open)
    ADMIN_FEEDBACK,         // the open feedback ([FeedbackRow], how many are open; shared/Feedback.ts)
    FEEDBACK_SENT,          // what a player wrote went in
    FEEDBACK_REFUSED,       // it couldn't (why)
    ADMIN_DONE,             // something done there (what)
    ADMIN_REFUSED,          // something that couldn't be (why)
    ADMIN_STASH,            // a player's stash there (AdminStash)
    ADMIN_MARKET,           // their market history ({ i: player id, l: [AdminTrade] })
    ADMIN_PURCHASES,        // their purchases (AdminPurchases)
    ADMIN_LOG,              // what staff did to them ({ i: player id, l: [AdminNote] })
    DEMO_FIGHT,             // demo mode: a fight anyone just had ({ h: hero id, f: Fight })

    NOED_NODE_LIST,         // (): every node came (IBC.data.nodes)
    NOED_NODES_CHANGED,     // (NodesChange)
    NOED_REFUSED,           // ({ t: token, w: why })

    MAPED_WORLD,            // (): the map as the server has it came (the map editor: its tiles are on the map)
    MAPED_PAINTED,          // (token): a stroke taken
    MAPED_REFUSED,          // ({ t: token, w: why })
    MAPED_TILES,            // ([layer, tile number, tile]...): another editor painted these (they're on the map already)
    MAPED_PLACED,           // ({ t: token, i: the place's id })
    MAPED_PLACES,           // (): the map's places changed (they're on the map: Map.world.places)

    CHEST,                  // (): a loot chest turned up, or the one up went (IBC.data.player.chest; shared/Chests.ts)
    CHEST_OPENED,           // (ChestLoot): the one up opened, what was in it (in the stash already)
    CHEST_MIMIC,            // ({ i, n, e }): the chest up was a mimic: n clicks in e ms to beat it
    ACHIEVEMENTS,           // (): those done, as they came with signing in (IBC.data.player.achievements)
    ACHIEVED,               // (achievement id): one done just now
    BOUNTY,                 // (): a bounty up, along, done or gone (IBC.data.player.bounty)
    HERO_LUCKY,             // ({ hero: HeroRow, m: material, n: how many more }): a lucky gather
    EVENT_PAID,             // ({ n, g, i, t?, k? }): paid for an event won (S2C.EVENT_REWARD)
    STREAK,                 // (n): deliveries in a row, each one (ItemToasts)
    DAILY,                  // (): the daily streak told (IBC.data.player.daily)

}