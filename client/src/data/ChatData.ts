import { ChatLine, GUILD_CHANNEL } from "../../../shared/Chat";
import { Constants } from "../constants/Constants";

// the chat's lines, every channel's, oldest first (the last MOST of them);
// a note for you (CHAT_NOTE) is in every channel (c -1). Whether swearing's
// shown with asterisks (shared/ChatFilter.ts; Settings, kept in this browser: on to start with).
// An event's lines (from "Event") aren't kept: they slide in by themselves (EventNotices).
export class ChatData {

    public static MOST = 300;
    public static NOTE = 2;             // (ChatLine.e: a note for you; WARNING one about something you couldn't do)
    public static WARNING = 3;

    public lines: ChatLine[] = [];
    public hideSwearing = true;

    constructor() {
        try { this.hideSwearing = localStorage.getItem(Constants.LS_CHAT_SWEARING) != "shown"; } catch { }
    }

    public setHideSwearing(on: boolean) {
        this.hideSwearing = on;
        try { localStorage.setItem(Constants.LS_CHAT_SWEARING, on ? "hidden" : "shown"); } catch { }
    }

    // a note for you in every channel (not sent anywhere)
    public note(text: string, warn = false) {
        const line: ChatLine = { c: -1, n: "", t: text, a: Date.now(), e: warn ? ChatData.WARNING : ChatData.NOTE };
        this.add(line);
        return line;
    }

    // a line about an event (shared/Events.ts), from the server or a reward of one
    public static isEvent(line: ChatLine) {
        return line.e == 1 && line.n == "Event";
    }

    public load(lines: ChatLine[]) {
        this.lines = (lines ?? []).filter((l) => !ChatData.isEvent(l)).slice(-ChatData.MOST);
    }

    public add(line: ChatLine) {
        if (ChatData.isEvent(line)) return;
        this.lines.push(line);
        if (this.lines.length > ChatData.MOST) this.lines.shift();
    }

    // out of a guild: its chat's lines gone
    public dropGuild() {
        this.lines = this.lines.filter((l) => l.c != GUILD_CHANNEL);
    }

    public of(channel: number) {
        return this.lines.filter((l) => l.c == channel || l.c < 0);
    }

}
