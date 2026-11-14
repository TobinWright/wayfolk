import { guildCraftMul, guildLevel, GuildMember, GuildRow, GuildState, HallView, Rank, WeekView } from "../../../shared/Guilds";

// Guilds (shared/Guilds.ts): your guild and the invites to you as the server
// last sent them, and the guilds Find a guild last found.
export class GuildData {

    public state: GuildState = { g: null, i: [] };
    public found: GuildRow[] = [];
    public hall: HallView = null;

    public load(state: GuildState) {
        this.state = state ?? { g: null, i: [] };
    }

    // the perk to crafting speed of the guild they're in
    public craftRate() {
        return this.guild ? guildCraftMul(guildLevel(this.guild.x ?? 0)) : 1;
    }

    public get guild() {
        return this.state.g;
    }

    public member(id: number) {
        return this.state.g?.l.find((m) => m.i == id);
    }

    // yours in your guild (-1: in none)
    public rankOf(id: number): Rank | -1 {
        return this.member(id)?.k ?? -1;
    }

    // its goals filling (S2C.GUILD_WEEK), and its XP
    public setWeek(w: WeekView, xp: number) {
        if (!this.state.g) return;
        this.state.g.w = w;
        this.state.g.x = xp;
    }

    public setMember(m: GuildMember) {
        const l = this.state.g?.l, i = l?.findIndex((x) => x.i == m.i) ?? -1;
        if (i >= 0) l[i] = m;
    }

}
