// The Updates window's patch notes (components/updates/Updates.ts; the user,
// 2026-11-02: "it should list ai made human readable patch notes"), newest
// first: written for players from the git log, a few lines an update, what
// changed for them and not how. Add one at the top with each version that
// players would notice (the title screen's VERSION); the first's version is
// what "New" on the menu is measured by. A big one (big: true) opens the
// window by itself once for a returning player (Delight), so they find it.

export interface UpdateNote {
    version: string;
    date: string;
    title: string;
    lines: string[];
    big?: boolean;
}

export const UPDATE_NOTES: UpdateNote[] = [
    {
        version: "v0.71.2", date: "7 Nov 2026", title: "How power works",
        lines: [
            "The encyclopedia has a new Power page under Heroes: how a hero's power is worked out, what gear adds, how deep it takes a party and how it splits in a fight. It also shows each of your heroes' power, their own and their gear's.",
        ],
    },
    {
        version: "v0.71.1", date: "6 Nov 2026", title: "Barracks touch-ups",
        lines: [
            "The Barracks button on each hero is no longer cut off, and the barracks window's text fits its rows.",
        ],
    },
    {
        version: "v0.71.0", date: "6 Nov 2026", title: "The barracks",
        lines: [
            "Your heroes now have a barracks: room for 5 more heroes off the roster (10 for Supporters). Open Heroes and click Barracks along the top to see it.",
            "Send a hero there with the new Barracks button on their row. They stop where they are and keep their to-do list. Call them up any time and they carry on from there, healed up from their rest.",
            "With your roster full, Call up asks who should swap places with them. Hiring with a full roster puts the new hero straight into the barracks.",
            "Gear off takes everything a hero in the barracks has on back to your stash, so the others can use it.",
        ],
    },
    {
        version: "v0.70.2", date: "6 Nov 2026", title: "Worn gear in your inventory",
        lines: [
            "Your inventory now shows what your heroes have on, even when you have none spare. It's dimmed with a little shield, and pointing at it says who's wearing it.",
        ],
    },
    {
        version: "v0.70.1", date: "6 Nov 2026", title: "Gear you can read at a glance",
        lines: [
            "Pointing at something a hero has on now shows its tier, quality and what it gives them, not just its name. Their potion and meal also show how many are left in your stash.",
            "In your inventory, anything one of your heroes also has on gets a little shield in its corner, and pointing at it says who.",
        ],
    },
    {
        version: "v0.70.0", date: "5 Nov 2026", title: "Achievements, bounties, mimics and more", big: true,
        lines: [
            "Achievements! 25 to earn, from your first chest to a Masterwork. See them in the new Achievements window in the other menu. Anything you've already done counts as soon as you sign in.",
            "Daily chest: the first time you sign in each day, a chest waits for you. Come back on days in a row and it gets better: silver from day 3, golden from day 7.",
            "Bounties: now and then, while a hero is gathering, you'll get a short goal like \"Gather 12 Tin Ore in 10 minutes\". Finish it for a silver chest.",
            "Lucky gathers: once in a while a hero finds 2 extra of what they're gathering.",
            "Watch out for mimics! Sometimes a chest bites back. Click it 8 times before it gets away and it drops a golden chest's loot.",
            "Crafting a Superior or Masterwork item now gets a proper reveal. Level ups tell you what they unlocked, events end with a podium for the top 3, fights hit harder with big crits, and coming back shows everything your heroes did, piece by piece.",
            "Items that keep coming in a row build a streak, and each one sounds a little higher than the last.",
            "Your daily streak now shows as a flame by the clock. Achievements you're working towards show how far along you are.",
            "Too much? Settings has a new \"Reduce flashing and shaking\" option.",
        ],
    },
    {
        version: "v0.69.0", date: "5 Nov 2026", title: "Loot chests, and a livelier game", big: true,
        lines: [
            "Loot chests! Every so often while you play, a chest pops up at the bottom of the screen. Click it before its timer runs out for gold and materials. Wooden chests are common, silver ones less so, and golden ones are rare and hold something from deeper than your heroes can reach yet.",
            "New sounds for things coming into your stash, gold, level ups, first steps and chests. You can turn them down under Effects in Settings.",
            "Level ups and first steps now get a banner across the top of the screen, so you see them even with windows open. Gold sends coins flying, and new items flash as they arrive.",
            "New players: once you give your first hero a job, the map now follows them there so you can watch them work.",
        ],
    },
    {
        version: "v0.68.37", date: "5 Nov 2026", title: "Party gathering fixed",
        lines: [
            "A party's to-do list now goes by the whole party's strength when choosing what to gather. Materials it can reach were being marked too deep if its first hero couldn't reach them alone.",
            "Point at a material marked too deep to see how far down it is and how far your hero or party can get.",
        ],
    },
    {
        version: "v0.68.36", date: "5 Nov 2026", title: "Lists stay where you scrolled",
        lines: [
            "The to-do list menus no longer jump back to the top whenever your heroes bring something in. Scroll down to the deeper floors and you will stay there.",
            "Encyclopedia pages stay where you scrolled too.",
        ],
    },
    {
        version: "v0.68.35", date: "4 Nov 2026", title: "Featured parties unstuck",
        lines: [
            "Fixed a problem that could leave the featured parties stuck on the same few and slow your heroes down a little.",
        ],
    },
    {
        version: "v0.68.34", date: "4 Nov 2026", title: "Event rewards you can look back on",
        lines: [
            "Past events in the Events window now show what you got from each one: your gold, and the rare find's picture if you were in the top 3.",
            "Point at a past event to see the top 3 and the rare find each of them got.",
            "Event popups stay up for 20 seconds, and the ones telling you what you got stay for 45.",
        ],
    },
    {
        version: "v0.68.33", date: "3 Nov 2026", title: "Events in Misc",
        lines: [
            "The task planner's Misc tab has a new Events task. Your hero goes to the nearest event and helps until it's over, then gets on with the next thing on their list.",
            "Set it as a Backup Task and they'll move from event to event by themselves, resting whenever none are on.",
        ],
    },
    {
        version: "v0.68.32", date: "3 Nov 2026", title: "Towns grow",
        lines: [
            "Towns now grow for good. Winning a rebuild, upgrade or festival there, or stopping a boss marching on it, helps it level up, and it never loses levels.",
            "Each level makes crafting there 0.5% quicker and gives 0.5% more XP for work done there. There's no top level.",
            "Events already won count, so some towns have a head start. Open a town's window to see its level and what's been built.",
        ],
    },
    {
        version: "v0.68.31", date: "3 Nov 2026", title: "The guild hall",
        lines: [
            "Guilds have a new Hall tab with shared storage. Drag things in from your Inventory to help out your guildmates.",
            "Storage holds 20 different things, and 5 more with each guild level. Members can take up to 20 things a day; officers and the leader have no limit.",
            "The hall keeps a log of who put in or took what. A guild can't be closed until its hall is empty.",
            "Guilds now craft faster as they level: +5% at level 3, +10% at level 6 and +15% at level 9.",
        ],
    },
    {
        version: "v0.68.30", date: "3 Nov 2026", title: "Leadership",
        lines: [
            "New skill: Leadership. The first hero in a party you've made leads it, and learns the skill as they work with others beside them.",
            "Everyone in the party works faster as the leader's skill rises: +2% at level 1, up to +13.8% at level 60. Only the leader earns its XP.",
        ],
    },
    {
        version: "v0.68.29", date: "3 Nov 2026", title: "Healers heal outside fights",
        lines: [
            "A party with a Cleric now heals twice as fast between fights, and one with a Druid 1.5x as fast. A green + rises off whoever is being tended.",
            "Clerics and Druids tend to themselves as well, so they recover faster even alone.",
            "What each job does is now explained when you point at it on the Hiring board, in Heroes and on a hero's status, and in the Encyclopedia.",
        ],
    },
    {
        version: "v0.68.28", date: "3 Nov 2026", title: "Clearer featured party names",
        lines: [
            "The names over featured parties on the map no longer come out garbled when zoomed right out.",
        ],
    },
    {
        version: "v0.68.27", date: "3 Nov 2026", title: "Going deeper together",
        lines: [
            "A hero exploring a dungeon now shows which floor the run is going down to.",
            "A hero can join others already gathering something deep at a place, even if they couldn't reach it alone. Your own heroes' lists offer it too.",
            "A party now waits for a member who's on the way instead of giving up on a task it needs them for.",
            "Parties players make can now be featured on the map, and the fullest are featured first. A hero working alone only appears when there aren't enough parties.",
        ],
    },
    {
        version: "v0.68.26", date: "3 Nov 2026", title: "The event window's new look",
        lines: [
            "The event window has a new layout. Rows are striped, rewards have their own marks, and the time left and number of heroes taking part sit at the top.",
            "Point at a skill, the bar, the time or Join for a tooltip. Click a hero's name to open their status.",
        ],
    },
    {
        version: "v0.68.24", date: "3 Nov 2026", title: "Parties reach deeper floors",
        lines: [
            "Materials your party can reach are no longer marked too deep on its to-do list, even if no hero could reach them alone.",
            "A hero with their party now shows the party's deepest floor in place and sighting windows.",
        ],
    },
    {
        version: "v0.68.23", date: "3 Nov 2026", title: "Party invites are live",
        lines: [
            "Being asked into a party now pops up on your screen with Accept and Decline. You have 20 seconds to answer, or the invite is cancelled.",
            "You can only invite a character whose player is online and who isn't already in a party.",
        ],
    },
    {
        version: "v0.68.22", date: "3 Nov 2026", title: "Party buttons fit",
        lines: [
            "The buttons in the Parties window are a little taller, so words like Keep and Make party fit inside them.",
        ],
    },
    {
        version: "v0.68.21", date: "3 Nov 2026", title: "In front of the campfire",
        lines: [
            "Heroes at camp now walk in front of the fire's flames in the hero window, not behind them.",
        ],
    },
    {
        version: "v0.68.20", date: "3 Nov 2026", title: "Event pop-ups take you there",
        lines: [
            "Clicking an event's pop-up moves the map to the event and opens its window.",
        ],
    },
    {
        version: "v0.68.19", date: "3 Nov 2026", title: "Back in the item window",
        lines: [
            "The item window has a back arrow: after following what something is made from or goes into, it takes you back, scrolled where you were.",
        ],
    },
    {
        version: "v0.68.18", date: "3 Nov 2026", title: "Quality odds at a glance",
        lines: [
            "The item window shows the odds of each quality as a table: what each is worth, and how the odds rise the further a crafter is over the level it takes.",
        ],
    },
    {
        version: "v0.68.17", date: "3 Nov 2026", title: "Item window touch-ups",
        lines: [
            "In the item window, the skill and level a thing takes to make now sit under what it's made from.",
            "Item pictures sit in the middle of their slots.",
        ],
    },
    {
        version: "v0.68.16", date: "3 Nov 2026", title: "A better item window",
        lines: [
            "The item window has a fresh look: the item framed in its quality's colour with its tier in the corner, and its name over two lines.",
            "The info bar along the bottom is gone. Pointing at things shows a tooltip instead, and anything cut short shows in full there.",
            "What it's made from and goes into light up when pointed at.",
        ],
    },
    {
        version: "v0.68.15", date: "3 Nov 2026", title: "Public parties",
        lines: [
            "A party can be public: heroes on their own doing the same thing in the same place fill its empty spots and fight beside it.",
            "Helpers keep their own to-do list and leave when their task changes or the party moves on.",
            "Parties start private. Switching back to private sends any helpers on their way.",
        ],
    },
    {
        version: "v0.68.14", date: "3 Nov 2026", title: "Parties",
        lines: [
            "Make a party of your heroes (Parties, in the menu). It has its own to-do list, and everyone in it travels, works and fights together.",
            "In a party, heroes play their jobs in every fight, on the road too: Warriors draw the blows, Clerics heal whoever is worst hurt.",
            "Ask other players' heroes in by name. They pick which hero to send, and can take them out at any time.",
            "Choose who can ask your heroes into a party in Settings: anyone, friends and guild, or nobody.",
            "A hero's own to-do list waits while they're in a party, and carries on when they leave.",
        ],
    },
    {
        version: "v0.68.13", date: "3 Nov 2026", title: "Skills cap at 60",
        lines: [
            "Skills now go up to level 60 for now, past everything there is to gather and make. The cap will rise as new materials arrive.",
            "XP earned at the cap isn't lost: when the cap rises, those levels come at once.",
        ],
    },
    {
        version: "v0.68.12", date: "3 Nov 2026", title: "Refresh the hiring board",
        lines: [
            "The Hiring Board has a Refresh button: new heroes now for 50 gold, without waiting for the 4 hours to be up.",
            "Each refresh costs twice the last, until new heroes come by themselves.",
        ],
    },
    {
        version: "v0.68.11", date: "3 Nov 2026", title: "Corner buttons on top",
        lines: [
            "The buttons in the bottom right corner, and their menus, now always show above any open window.",
        ],
    },
    {
        version: "v0.68.10", date: "3 Nov 2026", title: "Friends Add button",
        lines: [
            "The Add button in the Friends window is now the same height as the name box beside it.",
        ],
    },
    {
        version: "v0.68.9", date: "3 Nov 2026", title: "Friends wording",
        lines: [
            "The Friends window's name box now just says Add by name.",
        ],
    },
    {
        version: "v0.68.8", date: "3 Nov 2026", title: "A nicer Friends window",
        lines: [
            "Each friend, ask and blocked name sits on its own card that lights up under your pointer, with section headings and dividers.",
            "Add a friend with the new Add button as well as Enter. Accept, block and remove buttons are coloured so they stand out.",
            "Long names and long hero activities are cut short with ... instead of running under the buttons, and the list has a scroll bar you can drag.",
        ],
    },
    {
        version: "v0.68.7", date: "3 Nov 2026", title: "A tidier Settings window",
        lines: [
            "The Settings window is a little wider and neater: each section has a heading with a divider, and the sound sliders are longer.",
            "The Download my data and Delete account buttons fit their labels, and the legal links no longer run off the edge.",
        ],
    },
    {
        version: "v0.68.6", date: "3 Nov 2026", title: "Events scroll bar",
        lines: [
            "The scroll bar in the Events window now works: drag it, or click along it to jump.",
        ],
    },
    {
        version: "v0.68.5", date: "3 Nov 2026", title: "A quick way to the races",
        lines: [
            "A Slime Race button now sits next to the Blackjack button in the bottom right, so the tracks are one click away.",
            "Its corner number shows how many players are at the races right now.",
        ],
    },
    {
        version: "v0.68.4", date: "3 Nov 2026", title: "Clearer race places",
        lines: [
            "In slime races, the place numbers at the finish line now sit to the right of the slimes instead of hidden behind them.",
        ],
    },
    {
        version: "v0.68.3", date: "3 Nov 2026", title: "Slime racing, with sparkle",
        lines: [
            "Races now start with a big 3-2-1 countdown, then GO! as the starting barriers lift and dust flies.",
            "The crowd cheers and jumps through every race. Slimes leave goo trails and splat as they land, the leader wears a crown, and the stands call out every change of lead.",
            "Confetti bursts as the winner crosses the line, and a close finish gets a photo flash. Then a winner's banner and a fanfare, with a shower of coins if your slime won.",
            "The races have sound effects too, which follow your Effects volume in Settings.",
        ],
    },
    {
        version: "v0.68.2", date: "3 Nov 2026", title: "The camera follows",
        lines: [
            "Give a hero a task and the map now follows them. Pan the map or click Stop following to look elsewhere.",
        ],
    },
    {
        version: "v0.68.1", date: "2 Nov 2026", title: "Click heroes on the map",
        lines: [
            "Click a hero on the map to open their status: yours, your friends', others in your parties and featured parties.",
        ],
    },
    {
        version: "v0.68.0", date: "2 Nov 2026", title: "Slime racing",
        lines: [
            "A new game in the Games window: Slime Race. Pick a track by its stake, then bet on one of six slimes before the race starts.",
            "Each slime has odds based on its chances. Back a long shot for a big payout, or a favourite for a safer one. You can switch slimes until betting closes.",
            "Then watch them hop to the finish together with everyone else at the track. Each track has its own chat.",
        ],
    },
    {
        version: "v0.67.28", date: "2 Nov 2026", title: "A roomier market",
        lines: [
            "A chest icon next to the market's info icon opens your Inventory.",
            "The bottom bar is gone while it has nothing to show, so the list runs to the bottom. It still comes up for selling, buying, orders and messages.",
        ],
    },
    {
        version: "v0.67.27", date: "2 Nov 2026", title: "Market help",
        lines: [
            "The market's how-to lines have moved from the bottom bar into a tooltip on a new info icon next to your gold.",
        ],
    },
    {
        version: "v0.67.26", date: "2 Nov 2026", title: "A fresh hiring board",
        lines: [
            "Each hero on the hiring board now stands in front of a backdrop in their job's colours, and cards light up as you point at them.",
            "Cards are split into tidy sections, trained skills show their tool's icon, and the price sits with a gold coin on a band at the bottom.",
            "The Hire button lights up under your mouse. If a hire is turned down, the reason shows in red at the top for a few seconds.",
            "A Prodigy's specialty tooltip now says 2x as fast.",
        ],
    },
    {
        version: "v0.67.25", date: "2 Nov 2026", title: "Hiring board skills",
        lines: [
            "A hero's trained skills on the hiring board no longer show a tooltip, since it only repeated what the line already says.",
        ],
    },
    {
        version: "v0.67.24", date: "2 Nov 2026", title: "Hiring board tooltips",
        lines: [
            "Pointing at a hero's details on the hiring board now shows a tooltip by your mouse instead of a line of text along the bottom.",
            "The tooltips are shorter too: stats give their full name, traits just say what they do, and a specialty reads \"Specialty\" with \"Learn 1.5x as fast\" under it.",
        ],
    },
    {
        version: "v0.67.23", date: "2 Nov 2026", title: "Task planner scrolling",
        lines: [
            "Dragging the scroll bar in the task planner's to-do list and options now keeps up with your mouse instead of racing ahead of it.",
            "The mouse wheel scrolls them at a steadier pace too.",
        ],
    },
    {
        version: "v0.67.22", date: "2 Nov 2026", title: "Event card details",
        lines: [
            "Point at the skill icon on an event in the task planner to see which skill it is.",
            "Completion Rewards now say how long they last: for 24 hours.",
        ],
    },
    {
        version: "v0.67.21", date: "2 Nov 2026", title: "A steadier pointer",
        lines: [
            "Pointing at a recipe's ingredients in the task planner keeps the hand pointer, as on the rest of the row.",
        ],
    },
    {
        version: "v0.67.20", date: "2 Nov 2026", title: "Tidier event cards",
        lines: [
            "Events in the task planner are laid out more cleanly: the name on one line (point at it to read all of it), how far along it is, the time left and how many heroes are on it, then where it is.",
            "The work right now shows its skill icon, and what you win reads \"Completion Rewards\".",
        ],
    },
    {
        version: "v0.67.19", date: "2 Nov 2026", title: "A tighter recipe tooltip",
        lines: [
            "A recipe's tooltip in the task planner now shows only when you point at its ingredients, not anywhere on the row.",
        ],
    },
    {
        version: "v0.67.18", date: "2 Nov 2026", title: "Events in full",
        lines: [
            "Events in the task planner now show everything at a glance: the full name, the kind of event and how far along it is, where it is and the time left, the work right now and how many heroes are on it, and what you win for finishing in time.",
            "No more hovering: the tooltip on events is gone.",
        ],
    },
    {
        version: "v0.67.17", date: "2 Nov 2026", title: "Recipe tooltips",
        lines: [
            "Point at something to craft in the task planner to read everything it takes, even when the list is too long to fit.",
        ],
    },
    {
        version: "v0.67.16", date: "2 Nov 2026", title: "Roomier events in the task planner",
        lines: [
            "Events in the task planner are a line taller: what the work is right now and how many heroes are on it.",
            "Point at an event to read all of it, its full name and what you get for finishing it in time.",
        ],
    },
    {
        version: "v0.67.15", date: "2 Nov 2026", title: "A wording tweak",
        lines: [
            "Rest in the task planner now says \"Heal up where you are\".",
        ],
    },
    {
        version: "v0.67.14", date: "2 Nov 2026", title: "Misc tasks explained",
        lines: [
            "Rest and Adventure in the task planner's Misc tab now say briefly what they're for.",
        ],
    },
    {
        version: "v0.67.13", date: "2 Nov 2026", title: "Recipes in the task planner",
        lines: [
            "Things to craft in the task planner now show what they take under their name, like \"3 Wool, 4 Leather\".",
        ],
    },
    {
        version: "v0.67.12", date: "2 Nov 2026", title: "A tidier task planner",
        lines: [
            "The task planner no longer shows a \"Now:\" line, and the backup task sits at the bottom of the window.",
        ],
    },
    {
        version: "v0.67.11", date: "2 Nov 2026", title: "A tidier place window",
        lines: [
            "A place's window no longer lists the nearest dungeon, which leaves more room for its roads.",
        ],
    },
    {
        version: "v0.67.10", date: "2 Nov 2026", title: "Floors at a glance",
        lines: [
            "In the sights window, materials show the floor they're found from under their name, in place of a tooltip.",
        ],
    },
    {
        version: "v0.67.9", date: "2 Nov 2026", title: "A sights window that fits",
        lines: [
            "The sights window is now as tall as what's in it, so it shows all your heroes and no empty space.",
        ],
    },
    {
        version: "v0.67.8", date: "2 Nov 2026", title: "Fewer tooltips",
        lines: [
            "In the sights window, the kind of sight no longer has a tooltip, and item tooltips no longer end with \"Click for more\".",
        ],
    },
    {
        version: "v0.67.7", date: "2 Nov 2026", title: "Easier to spot",
        lines: [
            "In a place's window, a rare find, merchant or other sight listed under Here now has an \"i\" after it. Point at it to light it up, and click to open it.",
        ],
    },
    {
        version: "v0.67.6", date: "2 Nov 2026", title: "A nicer sights window",
        lines: [
            "The window for merchants, rare finds, beasts and openings has a new look. Items sit in slots, rows are striped, and the buttons match the event window's.",
            "The info bar along the bottom is gone. Point at anything to see a tooltip instead. What the merchant says after a buy shows by the Wares heading.",
            "Click a hero's name to open their status.",
        ],
    },
    {
        version: "v0.67.5", date: "2 Nov 2026", title: "A quicker start",
        lines: [
            "New players get a quick start: gathering and crafting go 10x faster until your first steps are done (for up to an hour after hiring your first hero).",
            "While you wait for your hero's first find, the First steps box says what they're doing and shows how far along they are.",
        ],
    },
    {
        version: "v0.67.4", date: "2 Nov 2026", title: "Places with rare finds open again",
        lines: [
            "Clicking a place with a rare find on it (like A rich vein) now opens the place's window, not the find's. The find is listed in the place's window. Click it there to open it.",
        ],
    },
    {
        version: "v0.67.3", date: "2 Nov 2026", title: "Player profiles",
        lines: [
            "Every player now has a profile. Click a name in the chat and pick Profile, or click the owner's name on someone else's hero.",
            "A profile shows stats: your heroes' levels, events joined, hands of cards, biggest pot, season titles and your best leaderboard ranks, plus a row for each of your heroes.",
            "Open yours from the menu with the letter (Profile) and write a few lines about yourself. It saves when you press Enter or click away.",
            "Tick Private (friends only) to let only your friends see it (it saves as you click). A profile never shows whether you're online, where your heroes are, or your gold.",
            "Point at a leaderboard rank on a profile to see how many are on that board, what it ranks by, and which hero got there.",
        ],
    },
    {
        version: "v0.66.4", date: "2 Nov 2026", title: "A tidier event window",
        lines: [
            "The event window has been tidied up. Point at a skill icon to see the skill. The info bar along the bottom is gone.",
            "\"Done in time\" is now \"Completion Rewards\", with an icon by each reward.",
            "Your heroes' rows show how far away each hero is next to the Join button, which leaves more room for names. Click a hero's name to open their status.",
        ],
    },
    {
        version: "v0.66.3", date: "2 Nov 2026", title: "New menu icons",
        lines: [
            "The game menu in the corner has a new icon: a sword and shield.",
            "The menu beside it, with Updates, Mail, Friends and Settings, now shows a letter and a news sheet.",
        ],
    },
    {
        version: "v0.66.1", date: "2 Nov 2026", title: "Roomier Heroes window",
        lines: [
            "The lines on each hero's row in the Heroes window are spaced out, so they're easier to read.",
        ],
    },
    {
        version: "v0.66.0", date: "2 Nov 2026", title: "A better Heroes window, and dismissing heroes",
        lines: [
            "The Heroes window has been redone. Each hero shows their health, a coloured dot for how they're doing, where they are, the skill they're training and a live bar of their current task.",
            "Heroes who need you (waiting on an answer, idle or hurt) are marked down the side, and counted at the top.",
            "Point at what a hero is doing to read all of it.",
            "Sort your heroes by roster order, power, who needs you, or name. Your choice is remembered.",
            "The To-do button shows how much is on a hero's list, and turns amber when they're idle.",
            "You can now dismiss a hero from the Heroes window. Their gear goes back to your stash. Your last hero can't be dismissed.",
            "The craft amount window has a clearer layout, with a bar for each material.",
            "In the to-do list, picking a skill on Gather or Craft keeps the level filter you had, and the skill icons wrap onto the next line.",
        ],
    },
    {
        version: "v0.65.0", date: "2 Nov 2026", title: "Two menus, and these notes",
        lines: [
            "The menu is now two. The corner button is for playing: Heroes, Inventory, Hiring, Market, Events, Games and the Encyclopedia.",
            "The scroll beside it has everything else: Updates, Mail, Friends, Guild, Leaderboards, Discord, Feedback and Settings.",
            "The Blackjack button has moved one place further left.",
            "Updates (this window) lists what's new in the game. The scroll says New when there's something you haven't read.",
            "A menu now always opens over your other windows, and picking Heroes or Inventory brings it to the front if it's already open.",
        ],
    },
    {
        version: "v0.64", date: "1 Nov 2026", title: "Sounds, looks and featured parties",
        lines: [
            "A glowing star marks where an event was won. Point at it to see its Event Buff and how long it lasts.",
            "The map has sounds: waves and gulls by the coast, birdsong by day, crickets and owls by night, wind, rivers and thunder. They get louder as you zoom in.",
            "A fresh look: new window frames, windows that pop in, a bold title font, and flowers, rocks and bushes on open ground through the seasons.",
            "What your heroes find rises off them on the map, and gold coming in counts up by your total.",
            "Featured parties: a handful of other players' parties are shown on the map at a time.",
            "New hairstyles, outfits and status backdrops for Supporters.",
            "A bar under a hero fills while they recover from a fight or are held up.",
            "The game runs more smoothly: we found and fixed what was making it lag.",
        ],
    },
    {
        version: "v0.57 - v0.60", date: "1 Nov 2026", title: "Feedback, gear and a smoother start",
        lines: [
            "Feedback and Discord in the menu: tell us about bugs and ideas, or come and chat.",
            "New players start at the Hiring board, and the first steps say plainly what to do.",
            "A hero's gear is shown right in their status window.",
            "Click a hero in a hero window to open their status.",
            "The inventory has three tabs: All, Gathered and Crafted.",
            "Clicking anywhere on a window brings it to the front.",
            "Crafting amounts start at 1.",
        ],
    },
    {
        version: "v0.56", date: "31 Oct 2026", title: "Seasons and the world's clock",
        lines: [
            "The season and day show by your gold: \"Spring, Day 2\". A season lasts 13 days, a day and night 10 minutes.",
            "The map's places have been redrawn.",
            "Every starting town has basic gathering places nearby.",
            "Event news slides in as a little box on the left instead of filling the chat.",
            "A Blackjack button in the bottom right takes you straight to the tables.",
        ],
    },
    {
        version: "Alpha", date: "30 - 31 Oct 2026", title: "A living world",
        lines: [
            "Life on the map: wagons, ships, travellers, things that turn up for a while, and world bosses on the march.",
            "The moon waxes and wanes, the land changes with the seasons, and busy places show it.",
            "Potions, meals, fishing and herbs, and a use for every material.",
            "Mail: send friends and guildmates letters, items and gold.",
            "The Events window: what's on now and how past events ended.",
            "The market has buy orders and price history.",
            "Every hero trait now does what it says, and the weather matters.",
            "Moments on the road: now and then a hero meets a choice on an adventure.",
            "Crafted gear can come out Fine, Superior or Masterwork.",
            "Guild goals and seasons, with champions shown on the map.",
            "Hero windows show your party at work.",
        ],
    },
    {
        version: "Alpha", date: "29 Oct 2026", title: "Guilds, trading and accounts",
        lines: [
            "Guilds: found one with a name and tag, and invite up to 30 members.",
            "Trade with other players face to face.",
            "The Encyclopedia: every place, item, beast, skill and event in the game.",
            "Sign in with email or Google, or save your guest account in Settings.",
            "A Welcome back window says what your heroes did while you were away.",
            "A first steps checklist for new players.",
            "Heroes learn extended skills through their work.",
            "Hero journals, and backdrops for the status window.",
        ],
    },
    {
        version: "Alpha", date: "27 - 28 Oct 2026", title: "The first days",
        lines: [
            "The world map, and heroes to hire who work through to-do lists: travel, gather, craft, earn gold, explore and adventure.",
            "Skills, equipment and tools, crafted in tiers from bronze to dragonsteel.",
            "Day and night, rain, and music.",
            "Dynamic events and world bosses for everyone to work on together, in parties.",
            "Heroes keep working while you're away.",
            "Friends, chat, leaderboards, the market and Blackjack.",
        ],
    },
];
