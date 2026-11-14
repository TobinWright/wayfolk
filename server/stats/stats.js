// The Analytics on a phone (server/src/managers/analytics/StatsPage.ts): the
// snapshot from ./data (shared/Analytics.ts, with `labels` for its names),
// drawn as sections of tiles, bar lists and column charts. Tap a bar or a
// row to read it along the bottom. The chat (./chat: General, Trade and Help)
// is asked for every CHAT_MS, to read only. The key's kept in this browser
// (localStorage); a link ending #key=... gives it once.
"use strict";

(function () {
    const KEY = "wayfolk-stats-key";
    const STAFF = "wayfolk-stats-staff";
    const REFRESH_MS = 60 * 1000;
    const CHAT_MS = 15 * 1000;
    const CHANNEL = "wayfolk-stats-channel";
    const SECTIONS = [
        ["overview", "Overview"], ["feedback", "Feedback"], ["chat", "Chat"], ["players", "Players"], ["time", "Play time"], ["retention", "Retention"],
        ["heroes", "Heroes"], ["economy", "Economy"], ["social", "Social"], ["features", "Features"], ["churn", "Churn"],
    ];

    const $ = (id) => document.getElementById(id);
    const main = $("main"), readout = $("readout");
    let last = null, asking = false;

    // (storage can be missing: private windows)
    const store = {
        get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
        set(k, v) { try { localStorage.setItem(k, v); } catch (e) { } },
        drop(k) { try { localStorage.removeItem(k); } catch (e) { } },
    };

    let key = store.get(KEY) || "";
    const hash = /#key=([^&]+)/.exec(location.hash);
    if (hash) {
        key = decodeURIComponent(hash[1]);
        store.set(KEY, key);
        history.replaceState(null, "", location.pathname + location.search);
    }
    $("staff").checked = store.get(STAFF) == "1";

    //#region === Asking ===

    async function ask() {
        if (!key) return showKeyForm();
        if (asking) return;
        asking = true;
        showAge();
        try {
            const res = await fetch(`data${$("staff").checked ? "?staff=1" : ""}`, { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" });
            if (res.status == 401) {
                store.drop(KEY);
                key = "";
                return showKeyForm("That key didn't work.");
            }
            if (res.status == 429) return showKeyForm("Too many wrong keys: try again in 15 minutes.");
            if (!res.ok) throw new Error(`The server said ${res.status}`);
            last = await res.json();
            $("keyform").hidden = true;
            draw();
            askChat();
        } catch (e) {
            if (!last) main.replaceChildren(h("p", { cls: "empty" }, `Couldn't get the numbers: ${e.message}`));
        } finally {
            asking = false;
            showAge();
        }
    }

    // the chat's kept lines, drawn into its section (a wrong key's left to ask())
    let chatLast = null, chatAsking = false;
    async function askChat() {
        if (!key || !last || chatAsking) return;
        chatAsking = true;
        try {
            const res = await fetch("chat", { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" });
            if (!res.ok) return;
            chatLast = await res.json();
            drawChat();
        } catch (e) {
        } finally {
            chatAsking = false;
        }
    }

    function showKeyForm(error) {
        $("keyform").hidden = false;
        $("keyerror").hidden = !error;
        $("keyerror").textContent = error || "";
        main.replaceChildren();
        $("key").focus();
    }

    $("keyform").addEventListener("submit", (e) => {
        e.preventDefault();
        key = $("key").value.trim();
        store.set(KEY, key);
        ask();
    });
    $("refresh").addEventListener("click", ask);
    $("staff").addEventListener("change", () => {
        store.set(STAFF, $("staff").checked ? "1" : "0");
        ask();
    });
    setInterval(() => { if (!document.hidden) ask(); }, REFRESH_MS);
    setInterval(() => { if (!document.hidden) askChat(); }, CHAT_MS);
    document.addEventListener("visibilitychange", () => { if (!document.hidden && last && Date.now() - last.a.at > REFRESH_MS) ask(); });
    setInterval(showAge, 1000);

    function showAge() {
        $("age").textContent = asking ? "Updating..." : last ? `Updated ${ago(Date.now() - last.a.at)} ago` : "";
    }

    //#endregion

    //#region === Drawing ===

    // an element: h("div", { cls, text, on }, ...children)
    function h(tag, props, ...children) {
        const el = document.createElement(tag);
        if (props?.cls) el.className = props.cls;
        if (props?.style) el.setAttribute("style", props.style);
        if (props?.on) el.addEventListener("click", props.on);
        for (const c of children) if (c != null) el.append(c instanceof Node ? c : String(c));
        return el;
    }

    // said along the bottom (tapped), its bar lit till something else is
    let lit = null;
    function say(el, text) {
        if (lit) lit.classList.remove("on");
        lit = el;
        el.classList.add("on");
        readout.hidden = false;
        readout.textContent = text;
    }

    function tiles(list) {
        return h("div", { cls: "tiles" }, ...list.map(([name, value, hint]) =>
            h("div", { cls: "tile" }, h("div", { cls: "name" }, name), h("div", { cls: "value" }, value), hint ? h("div", { cls: "hint" }, hint) : null)));
    }

    function card(title, side, ...body) {
        return h("div", { cls: "card" }, h("h3", null, title, side ? h("span", null, side) : null), ...body);
    }

    // a bar a row: [name, value], shown by `show`, said by `tell` when tapped
    function rows(title, list, show = num, tell = (n, v) => `${n}: ${num(v)}`) {
        if (!list.length) return card(title, null, h("p", { cls: "wrap" }, "Nothing yet"));
        const top = Math.max(1, ...list.map((r) => r[1]));
        return card(title, null, h("div", { cls: "rows" }, ...list.map(([name, v], k) => {
            const row = h("div", { cls: "row" },
                h("span", { cls: "label" }, name),
                h("span", { cls: "track" }, h("span", { cls: "fill", style: `display:block;width:${v > 0 ? Math.max(1, v / top * 100) : 0}%` })),
                h("span", { cls: "num" }, show(v)));
            row.addEventListener("click", () => say(row, tell(name, v, k)));
            return row;
        })));
    }

    // a column chart, the tallest at the top
    function columns(title, values, tell, from, to) {
        const top = Math.max(1, ...values);
        const cols = h("div", { cls: "cols" }, ...values.map((v, k) => {
            const col = h("div", { cls: "col" }, h("div", { style: `height:${v > 0 ? Math.max(1, v / top * 100) : 0}%` }));
            col.addEventListener("click", () => say(col, tell(k)));
            return col;
        }));
        return card(title, `max ${short(top)}`, cols, h("div", { cls: "ends" }, h("span", null, from), h("span", null, to)));
    }

    function pair(...cards) {
        return h("div", { cls: "pair" }, ...cards);
    }

    function section(id, title, ...body) {
        return h("section", { cls: "" }, h("h2", null, title), ...body);
    }

    function empty(text) {
        return h("p", { cls: "empty" }, text);
    }

    function draw() {
        const { a, labels } = last;
        const sections = [
            ["overview", overview(a)], ["feedback", feedback(a, labels)], ["chat", chat()], ["players", players(a, labels)], ["time", playTime(a, labels)], ["retention", retention(a)],
            ["heroes", heroes(a, labels)], ["economy", economy(a)], ["social", social(a)], ["features", features(a)], ["churn", churn(a, labels)],
        ];
        main.replaceChildren(...sections.map(([id, body]) => {
            const s = section(id, SECTIONS.find((x) => x[0] == id)[1], ...body);
            s.id = id;
            return s;
        }));
        $("nav").replaceChildren(...SECTIONS.map(([id, name]) => {
            const link = h("a", null, name);
            link.href = `#${id}`;
            link.addEventListener("click", (e) => {
                e.preventDefault();
                $(id).scrollIntoView({ behavior: "smooth" });
            });
            return link;
        }));
        watchSections();
        drawChat();
    }

    // the nav's chip for the section on screen, lit
    let watcher = null;
    function watchSections() {
        watcher?.disconnect();
        if (!("IntersectionObserver" in window)) return;
        watcher = new IntersectionObserver((seen) => {
            for (const s of seen) if (s.isIntersecting) {
                for (const a of $("nav").children) a.classList.toggle("on", a.getAttribute("href") == `#${s.target.id}`);
                $("nav").querySelector(".on")?.scrollIntoView({ block: "nearest", inline: "nearest" });
            }
        }, { rootMargin: "-130px 0px -60% 0px" });
        for (const s of main.children) watcher.observe(s);
    }

    //#endregion

    //#region === Sections ===

    const DAYS = 30;
    const dayOf = (k, n = DAYS) => dayName(n - 1 - k);

    function overview(a) {
        const s = a.server, p = a.players, t = a.time;
        const n = s.day.length;
        return [
            tiles([
                ["Online now", num(s.online), `${num(s.loaded)} loaded with away heroes`],
                ["Played today", num(t.today), `${num(t.wau)} this week, ${num(t.mau)} this month`],
                ["Stickiness", t.mau ? pct(t.today, t.mau) : "-", "today's players of this month's"],
                ["New 24h", num(p.new1), `${num(p.new7)} this week`],
                ["Session", t.sessions7 ? dur(t.medianSession) : "-", "median, last 7 days"],
                ["Peak online", num(s.peak), `${ago(a.at - s.peakAt)} ago`],
                ["Players", num(p.total), `${num(p.guest)} guests`],
                ["Supporters", num(p.premium), `${num(p.subs)} subscribed`],
            ]),
            columns("Signed in, the last 24 hours", s.day.map((v) => Math.max(0, v)),
                (k) => s.day[k] < 0 ? "The server wasn't up yet" : `${minutesAgo((n - 1 - k) * 10)}: ${num(s.day[k])} signed in`, "24h ago", "now"),
            pair(
                columns("Players a day", t.dau, (k) => `${dayOf(k)}: ${num(t.dau[k])} played`, "30d ago", "today"),
                columns("New players a day", p.signups, (k) => `${dayOf(k)}: ${num(p.signups[k])} new`, "30d ago", "today")),
            h("p", { cls: "note" }, `Server up ${ago(s.up)} · ${num(s.heap)} MB · ${num(s.lag)} ms lag · ${num(a.social.reportsOpen)} chat reports open`),
        ];
    }

    // what players wrote, newest first (marked dealt with on the admin panel)
    function feedback(a, L) {
        const f = a.feedback;
        const head = tiles([
            ["Open", num(f.open), "not dealt with yet"],
            ["This week", num(f.week), "sent the last 7 days"],
        ]);
        if (!f.recent.length) return [head, empty("Nothing waiting.")];
        return [head, ...f.recent.map((x) => h("div", { cls: "card note-card" },
            h("h3", null, `${L.feedbackKinds[x.k] ?? "?"} · ${x.by}`, h("span", null, `${ago(Date.now() - x.a)} ago`)),
            h("p", { cls: "said" }, x.t),
            h("p", { cls: "note" }, `#${x.i}${x.d ? ` · ${x.d}` : ""}${x.v ? ` · ${x.v}` : ""}`)))];
    }

    // General, Trade and Help: a tab each, the newest line at the bottom (drawn by drawChat)
    let channel = Number(store.get(CHANNEL)) || 0;
    function chat() {
        const box = h("div", { cls: "chat" });
        box.id = "chatbox";
        return [box];
    }

    function drawChat() {
        const box = $("chatbox");
        if (!box) return;
        if (!chatLast) return box.replaceChildren(empty("Getting the chat..."));
        const { channels, lines } = chatLast;
        const was = box.querySelector(".lines"), wasChannel = box.dataset.channel;
        const back = was && wasChannel == String(channel) ? was.scrollHeight - was.clientHeight - was.scrollTop : 0;     // (scrolled up to read: kept there)
        box.dataset.channel = String(channel);
        if (!channels[channel]) channel = 0;
        const tabs = h("div", { cls: "tabs" }, ...channels.map((name, c) =>
            h("button", { cls: c == channel ? "on" : "", on: () => { channel = c; store.set(CHANNEL, String(c)); drawChat(); } }, `${name} (${lines[c].length})`)));
        const list = lines[channel].length
            ? h("div", { cls: "card lines" }, ...lines[channel].map((l) => h("div", { cls: l.e ? "line game" : "line" },
                h("span", { cls: "when" }, clock(l.a)),
                h("b", null, `${l.g ? `[${l.g}] ` : ""}${l.n}`), " ", l.t)))
            : empty("Nothing said since the server started.");
        box.replaceChildren(tabs, list, h("p", { cls: "note" }, `The lines the server keeps a channel, since it last started. Read only; asked for every ${CHAT_MS / 1000}s.`));
        list.scrollTop = list.scrollHeight - list.clientHeight - (back > 8 ? back : 0);
    }

    function players(a, L) {
        const p = a.players, back = p.retention;
        const withGuide = p.guide[L.steps.length];
        return [
            tiles([
                ["Active 7d", num(p.active7), pct(p.active7, p.total)],
                ["Active 30d", num(p.active30), pct(p.active30, p.total)],
                ["Back day 1", back[0][1] ? pct(...back[0]) : "-", `${num(back[0][0])} of ${num(back[0][1])}`],
                ["Back day 7", back[1][1] ? pct(...back[1]) : "-", `${num(back[1][0])} of ${num(back[1][1])}`],
                ["Back day 30", back[2][1] ? pct(...back[2]) : "-", `${num(back[2][0])} of ${num(back[2][1])}`],
                ["Guests", pct(p.guest, p.total), "haven't saved an account"],
            ]),
            columns("Last seen, by day", p.lastSeen, (k) => `${dayOf(k)}: ${num(p.lastSeen[k])} last seen`, "30d ago", "today"),
            rows(`First steps (of ${num(withGuide)})`, L.steps.map((n, k) => [n, p.guide[k]]), (v) => pct(v, withGuide), (n, v) => `${n}: ${num(v)} players, ${pct(v, withGuide)}`),
        ];
    }

    function playTime(a, L) {
        const t = a.time;
        if (!t.since) return [empty("Nothing recorded yet: play time is recorded from each sign-in on.")];
        const sessions = t.lengths.reduce((s, v) => s + v, 0);
        const offset = Math.round(-new Date().getTimezoneOffset() / 60);
        const local = Array.from({ length: 24 }, (_, hr) => t.byHour[((hr - offset) % 24 + 24) % 24]);
        const devices = t.devices.reduce((s, d) => s + d[1], 0), comers = t.sources.reduce((s, d) => s + d[1], 0);
        return [
            tiles([
                ["Median session", dur(t.medianSession), `${num(t.sessions7)} sign-ins, 7 days`],
                ["Mean session", dur(t.meanSession), "the last 7 days"],
                ["A day", `${num(t.dailyMinutes)}m`, "signed in, per player who played"],
                ["Sign-ins a day", t.perDay.toFixed(1), "per player who played"],
                ["Playing", pct(t.busyShare, 1), `the rest idle (hidden, or ${L.idleMinutes}m untouched)`],
                ["Away (median)", t.returns ? dur(t.medianGap) : "-", `between sign-ins; mean ${dur(t.meanGap)}`],
                ["Heroes stopped", t.returns ? pct(t.stalledReturns, t.returns) : "-", "of returns came after their heroes stopped"],
                ["Stopped time", pct(t.stalledShare, 1), "of time away, heroes had stopped"],
                ["Came back", t.firsts ? pct(t.secondShare, 1) : "-", `for a 2nd session; 1st median ${dur(t.medianFirst)}`],
            ]),
            pair(
                columns("Hours signed in a day", t.played, (k) => `${dayOf(k)}: ${t.played[k]} hours signed in`, "30d ago", "today"),
                columns("Hours actively playing a day", t.busy, (k) => `${dayOf(k)}: ${t.busy[k]} hours playing`, "30d ago", "today")),
            pair(
                rows("Session lengths, 7 days", L.lengths.map((n, k) => [n, t.lengths[k]]), num, (n, v) => `${n}: ${num(v)} sign-ins, ${pct(v, sessions)}`),
                rows("Time away before coming back", L.gaps.map((n, k) => [n, t.gaps[k]]), num, (n, v) => `Away ${n}: ${num(v)} returns, ${pct(v, t.returns)}`)),
            columns("Minutes played by hour (your time), 7 days", local, (hr) => `${hr}:00-${hr}:59: ${num(local[hr])} minutes`, "0:00", "23:00"),
            pair(
                rows("Devices, 30 days", t.devices.map(([d, n]) => [cap(d), n]), num, (n, v) => `${n}: ${num(v)} players, ${pct(v, devices)}`),
                rows("Where new players came from", t.sources, num, (n, v) => `${n}: ${num(v)} new players, ${pct(v, comers)}`)),
            h("p", { cls: "note" }, `Recorded since ${dateName(t.since)}. Add ?ref=name to links you share to see them under where players came from.`),
        ];
    }

    function retention(a) {
        const c = a.cohorts;
        if (!c.length) return [empty("Nothing recorded yet: retention is counted for players who start from now on.")];
        const weeks = Math.max(...c.map((r) => r.weeks.length));
        const head = h("tr", null, h("th", null, "Started"), h("th", null, "Players"), ...Array.from({ length: weeks }, (_, k) => h("th", null, `Wk ${k}`)));
        const body = c.map((r) => h("tr", null,
            h("td", { cls: "left" }, dateName(r.start)), h("td", { cls: "left" }, num(r.size)),
            ...Array.from({ length: weeks }, (_, k) => {
                if (k >= r.weeks.length) return h("td", { style: "background:none" }, "");
                const share = r.size ? r.weeks[k] / r.size : 0;
                const cell = h("td", { style: share > 0 ? `background:color-mix(in srgb, var(--bar) ${Math.round(15 + 85 * share)}%, var(--cell))` : "" }, r.size ? pct(r.weeks[k], r.size) : "-");
                cell.addEventListener("click", () => say(cell, `Started from ${dateName(r.start)}: ${num(r.weeks[k])} of ${num(r.size)} played in week ${k}${k == r.weeks.length - 1 && k > 0 ? " (not over yet)" : ""}`));
                return cell;
            })));
        return [
            card("Played each week after starting", null, h("div", { cls: "grid" }, h("table", null, h("thead", null, head), h("tbody", null, ...body)))),
            h("p", { cls: "note" }, "Week 0 is the week they started. Brighter means more came back."),
        ];
    }

    function heroes(a, L) {
        const x = a.heroes, idle = x.doing[L.tasks.length] ?? 0;
        return [
            tiles([
                ["Heroes", num(x.total), `${(x.total / Math.max(1, a.players.total)).toFixed(1)} a player`],
                ["Idle", pct(idle, x.total), `${num(idle)} with nothing to do or resting`],
                ["Hurt", num(x.hurt), pct(x.hurt, x.total)],
                ["No heroes", num(x.rosters[0] ?? 0), "players without one"],
            ]),
            pair(
                rows("What they're doing", L.tasks.map((n, k) => [n, x.doing[k]]).concat([["Idle / resting", idle]]), num, (n, v) => `${n}: ${num(v)} heroes, ${pct(v, x.total)}`),
                rows("Jobs", L.jobs.map((n, k) => [n, x.jobs[k]]), num, (n, v) => `${n}: ${num(v)} heroes, ${pct(v, x.total)}`)),
            pair(
                rows("Average skill level", L.skills.map((n, k) => [n, x.skills[k]]), (v) => v.toFixed(1), (n, v) => `${n}: level ${v.toFixed(1)} on average`),
                rows("Where they are most", x.places)),
            pair(
                rows("Highest total level", x.top.map(([n, who, l]) => [`${n} (${who})`, l])),
                columns("Heroes by total level", x.levels, (k) => `Total level ${k * 10}-${k * 10 + 9}: ${num(x.levels[k])} heroes`, "0", `${x.levels.length * 10}`)),
        ];
    }

    function economy(a) {
        const e = a.economy;
        return [
            tiles([
                ["Gold held", short(e.gold), "in every stash"],
                ["Median stash", short(e.goldMedian), "half have less"],
                ["On the market", num(e.listings), `worth ${short(e.listed)}`],
                ["Sales 7d", num(e.sales7), `${short(e.gold7)} gold`],
                ["Sales ever", num(e.sales), `${short(e.goldAll)} gold`],
                ["Blackjack", num(e.bjPlayers), `${num(e.bjHands)} hands; players ${e.bjNet >= 0 ? "up" : "down"} ${short(Math.abs(e.bjNet))}`],
            ]),
            pair(rows("Most gold", e.rich, short), rows("Most held, every stash", e.items, short)),
            rows("Sold most on the market, 30 days", e.topSold, short),
        ];
    }

    function social(a) {
        const s = a.social, total = a.players.total;
        return [tiles([
            ["Guilds", num(s.guilds), `${num(s.guildMembers)} members`],
            ["In a guild", pct(s.guildMembers, total), "of players"],
            ["Friendships", num(s.friendships), `${num(s.asks)} asks waiting`],
            ["Whispers 7d", num(s.whispers7), "sent this week"],
            ["Reports open", num(s.reportsOpen), `${num(s.reports)} ever`],
            ["Events", num(s.events), `${num(s.eventsOn)} on now`],
            ["Events won", s.eventsWon + s.eventsLost ? pct(s.eventsWon, s.eventsWon + s.eventsLost) : "-", `${num(s.eventsWon)} won, ${num(s.eventsLost)} lost`],
            ["Event givers", num(s.eventGivers), pct(s.eventGivers, total)],
        ])];
    }

    function features(a) {
        const f = a.features, of = f.players7;
        if (!f.windows.length && !f.actions.length) return [empty("Nothing recorded yet: what players open and do is counted from now on.")];
        return [
            tiles([
                ["Players 7d", num(of), "did anything"],
                ["Top window", f.windows[0] ? pretty(f.windows[0][0]) : "-", f.windows[0] ? `${pct(f.windows[0][2], of)} of players` : ""],
                ["Windows used", num(f.windows.length), "this week"],
                ["Actions used", num(f.actions.length), "kinds of thing done"],
            ]),
            pair(
                rows("Windows opened, by players", f.windows.map(([w, , n]) => [pretty(w), n]), (v) => pct(v, of), (n, v, k) => `${n}: ${num(v)} players (${pct(v, of)}), ${num(f.windows[k][1])} times`),
                rows("Things done, by players", f.actions.slice(0, 40).map(([r, , n]) => [pretty(r), n]), (v) => pct(v, of), (n, v, k) => `${n}: ${num(v)} players (${pct(v, of)}), ${num(f.actions[k][1])} times`)),
        ];
    }

    function churn(a, L) {
        const c = a.churn, kept = c.old - c.gone;
        if (!c.started) return [empty("Nothing recorded yet: churn is counted for players who start from now on.")];
        return [
            tiles([
                ["Started", num(c.started), "since play was recorded"],
                ["Gone", c.old ? pct(c.gone, c.old) : "-", `${num(c.gone)} of ${num(c.old)} unseen ${L.goneDays}+ days`],
                ["Bounced", pct(c.bounced, c.started), `played under ${L.bounceMinutes}m and left`],
                ["1st session, gone", c.gone ? dur(c.firstGone) : "-", "median"],
                ["1st session, kept", kept ? dur(c.firstKept) : "-", "median"],
            ]),
            pair(
                rows("Where the gone stopped", L.steps.map((n, k) => [n, c.stoppedAt[k]]).concat([["Did every step", c.stoppedAt[L.steps.length]]]), num, (n, v) => `${n}: ${num(v)} left before this, ${pct(v, c.gone)}`),
                columns("Heroes the gone had", c.heroes, (k) => `${k} heroes: ${num(c.heroes[k] ?? 0)} gone`, "0", `${Math.max(0, c.heroes.length - 1)}`)),
            pair(
                rows("How long the gone played", L.playtimes.map((n, k) => [n, c.playtime[k]]), num, (n, v) => `${n}: ${num(v)} gone, ${pct(v, c.gone)}`),
                rows("And those who stayed", L.playtimes.map((n, k) => [n, c.playtimeKept[k]]), num, (n, v) => `${n}: ${num(v)} stayed, ${pct(v, kept)}`)),
            rows("Times the gone signed in", L.sessionCounts.map((n, k) => [n, c.sessions[k]]), num, (n, v) => `${n}: ${num(v)} gone, ${pct(v, c.gone)}`),
        ];
    }

    //#endregion

    //#region === Numbers ===

    function num(n) { return Math.round(n).toLocaleString("en-US"); }

    function short(n) {
        const a = Math.abs(n), sign = n < 0 ? "-" : "";
        if (a >= 1e9) return sign + (a / 1e9).toFixed(1) + "B";
        if (a >= 1e6) return sign + (a / 1e6).toFixed(1) + "M";
        if (a >= 1e4) return sign + (a / 1e3).toFixed(1) + "k";
        return Number.isInteger(n) ? num(n) : String(Math.round(n * 10) / 10);
    }

    function pct(part, whole) {
        if (!whole) return "0%";
        const p = part / whole * 100;
        return (p > 0 && p < 10 ? p.toFixed(1) : Math.round(p)) + "%";
    }

    function ago(ms) {
        const s = Math.max(0, Math.floor(ms / 1000));
        if (s < 60) return `${s}s`;
        const m = Math.floor(s / 60);
        if (m < 60) return `${m}m`;
        const hr = Math.floor(m / 60);
        if (hr < 24) return `${hr}h ${m % 60}m`;
        return `${Math.floor(hr / 24)}d ${hr % 24}h`;
    }

    function dur(seconds) { return ago(seconds * 1000); }

    function minutesAgo(minutes) { return minutes < 1 ? "Now" : `${ago(minutes * 60000)} ago`; }

    function dayName(back) {
        if (back == 0) return "Today";
        if (back == 1) return "Yesterday";
        return new Date(Date.now() - back * 86400000).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
    }

    function clock(ms) { return new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); }

    function dateName(ms) { return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" }); }

    function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

    function pretty(name) { return cap(name.toLowerCase().replace(/_/g, " ")); }

    //#endregion

    ask();
})();
