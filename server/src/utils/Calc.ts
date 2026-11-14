export class Calc {

    //#region === Stats ===

    public static calculateStat(level: number, scaling: number) {
        var exponentBase = 0.70;
        var exponentGrowth = 0.04;
        var exponent = exponentBase + (exponentGrowth * scaling);

        var multiplierBase = 0.8;
        var multiplierGrowth = 0.1;
        var multiplier = multiplierBase + (multiplierGrowth * scaling);

        return Math.floor(Math.pow(level, exponent) * multiplier);
    }

    public static calculateHealth(vitality: number) {
        return vitality * 40;
    }

    //#endregion

}