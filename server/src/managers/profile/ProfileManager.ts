import { RowDataPacket } from "mysql2";
import { ABOUT_LONGEST, cleanAbout, PLACES_SHOWN, PROFILE_GAP_MS, ProfileHero, ProfileStats, ProfileView } from "../../../../shared/Profile";
import { IBS } from "../../app";
import { Role } from "../../constants/Constants";
import { S2C } from "../../constants/Routes";
import { Hero } from "../hero/HeroManager";
import { Player } from "../player/Player";
import { RewardKind } from "../seasons/SeasonManager";

// Player profiles (shared/Profile.ts). `player_profile` holds what a player
// wrote about themselves and whether it's private, a row once they've saved
// one (none: nothing written, not private). The rest is worked out as it's
// asked for: their name and crown, guild and title from what's kept of them,
// their heroes from them loaded (or the database), how they've done from
// the events', card tables' and seasons' tables and the leaderboards. Nothing
// private goes: not whether they're about, where their heroes are, or gold.
// A private profile, or one whose player has blocked the one asking, goes
// with only the name; their friends and staff see it all.

type Row = RowDataPacket & { [key: string]: any };

export class ProfileManager {

    private lastSet = new Map<number, number>();    // (player id: when they last changed theirs)

    public async init() {
        await this.query(`CREATE TABLE IF NOT EXISTS player_profile (
            player_id INT NOT NULL PRIMARY KEY,
            about VARCHAR(${ABOUT_LONGEST}) NOT NULL DEFAULT '',
            private TINYINT NOT NULL DEFAULT 0,
            updated_at DATETIME NOT NULL)`);
    }

    private async query<T = Row[]>(sql: string, args: any[] = []): Promise<T> {
        const conn = await IBS.db.getConnection();
        try {
            const [result] = await conn.query(sql, args);
            return result as any;
        } finally {
            conn.release();
        }
    }

    // someone's profile, by their name, as `viewer` may see it (PLAYER_PROFILE, or PLAYER_PROFILE_REFUSED: no one's called that)
    public async send(viewer: Player, name: any) {
        if (typeof name != "string" || !name || name.length > 64) return;
        const [r] = await this.query(
            `SELECT p.id, p.display_name, p.created_at, p.premium_until, p.name_color, p.title, f.about, f.private
            FROM player p LEFT JOIN player_profile f ON f.player_id = p.id WHERE p.display_name = ?`, [name]);
        if (!r) return viewer.send({ r: S2C.PLAYER_PROFILE_REFUSED, w: `There's no one called ${name}` });
        viewer.send({ r: S2C.PLAYER_PROFILE, p: await this.view(viewer, r) });
    }

    private async view(viewer: Player, r: Row): Promise<ProfileView> {
        const id: number = r.id, mine = id == viewer.id, loaded = IBS.players.getById(id);
        const view: ProfileView = { i: id, n: r.display_name };
        // (loaded, as the chat has it; not, as last saved)
        const mark = loaded ? loaded.record.chatMark() : new Date(r.premium_until).getTime() > Date.now() ? 1 + (r.name_color ?? 0) : undefined;
        if (mark) view.p = mark;
        const guild = IBS.guilds.guildOf(id);
        if (guild) view.g = guild;
        if (mine) view.m = 1;
        if (r.private) view.v = 1;
        if (!mine && await IBS.friends.hasBlocked(id, viewer.id)) { view.x = 1; return view; }
        if (r.private && !mine && !viewer.social?.friends.has(id) && viewer.record.role < Role.MODERATOR) { view.x = 1; return view; }

        const title = loaded ? IBS.seasons.titleOf(loaded) : r.title;
        if (title) view.h = title;
        view.a = r.about ?? "";
        const started = new Date(r.created_at);
        view.c = new Date(started.getFullYear(), started.getMonth(), 15).getTime();    // (the month, no closer: its middle, the same month wherever it's read)
        const heroes: Hero[] = loaded?.heroes ?? await IBS.heroes.load(id);
        view.e = heroes.map((h): ProfileHero => {
            const k = h.d.k, best = k.indexOf(Math.max(...k));
            return [h.id, h.d.n, h.d.j, h.d.l, k.reduce((a, l) => a + l, 0), best, k[best]];
        });
        view.s = await this.stats(id, view.e);
        return view;
    }

    // how they've done (none of it their gold, nor where they are)
    private async stats(id: number, heroes: ProfileHero[]): Promise<ProfileStats> {
        const [events] = await this.query("SELECT COUNT(*) n, COALESCE(SUM(points), 0) pts FROM event_share WHERE player_id = ? AND points > 0", [id]);
        const [cards] = await this.query("SELECT hands, best FROM game_stat WHERE player_id = ?", [id]);
        const [titles] = await this.query("SELECT COUNT(*) n FROM season_reward WHERE player_id = ? AND kind = ?", [id, RewardKind.TITLE]);
        return {
            l: heroes.reduce((a, h) => a + h[4], 0),
            e: Number(events?.n ?? 0), q: Math.round(Number(events?.pts ?? 0)),
            h: Number(cards?.hands ?? 0), b: Number(cards?.best ?? 0),
            t: Number(titles?.n ?? 0),
            r: IBS.leaderboards.placesOf(id, PLACES_SHOWN),
        };
    }

    // what they wrote about themselves and whether it's private, saved; theirs sent back as it is now
    public async set(player: Player, about: any, priv: any) {
        const refuse = (why: string) => player.send({ r: S2C.PLAYER_PROFILE_REFUSED, w: why });
        const now = Date.now();
        if (now - (this.lastSet.get(player.id) ?? 0) < PROFILE_GAP_MS) return refuse("Wait a moment before trying again");
        this.lastSet.set(player.id, now);
        const a = cleanAbout(about);
        const why = a ? IBS.chat.refusal(player, a, true) : "";
        if (why) return refuse(why);
        await this.query(
            `INSERT INTO player_profile (player_id, about, private, updated_at) VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE about = VALUES(about), private = VALUES(private), updated_at = VALUES(updated_at)`,
            [player.id, a, priv ? 1 : 0, new Date(now)]);
        await this.send(player, player.record.displayName);
    }

}
