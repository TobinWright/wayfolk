// Premium, the Supporter subscription (server managers/billing; S2C.PREMIUM_STORE)
export class PremiumData {

    public on = false;          // subscribing works (Stripe set up, its price read)
    public price = "";          // "$4.99/mo"
    public until = 0;           // premium until (ms; 0 never)
    public renews = false;      // a subscription's being paid for (not cancelled)
    public color = 0;           // their name's colour, a Supporter (shared/Chat NAME_COLORS)

    public load(message: any) {
        this.on = !!message.on;
        this.price = message.p;
        this.until = message.u;
        this.renews = !!message.s;
        this.color = message.k ?? 0;
    }

    public get active() {
        return this.until > Date.now();
    }

}
