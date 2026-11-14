import { ChatLine } from "../../../shared/Chat";
import { Letter } from "../../../shared/Mail";
import { Offer } from "../../../shared/Trade";
import { Event } from "../constants/Events";
import { C2S, S2C } from "../constants/Routes";
import { IBC } from "../Engine";
import { BaseHandler } from "./BaseHandler";

// Mail (shared/Mail.ts; components/mail/Mail.ts): your mailbox as last sent,
// and how many letters you've not opened (the other menu's count). A letter
// coming, or some waiting as you sign in, is said in the General chat to you,
// from "Mail".
export class MailHandler extends BaseHandler {

    public letters: Letter[] = [];
    public unread = 0;
    public listed = false;          // (the mailbox has come since signing in)

    //#region === Outgoing ===

    public list() {
        this.send({ r: C2S.MAIL_LIST });
    }

    public write(to: string, note: string, o: Offer) {
        this.send({ r: C2S.MAIL_SEND, n: to, t: note, g: o.g, i: o.i });
    }

    // opened: unread no more (here at once, then on the server)
    public read(letter: Letter) {
        if (!letter.u) return;
        delete letter.u;
        this.setUnread(Math.max(0, this.unread - 1));
        this.send({ r: C2S.MAIL_READ, i: letter.i });
    }

    public take(id: number) {
        this.send({ r: C2S.MAIL_TAKE, i: id });
    }

    public sendBack(id: number) {
        this.send({ r: C2S.MAIL_RETURN, i: id });
    }

    public remove(id: number) {
        this.send({ r: C2S.MAIL_DELETE, i: id });
    }

    //#endregion

    //#region === Incoming ===

    public onMessage(message: any) {
        switch (message.r) {
            case S2C.MAIL_LIST:
                this.letters = message.l;
                this.listed = true;
                this.setUnread(message.u);
                IBC.events.emit(Event.MAIL_LIST);
                break;
            case S2C.MAIL_UNREAD:
                if (message.s) {
                    this.listed = false;
                    if (message.u) this.say(`You have ${message.u} unopened letter${message.u == 1 ? "" : "s"} - open Mail from the menu`);
                }
                this.setUnread(message.u);
                break;
            case S2C.MAIL_NEW:
                this.say(message.b == 1 ? `${message.n} sent your letter back`
                    : message.b == 2 ? `Your letter to ${message.n || "them"} wasn't collected in time - it's back in your mailbox`
                        : `A letter from ${message.n}`);
                this.setUnread(message.u);
                if (this.listed) this.list();
                break;
            case S2C.MAIL_DONE: IBC.events.emit(Event.MAIL_RESULT, { text: message.w, ok: true }); break;
            case S2C.MAIL_REFUSED: IBC.events.emit(Event.MAIL_RESULT, { text: message.w, ok: false }); break;
        }
    }

    private setUnread(n: number) {
        this.unread = n;
        IBC.events.emit(Event.MAIL_UNREAD);
    }

    private say(t: string) {
        const line: ChatLine = { c: 0, n: "Mail", t, a: Date.now(), e: 1 };
        IBC.data.chat.add(line);
        IBC.events.emit(Event.CHAT_SAID, line);
    }

    //#endregion

}
