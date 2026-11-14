import { C2S, S2C } from "./Routes";

// Which version of the messages a client and server speak. Routes.ts numbers
// messages by their place, so a client and server built from different
// Routes would read every message after a change wrong, silently. The client
// sends this as it connects (in the address, `?v=`, so it doesn't depend on
// any message's number); the server closes a connection whose version isn't
// its own with OLD_CLIENT, and the client asks the player to refresh
// (network/Reconnect).
//
// It's worked out from every route's name in order, so adding, removing or
// moving one changes it by itself. Changing what a message carries without
// touching Routes doesn't: bump PROTOCOL_BUMP for that.

export const PROTOCOL_BUMP = 6;

export const OLD_CLIENT = 4004;         // (the close code: the client's version isn't the server's)

// (FNV-1a over the routes' names, as 8 hex digits)
function fingerprint(text: string) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
}

// a route enum's names, in order (a TypeScript enum maps both ways: just the names)
function names(e: object) {
    return Object.keys(e).filter((k) => isNaN(Number(k))).join(",");
}

export const PROTOCOL = `${PROTOCOL_BUMP}-${fingerprint(names(C2S) + "|" + names(S2C))}`;
