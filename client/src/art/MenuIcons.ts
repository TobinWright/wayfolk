import { AP } from "../constants/Palette";
import { Pic } from "./Backdrops";

// The main menu's icons (components/mainmenu), 16 x 16, drawn in code in
// Apollo colours: the menu button's own, and one for each option. And the
// small ones (7 x 7): the gold coin, the clock by it, the subscriber's crown, the Inventory's chest, and the games'
// door, chip (the ante), chips piled (the pot), chair and eye, and the "i" of
// how something works. And the chat's button (components/chat).

export const MENU_ICON = 16;
export const SMALL_ICON = 7;

const icons = new Map<string, Pic>();
function icon(name: string, draw: (p: Pic) => void, size = MENU_ICON) {
    let p = icons.get(name);
    if (!p) { p = new Pic(size, size); draw(p); icons.set(name, p); }
    return p;
}

// a gold coin, lit at its top left, a mark struck in its middle
export function coinIcon() {
    return icon("coin", (p) => {
        p.oval(3.5, 3.5, 3.5, 3.5, AP.AMBER, AP.OCHRE);
        p.set(2, 1, AP.STRAW); p.set(1, 2, AP.STRAW);
        p.rect(3, 2, 1, 3, AP.OCHRE);
    }, SMALL_ICON);
}

// a flame (the daily streak, by the time): orange, yellow in its middle
export function flameIcon() {
    return icon("flame", (p) => {
        p.set(3, 0, AP.FLAME);
        p.rect(2, 1, 2, 1, AP.FLAME); p.set(5, 2, AP.FLAME);
        p.rect(1, 2, 4, 1, AP.FLAME);
        p.rect(1, 3, 5, 3, AP.FLAME);
        p.rect(2, 6, 3, 1, AP.EMBER);
        p.rect(2, 4, 3, 2, AP.AMBER);
        p.set(3, 3, AP.AMBER);
        p.set(3, 5, AP.STRAW);
    }, SMALL_ICON);
}

// a clock (the time, by the gold): a pale face in a grey rim, its hands at three
export function clockIcon() {
    return icon("clock", (p) => {
        p.oval(3.5, 3.5, 3.5, 3.5, AP.STONE, AP.IRON);
        p.oval(3.5, 3.5, 2.5, 2.5, AP.WHITE, AP.MIST);
        p.rect(3, 1, 1, 3, AP.INK);
        p.rect(4, 3, 1, 1, AP.INK);
    }, SMALL_ICON);
}

// a table's ante (the games): a red gaming chip, white marks round its edge, lit in its middle
export function anteIcon() {
    return icon("ante", (p) => {
        p.oval(3.5, 3.5, 3.5, 3.5, AP.RED, AP.MAROON);
        for (const [x, y] of [[3, 0], [0, 3], [6, 3], [3, 6]]) p.set(x, y, AP.WHITE);
        p.rect(2, 2, 3, 3, AP.FLAME);
        p.set(3, 3, AP.RED);
    }, SMALL_ICON);
}

// a table's pot (the games): a pile of chips from the side, a stack of three red, two blue in front of it
export function potIcon() {
    return icon("pot", (p) => {
        const stack = (x: number, top: number, n: number, face: number, side: number) => {
            for (let k = 0; k < n; k++) {
                const y = top + k * 2;
                p.rect(x, y, 4, 1, face);
                p.rect(x, y + 1, 4, 1, side);
                p.set(x + 2, y + 1, AP.WHITE);
            }
        };
        stack(0, 1, 3, AP.RED, AP.MAROON);
        stack(3, 3, 2, AP.SKY, AP.COBALT);
    }, SMALL_ICON);
}

// how something works, hovered (the blackjack table's rules): a white "i" on a blue disc
export function infoIcon() {
    return icon("info", (p) => {
        p.oval(3.5, 3.5, 3.5, 3.5, AP.SKY, AP.STEEL);
        p.set(3, 1, AP.WHITE);
        p.rect(3, 3, 1, 3, AP.WHITE);
    }, SMALL_ICON);
}

// a subscriber's crown, by their name in the chat: three gold points, a red stone
export function crownIcon() {
    return icon("crown", (p) => {
        for (const x of [0, 3, 6]) { p.set(x, 1, AP.STRAW); p.rect(x, 2, 1, 2, AP.AMBER); }
        p.rect(0, 3, 7, 3, AP.AMBER);
        p.rect(0, 6, 7, 1, AP.OCHRE);
        p.set(3, 4, AP.RED);
    }, SMALL_ICON);
}

// the Inventory, small (the market's, by your gold): a chest, its lid lighter, a gold lock
export function chestIcon() {
    return icon("chest", (p) => {
        p.rect(0, 1, 7, 2, AP.CLAY);
        p.rect(0, 1, 7, 1, AP.TAN);
        p.rect(0, 3, 7, 3, AP.UMBER);
        p.rect(0, 6, 7, 1, AP.BARK);
        p.set(3, 3, AP.AMBER);
    }, SMALL_ICON);
}

// a room (the games' rooms list): a wooden door, rounded at its top, a brass knob
export function doorIcon() {
    return icon("door", (p) => {
        p.rect(1, 0, 5, 7, AP.BARK);
        p.set(1, 0, -1); p.set(5, 0, -1);
        p.rect(2, 1, 3, 6, AP.UMBER);
        p.set(4, 4, AP.AMBER);
    }, SMALL_ICON);
}

// a seat: a chair from the side, its back on the left
export function chairIcon() {
    return icon("chair", (p) => {
        p.rect(1, 0, 1, 7, AP.UMBER);
        p.rect(1, 4, 5, 1, AP.BARK);
        p.rect(5, 5, 1, 2, AP.UMBER);
    }, SMALL_ICON);
}

// watching: an eye, a blue iris
export function eyeIcon() {
    return icon("eye", (p) => {
        p.rect(2, 1, 3, 1, AP.STONE); p.rect(2, 5, 3, 1, AP.STONE);
        p.rect(1, 2, 5, 3, AP.WHITE);
        p.set(0, 3, AP.WHITE); p.set(6, 3, AP.WHITE);
        p.rect(2, 2, 3, 3, AP.SKY);
        p.set(3, 3, AP.BLACK);
    }, SMALL_ICON);
}

// the chat's button: a speech bubble, three dots in it, its tail down on the left
export function chatIcon() {
    return icon("chat", (p) => {
        p.rect(1, 2, 14, 9, AP.WHITE);
        for (const [x, y] of [[1, 2], [14, 2], [1, 10], [14, 10]]) p.set(x, y, -1);
        p.rect(2, 10, 12, 1, AP.MIST);
        p.rect(14, 3, 1, 7, AP.MIST);
        p.rect(3, 11, 3, 1, AP.MIST); p.rect(3, 12, 2, 1, AP.MIST); p.set(3, 13, AP.MIST);
        for (const x of [4, 7, 10]) p.rect(x, 6, 2, 2, AP.STEEL);
    });
}

// the main menu's button (the game's; the user, 2026-11-02): a sword behind a round
// wooden shield - its gold hilt out at the top left, its point at the bottom right;
// the shield iron-rimmed, its planks light and dark, an iron boss in its middle
export function menuIcon() {
    return icon("menu", (p) => {
        // (the blade lit along its top)
        for (let k = 3; k < 15; k++) { p.set(k + 1, k, AP.WHITE); p.set(k, k, AP.ASH); }
        p.set(15, 15, AP.ASH);
        for (let k = -2; k <= 2; k++) p.set(4 - k, 4 + k, k < 0 ? AP.STRAW : AP.OCHRE);
        p.set(3, 3, AP.UMBER); p.set(2, 2, AP.UMBER);
        p.rect(0, 0, 2, 2, AP.AMBER);
        p.set(0, 0, AP.STRAW); p.set(1, 1, AP.OCHRE);
        p.oval(9.5, 9.5, 5.5, 5.5, AP.STEEL, AP.IRON);
        p.oval(9.5, 9.5, 4.5, 4.5, AP.TAN);
        for (let y = 5; y < 15; y++) for (let x = 5; x < 15; x++)
            if (p.get(x, y) == AP.TAN && Math.floor((x - 5) / 3) % 2) p.set(x, y, AP.CLAY);
        p.rect(8, 8, 3, 3, AP.STEEL);
        p.set(8, 8, AP.WHITE); p.set(9, 8, AP.ASH); p.set(8, 9, AP.ASH); p.set(10, 10, AP.IRON);
    });
}

// the other menu's button (components/moremenu; the user, 2026-11-02: to match what's
// in it, mostly news and people): a sealed letter in front of a news sheet - the sheet
// at the top left, a red headline, print; the envelope over its bottom right, its flap
// folded down to a red wax seal
export function moreIcon() {
    return icon("more", (p) => {
        p.rect(1, 1, 11, 11, AP.WHITE);
        p.rect(11, 1, 1, 11, AP.MIST);
        p.rect(2, 2, 7, 2, AP.RED);
        p.rect(2, 2, 7, 1, AP.FLAME);
        p.rect(2, 5, 3, 1, AP.STONE); p.rect(6, 5, 4, 1, AP.STONE);
        for (const y of [7, 9, 11]) p.rect(2, y, 2, 1, AP.STONE);
        p.rect(4, 6, 12, 10, AP.IRON);
        p.rect(5, 7, 10, 8, AP.CREAM);
        p.rect(5, 14, 10, 1, AP.SAND);
        for (let k = 0; k < 5; k++) { p.set(5 + k, 7 + k, AP.SAND); p.set(14 - k, 7 + k, AP.SAND); }
        p.rect(8, 10, 4, 3, AP.RED);
        p.rect(9, 10, 2, 1, AP.FLAME);
        p.set(11, 12, AP.MAROON);
    });
}

// Updates: a news sheet - a red headline across its top, two columns of print under it
function updatesIcon() {
    return icon("updates", (p) => {
        p.rect(2, 1, 12, 14, AP.WHITE);
        p.rect(2, 14, 12, 1, AP.MIST); p.rect(13, 1, 1, 14, AP.MIST);
        p.rect(4, 3, 8, 2, AP.RED);
        p.rect(4, 3, 8, 1, AP.FLAME);
        for (const y of [7, 9, 11]) { p.rect(4, y, 3, 1, AP.STONE); p.rect(8, y, 4, 1, AP.STONE); }
    });
}

// achievements: a gold medal on a red and blue ribbon, a star struck on it
function achievementsIcon() {
    return icon("achievements", (p) => {
        for (let y = 0; y < 6; y++) { p.rect(3 + Math.floor(y / 2), y, 3, 1, AP.RED); p.rect(10 - Math.floor(y / 2), y, 3, 1, AP.SKY); }
        p.oval(8, 10.5, 4.5, 4.5, AP.AMBER, AP.OCHRE);
        p.rect(5, 7, 2, 1, AP.STRAW); p.rect(4, 8, 1, 2, AP.STRAW);
        p.set(8, 8, AP.WHITE); p.rect(6, 10, 5, 1, AP.WHITE); p.rect(7, 11, 3, 1, AP.WHITE); p.set(7, 12, AP.WHITE); p.set(9, 12, AP.WHITE); p.set(8, 9, AP.WHITE);
    });
}

// an option's icon, by its name in the menu
export function optionIcon(name: string) {
    switch (name) {
        case "Updates": return updatesIcon();
        case "Premium": return premiumIcon();
        case "Settings": return settingsIcon();
        case "Leaderboards": return leaderboardsIcon();
        case "Achievements": return achievementsIcon();
        case "Market": return marketIcon();
        case "Mail": return mailIcon();
        case "Discord": return discordIcon();
        case "Feedback": return feedbackIcon();
        case "Inventory": return inventoryIcon();
        case "Heroes": return adventurersIcon();
        case "Hiring": return hiringIcon();
        case "Games": return gamesIcon();
        case "Friends": return friendsIcon();
        case "Parties": return partiesIcon();
        case "Profile": return profileIcon();
        case "Guild": return guildIcon();
        case "Encyclopedia": return encyclopediaIcon();
        case "Events": return eventsIcon();
        case "Locations": return locationsIcon();
        case "Nodes": return nodesIcon();
        case "Cosmetics": return cosmeticsIcon();
        case "Analytics": return analyticsIcon();
        case "Demo": return demoIcon();
        case "Admin": return adminPanelIcon();
    }
    return menuIcon();
}

// premium: a big gold crown, as the chat's subscriber's - three points
// tipped with pearls, red and blue stones in its band, lit on its left
export function premiumIcon() {
    return icon("premium", (p) => {
        for (const x of [2, 7, 12]) { p.rect(x, 3, 2, 2, AP.WHITE); p.rect(x, 5, 2, 3, AP.AMBER); }
        for (const x of [4, 9]) p.rect(x, 7, 3, 1, AP.AMBER);
        p.rect(2, 8, 12, 5, AP.AMBER);
        p.rect(2, 5, 1, 8, AP.STRAW);
        p.rect(13, 5, 1, 8, AP.OCHRE);
        p.rect(2, 13, 12, 1, AP.OCHRE);
        p.rect(7, 9, 2, 2, AP.RED);
        p.set(4, 10, AP.SKY); p.set(11, 10, AP.SKY);
    });
}

// Discord: a round blue face with two white eyes, lit along its top
function discordIcon() {
    return icon("discord", (p) => {
        p.rect(3, 3, 10, 9, AP.COBALT);
        p.rect(2, 5, 12, 6, AP.COBALT);
        p.rect(1, 7, 14, 4, AP.COBALT);
        p.rect(3, 12, 3, 1, AP.COBALT); p.rect(10, 12, 3, 1, AP.COBALT);
        p.rect(4, 3, 8, 1, AP.SKY); p.rect(3, 4, 2, 1, AP.SKY);
        p.rect(5, 7, 2, 3, AP.WHITE); p.rect(9, 7, 2, 3, AP.WHITE);
        p.rect(2, 11, 12, 1, AP.MIDNIGHT);
    });
}

// Feedback: a page with lines written on it, a pencil across its corner
function feedbackIcon() {
    return icon("feedback", (p) => {
        p.rect(1, 1, 10, 14, AP.CREAM);
        p.rect(1, 14, 10, 1, AP.SAND); p.rect(10, 1, 1, 14, AP.SAND);
        for (const y of [3, 5, 7, 9]) p.rect(3, y, 6, 1, AP.STONE);
        for (let k = 0; k < 7; k++) {
            p.set(14 - k, 6 + k, AP.AMBER);
            p.set(15 - k, 6 + k, AP.OCHRE);
            p.set(13 - k, 6 + k, AP.STRAW);
        }
        p.rect(14, 4, 2, 2, AP.PINK);
        p.set(7, 13, AP.TAN); p.set(6, 14, AP.SLATE);
    });
}

// a letter: a cream envelope, its flap folded down to a red wax seal, shaded along its bottom
function mailIcon() {
    return icon("mail", (p) => {
        p.rect(1, 3, 14, 10, AP.CREAM);
        p.rect(1, 12, 14, 1, AP.SAND);
        for (let k = 0; k < 6; k++) {
            p.set(1 + k, 3 + k, AP.SAND);
            p.set(14 - k, 3 + k, AP.SAND);
        }
        for (let k = 0; k < 4; k++) {
            p.set(1 + k, 12 - k, AP.SAND);
            p.set(14 - k, 12 - k, AP.SAND);
        }
        p.rect(6, 8, 4, 3, AP.RED);
        p.rect(7, 8, 2, 1, AP.FLAME);
        p.set(9, 10, AP.MAROON);
    });
}

// a thick book, closed: a blue cover, gold on its spine and a gold mark on its front, its pages' edge
function encyclopediaIcon() {
    return icon("encyclopedia", (p) => {
        p.rect(3, 1, 11, 13, AP.COBALT);
        p.rect(3, 1, 11, 1, AP.SKY);
        p.rect(13, 2, 1, 12, AP.NAVY);
        p.rect(2, 2, 2, 13, AP.NAVY);
        for (const y of [4, 11]) p.rect(2, y, 2, 1, AP.AMBER);
        p.rect(4, 14, 10, 1, AP.CREAM);
        p.rect(4, 15, 10, 1, AP.SAND);
        p.rect(7, 4, 4, 5, AP.AMBER);
        p.rect(8, 5, 2, 3, AP.STRAW);
        p.rect(6, 10, 6, 1, AP.DENIM);
    });
}

// a cog, its teeth round it
function settingsIcon() {
    return icon("settings", (p) => {
        for (const [x, y, w, h] of [[7, 1, 2, 3], [7, 12, 2, 3], [1, 7, 3, 2], [12, 7, 3, 2]]) p.rect(x, y, w, h, AP.STONE);
        for (const [x, y] of [[3, 3], [11, 3], [3, 11], [11, 11]]) p.rect(x, y, 2, 2, AP.STONE);
        for (const [x, y] of [[5, 5], [10, 5], [5, 10], [10, 10]]) p.set(x, y, AP.STONE);
        p.oval(8, 8, 4.5, 4.5, AP.ASH, AP.STONE);
        p.oval(8, 8, 1.5, 1.5, AP.SLATE);
    });
}

// a red banner on a pole, a gold star on it, swallow-tailed (as the to-do list's Events tab's, bigger)
function eventsIcon() {
    return icon("events", (p) => {
        p.column(2, 1, AP.STEEL, 16);
        p.column(3, 1, AP.STONE, 16);
        p.rect(2, 0, 2, 1, AP.AMBER);
        p.rect(4, 2, 10, 8, AP.RED);
        p.rect(4, 2, 10, 1, AP.FLAME);
        p.rect(4, 9, 10, 1, AP.MAROON);
        for (const [x, y] of [[13, 5], [13, 6], [12, 6], [12, 5], [13, 4], [13, 7]]) p.set(x, y, -1);
        p.rect(7, 5, 3, 1, AP.STRAW); p.rect(8, 4, 1, 3, AP.STRAW);
        p.set(8, 5, AP.AMBER);
    });
}

// a gold cup on a stand
function leaderboardsIcon() {
    return icon("leaderboards", (p) => {
        p.rect(2, 3, 1, 3, AP.AMBER); p.rect(13, 3, 1, 3, AP.AMBER);
        p.set(3, 6, AP.AMBER); p.set(12, 6, AP.AMBER);
        p.rect(4, 2, 8, 6, AP.AMBER);
        p.rect(5, 8, 6, 1, AP.AMBER);
        p.rect(11, 3, 1, 5, AP.OCHRE);
        p.rect(3, 2, 10, 1, AP.STRAW);
        p.rect(5, 3, 1, 4, AP.STRAW);
        p.rect(7, 9, 2, 2, AP.OCHRE);
        p.rect(5, 11, 6, 2, AP.UMBER);
        p.rect(4, 13, 8, 2, AP.BARK);
    });
}

// a purse of coin, tied at the neck
function marketIcon() {
    return icon("market", (p) => {
        p.oval(8, 10.5, 5.5, 4.5, AP.CLAY, AP.UMBER);
        p.rect(6, 4, 4, 3, AP.CLAY);
        p.rect(5, 2, 6, 2, AP.TAN);
        p.rect(5, 5, 6, 1, AP.RED);
        p.oval(8, 11, 2, 2, AP.STRAW, AP.AMBER);
    });
}

// a chest, banded in iron, a lock on its front
function inventoryIcon() {
    return icon("inventory", (p) => {
        p.rect(1, 3, 14, 4, AP.CLAY);
        p.rect(1, 3, 14, 1, AP.TAN);
        p.rect(1, 7, 14, 7, AP.UMBER);
        p.rect(1, 7, 14, 1, AP.BARK);
        p.rect(1, 13, 14, 1, AP.BARK);
        p.rect(3, 3, 1, 11, AP.IRON); p.rect(12, 3, 1, 11, AP.IRON);
        p.rect(7, 6, 2, 3, AP.AMBER);
        p.set(8, 7, AP.INK);
    });
}

// a helm with a red plume
function adventurersIcon() {
    return icon("adventurers", (p) => {
        p.oval(8, 9, 6, 6, AP.ASH, AP.STONE);
        p.rect(1, 9, 14, 7, -1);
        p.rect(2, 9, 12, 5, AP.STONE);
        p.rect(4, 9, 8, 1, AP.INK);
        p.rect(4, 10, 3, 4, -1); p.rect(9, 10, 3, 4, -1);
        p.rect(7, 9, 2, 4, AP.STEEL);
        p.rect(7, 0, 2, 3, AP.RED);
        p.set(8, 0, AP.FLAME);
    });
}

// a notice board on two posts, papers pinned to it
function hiringIcon() {
    return icon("hiring", (p) => {
        // posts and their shade
        p.rect(3, 4, 2, 12, AP.UMBER); p.rect(11, 4, 2, 12, AP.UMBER);
        p.column(4, 4, AP.BARK); p.column(12, 4, AP.BARK);
        // the board: a frame round planks
        p.rect(1, 2, 14, 10, AP.BARK);
        p.rect(2, 3, 12, 8, AP.CLAY);
        p.rect(2, 6, 12, 1, AP.RUST);
        p.rect(1, 1, 14, 1, AP.UMBER);      // its little roof
        // the papers, a pin each
        p.rect(3, 4, 4, 5, AP.CREAM); p.rect(3, 8, 4, 1, AP.SAND);
        p.set(5, 4, AP.RED);
        p.rect(8, 5, 5, 4, AP.WHITE); p.rect(8, 8, 5, 1, AP.MIST);
        p.set(10, 5, AP.RED);
        p.rect(9, 6, 3, 1, AP.STONE);
    });
}

// a die showing five
function gamesIcon() {
    return icon("games", (p) => {
        p.rect(2, 2, 12, 12, AP.WHITE);
        p.rect(13, 2, 1, 12, AP.MIST);
        p.rect(2, 13, 12, 1, AP.MIST);
        for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) p.set(x, y, -1);
        for (const [x, y] of [[4, 4], [10, 4], [7, 7], [4, 10], [10, 10]]) p.rect(x, y, 2, 2, AP.INK);
    });
}

// Blackjack's, in the games window (components/games): two cards fanned, a
// heart on the one behind, a spade on the one in front
export function blackjackIcon() {
    return icon("blackjack", (p) => {
        // behind, on the left
        p.rect(1, 4, 9, 11, AP.WHITE);
        p.rect(1, 14, 9, 1, AP.MIST);
        for (const [x, y] of [[1, 4], [1, 14]]) p.set(x, y, -1);
        p.set(2, 10, AP.RED); p.set(4, 10, AP.RED); p.rect(2, 11, 3, 1, AP.RED); p.set(3, 12, AP.RED);
        // in front, on the right, its left edge a shadow over the other
        p.rect(6, 1, 9, 12, AP.WHITE);
        p.rect(6, 1, 1, 12, AP.STONE);
        p.rect(7, 12, 8, 1, AP.MIST);
        p.rect(14, 2, 1, 10, AP.MIST);
        for (const [x, y] of [[14, 1], [14, 12]]) p.set(x, y, -1);
        p.set(10, 4, AP.INK); p.rect(9, 5, 3, 1, AP.INK); p.rect(8, 6, 5, 2, AP.INK); p.set(10, 8, AP.INK); p.rect(9, 9, 3, 1, AP.INK);
    });
}

// Slime racing's, in the games window: a green slime hopping right, a
// chequered flag on its pole behind it
export function slimeRaceIcon() {
    return icon("slimerace", (p) => {
        // the flag, top right
        p.rect(13, 1, 1, 13, AP.STONE);
        for (let y = 1; y < 6; y++) for (let x = 8; x < 13; x++) p.set(x, y, (x + y) % 2 ? AP.BLACK : AP.WHITE);
        // the slime, its eyes on its right
        p.oval(6.5, 10.5, 6, 4.5, AP.GRASS, AP.LEAF);
        p.rect(1, 14, 11, 1, AP.LEAF);
        p.set(3, 8, AP.LIME); p.set(4, 8, AP.LIME); p.set(2, 9, AP.LIME);
        p.rect(7, 9, 1, 2, AP.BLACK); p.rect(10, 9, 1, 2, AP.BLACK);
        p.set(7, 9, AP.WHITE); p.set(10, 9, AP.WHITE);
    });
}

// a profile: a parchment card, a portrait on its left (a head and shoulders
// in a dark frame), lines of writing on its right
function profileIcon() {
    return icon("profile", (p) => {
        p.rect(0, 3, 16, 11, AP.STRAW);
        p.rect(0, 13, 16, 1, AP.OCHRE);
        p.rect(15, 3, 1, 11, AP.OCHRE);
        for (const [x, y] of [[0, 3], [15, 3], [0, 13], [15, 13]]) p.set(x, y, -1);
        // the portrait
        p.rect(2, 5, 6, 7, AP.SLATE);
        p.oval(4.5, 7, 1.5, 1.5, AP.CREAM, AP.SAND);
        p.rect(3, 10, 4, 2, AP.SKY);
        // the writing
        p.rect(9, 6, 5, 1, AP.UMBER);
        p.rect(9, 8, 4, 1, AP.TAN);
        p.rect(9, 10, 5, 1, AP.TAN);
    });
}

// two friends side by side, one a little behind the other
function friendsIcon() {
    return icon("friends", (p) => {
        // behind, on the right
        p.oval(10.5, 4.5, 2.5, 2.5, AP.SAND, AP.TAN);
        p.oval(10.5, 13, 4.5, 4.5, AP.LEAF, AP.FOREST);
        // in front, on the left
        p.oval(5.5, 6, 3, 3, AP.CREAM, AP.SAND);
        p.oval(5.5, 15, 5, 5.5, AP.SKY, AP.COBALT);
    });
}

// a party: a sword and a staff crossed behind a round shield
function partiesIcon() {
    return icon("parties", (p) => {
        // the sword, top left to bottom right: its blade, then its gold guard and hilt
        for (let k = 1; k <= 10; k++) { p.set(k, k, AP.MIST); p.set(k + 1, k, AP.STEEL); }
        p.rect(10, 12, 4, 1, AP.AMBER); p.rect(12, 10, 1, 4, AP.AMBER);
        p.set(13, 13, AP.UMBER); p.set(14, 14, AP.BARK);
        // the staff, top right to bottom left, a blue stone at its top
        for (let k = 3; k <= 14; k++) p.set(15 - k, k, AP.BARK);
        p.rect(12, 1, 3, 3, AP.COBALT); p.set(13, 2, AP.SKY);
        // the shield over them both, a gold boss in its middle
        p.oval(8, 9, 4.5, 4.5, AP.RED, AP.MAROON);
        p.rect(7, 8, 2, 2, AP.STRAW);
    });
}

// a guild's banner: a red pennant on a pole, a gold star on it, its tails cut
function guildIcon() {
    return icon("guild", (p) => {
        // the pole, a gold knob on its top
        p.rect(2, 2, 1, 14, AP.UMBER);
        p.rect(3, 2, 1, 14, AP.BARK);
        p.rect(2, 1, 2, 1, AP.AMBER);
        p.set(2, 0, AP.STRAW);
        // the cloth, cut into two tails at the bottom, shaded down its right
        p.rect(4, 2, 10, 9, AP.RED);
        p.rect(4, 11, 4, 2, AP.RED); p.rect(10, 11, 4, 2, AP.RED);
        p.rect(4, 13, 2, 1, AP.RED); p.rect(12, 13, 2, 1, AP.RED);
        p.rect(13, 2, 1, 12, AP.MAROON);
        p.rect(4, 2, 10, 1, AP.FLAME);
        // the star
        p.rect(8, 4, 2, 5, AP.STRAW);
        p.rect(6, 6, 6, 1, AP.STRAW);
        p.rect(7, 7, 4, 1, AP.AMBER);
        p.set(7, 8, AP.AMBER); p.set(10, 8, AP.AMBER);
    });
}

// The admin menu's (components/adminmenu): its button's own, and one for each option.

// the admin button: a gold crown set with a red stone
export function adminIcon() {
    return icon("admin", (p) => {
        for (const x of [2, 7, 12]) { p.rect(x, 4, 2, 4, AP.AMBER); p.set(x, 3, AP.STRAW); }
        p.rect(2, 8, 12, 5, AP.AMBER);
        p.rect(2, 12, 12, 1, AP.OCHRE);
        p.rect(13, 4, 1, 9, AP.OCHRE);
        p.rect(4, 6, 1, 2, AP.AMBER); p.rect(11, 6, 1, 2, AP.AMBER);
        p.rect(7, 9, 2, 2, AP.RED);
        p.set(7, 9, AP.FLAME);
    });
}

// a red pin stood in a scrap of map
function locationsIcon() {
    return icon("locations", (p) => {
        p.rect(1, 9, 14, 6, AP.CREAM);
        p.rect(1, 14, 14, 1, AP.SAND);
        p.rect(3, 11, 3, 1, AP.LEAF); p.rect(10, 12, 3, 1, AP.SKY);
        p.oval(8, 5, 4, 4, AP.RED, AP.MAROON);
        p.oval(7, 4, 1.5, 1.5, AP.FLAME);
        p.rect(7, 9, 2, 3, AP.MAROON);
        p.set(8, 12, AP.MAROON);
    });
}

// three points joined by lines
function nodesIcon() {
    return icon("nodes", (p) => {
        for (let i = 0; i < 8; i++) { p.set(4 + i, 4 + i * 0.25, AP.STONE); p.set(4 + i * 0.5, 4 + i, AP.STONE); p.set(12 - i * 0.5, 6 + i * 0.75, AP.STONE); }
        for (const [x, y] of [[4, 4], [12, 6], [8, 12]]) {
            p.oval(x, y, 2.5, 2.5, AP.ICE, AP.SKY);
            p.set(x - 1, y - 1, AP.FOAM);
        }
    });
}

// a pie chart (the user, 2026-10-29: "analytics needs a new icon"): a blue
// share and a green one, a gold slice pulled out at the top right; each
// shaded round its bottom right edge
function analyticsIcon() {
    return icon("analytics", (p) => {
        const R = 6;
        // a slice from `from` to `to` (shares of a turn, clockwise from the top) round (cx, cy)
        const slice = (cx: number, cy: number, from: number, to: number, c: number, shade: number) => {
            for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
                const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
                if (d > R) continue;
                const turn = (Math.atan2(dx, -dy) / (Math.PI * 2) + 1) % 1;
                if (turn < from || turn >= to) continue;
                p.set(x, y, d > R - 1.3 && dx + dy > 0 ? shade : c);
            }
        };
        slice(7, 9, 0.25, 0.62, AP.SKY, AP.COBALT);
        slice(7, 9, 0.62, 1, AP.LEAF, AP.FOREST);
        slice(8.5, 7.5, 0, 0.25, AP.STRAW, AP.AMBER);
    });
}

// demo mode: a screen with a play button on it
function demoIcon() {
    return icon("demo", (p) => {
        p.rect(1, 3, 14, 10, AP.STONE);
        p.rect(2, 4, 12, 8, AP.NAVY);
        for (let x = 0; x < 5; x++) p.rect(6 + x, 5 + Math.ceil(x / 2), 1, 6 - 2 * Math.ceil(x / 2), AP.STRAW);
    });
}

// the admin panel: a judge's gavel, its head up at the top left, the block it strikes below
function adminPanelIcon() {
    return icon("adminpanel", (p) => {
        p.rect(1, 13, 8, 2, AP.STONE);
        p.rect(1, 13, 8, 1, AP.ASH);
        p.rect(1, 15, 8, 1, AP.IRON);
        const cx = 6, cy = 6;
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
            const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
            const along = (dx + dy) / Math.SQRT2, across = (dx - dy) / Math.SQRT2;    // (down the handle, across the head)
            if (Math.abs(along) <= 2 && Math.abs(across) <= 4.6)
                p.set(x, y, Math.abs(across) > 3.4 ? AP.AMBER : along > 1 ? AP.UMBER : AP.CLAY);
            else if (along > 2 && along <= 11 && Math.abs(across) <= 0.75)
                p.set(x, y, AP.TAN);
        }
    });
}

// a hero's to-do list (their status): a sheet with three lines, the first two ticked
export function todoIcon() {
    return icon("todo", (p) => {
        p.rect(3, 1, 10, 14, AP.INK);
        p.rect(4, 2, 8, 12, AP.CREAM);
        p.rect(4, 2, 8, 1, AP.WHITE);
        for (const y of [4, 8, 12]) p.rect(7, y, 4, 1, AP.STONE);
        for (const y of [4, 8]) { p.set(5, y, AP.LEAF); p.set(6, y - 1, AP.LEAF); }
        p.rect(5, 11, 1, 2, AP.STONE);
    });
}

// a hero's journal: a leather-bound book, its pages' edge down its right,
// a gilt title on its cover and a red ribbon hanging out of its foot
export function journalIcon() {
    return icon("journal", (p) => {
        p.rect(2, 1, 12, 14, AP.INK);
        p.rect(3, 2, 10, 12, AP.CLAY);
        p.rect(3, 2, 2, 12, AP.UMBER);
        p.rect(12, 3, 1, 10, AP.CREAM);
        p.rect(6, 4, 5, 1, AP.STRAW); p.rect(7, 6, 3, 1, AP.STRAW);
        p.rect(6, 9, 5, 3, AP.UMBER); p.rect(7, 10, 3, 1, AP.OCHRE);
        p.rect(9, 14, 1, 2, AP.RED); p.set(10, 15, AP.MAROON);
    });
}

// a hero's cosmetics: a tunic, its trim a second dye
export function cosmeticsIcon() {
    return icon("cosmetics", (p) => {
        p.rect(4, 2, 8, 13, AP.INK);
        p.rect(1, 3, 4, 6, AP.INK); p.rect(11, 3, 4, 6, AP.INK);
        p.rect(5, 3, 6, 11, AP.ORCHID);
        p.rect(2, 4, 3, 4, AP.ORCHID); p.rect(11, 4, 3, 4, AP.ORCHID);
        p.rect(5, 3, 1, 11, AP.MAGENTA); p.rect(2, 7, 3, 1, AP.MAGENTA); p.rect(11, 7, 3, 1, AP.MAGENTA);
        p.rect(7, 3, 2, 2, AP.INK);
        p.rect(5, 12, 6, 1, AP.STRAW);
    });
}

// changing something (a hero's status scene), 8 x 8: a little pencil outlined in black
// (so it shows on any backdrop), its point at the bottom left; lit, both its sides lit
export function editIcon(lit = false) {
    return icon(lit ? "edit-lit" : "edit", (p) => {
        // [lit side, shaded side] by row, eraser down to the point
        const rows: [number, number][] = [[AP.PINK, AP.MAGENTA], [AP.MIST, AP.STONE], [AP.STRAW, AP.OCHRE], [AP.STRAW, AP.OCHRE], [AP.SAND, AP.TAN], [AP.IRON, AP.IRON]];
        const body = new Set<string>();
        for (let r = 1; r <= 6; r++) for (const sum of [6, 7]) {
            const c = sum - r;
            if (c < 1 || c > 6 || (r == 6 && sum == 6)) continue;
            body.add(c + "," + r);
            const [light, shade] = rows[r - 1];
            p.set(c, r, sum == 6 || lit ? light : shade);
        }
        for (const k of Array.from(body)) {
            const [c, r] = k.split(",").map(Number);
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
                if (!body.has((c + dx) + "," + (r + dy))) p.set(c + dx, r + dy, AP.BLACK);
        }
    }, 8);
}
