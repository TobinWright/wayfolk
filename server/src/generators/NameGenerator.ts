import { Sex } from "../constants/Constants";
import { Utils } from "../utils/Utils";

export class NameGenerator {

    //#region === Account Name Generator ===

    public static getName() {
        var numbers = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
        var pre = ["ansy", "bald", "beefy", "chubby", "clean", "dozy", "drab", "eery", "fancy", "fit", "flabby", "gaunt", "goofy", "hardy", "mushy", "plain", "plump", "scruffy", "skinny", "stocky", "ugly", "artsy", "brave", "calm", "eager", "fallen", "gentle", "happy", "jolly", "kind", "lively", "nice", "polite", "proud", "silly", "tepid", "witty", "zealous", "angry", "clumsy", "fierce", "grumpy", "holy", "itchy", "lazy", "nervous", "scary", "uptight", "worried", "big", "cold", "fat", "great", "huge", "little", "petite", "puny", "scrawny", "short", "small", "tall", "tiny"];
        var post = ["actor", "apple", "balloon", "banana", "battery", "beach", "beard", "bed", "boy", "branch", "brother", "camera", "candle", "car", "cartoon", "church", "crayon", "diamond", "dinner", "doctor", "dog", "dream", "dress", "egg", "ear", "engine", "eye", "fish", "flag", "flower", "football", "forest", "fountain", "garage", "gold", "grass", "guitar", "hair", "iceburg", "island", "jar", "juice", "knight", "king", "lemon", "laundry", "maze", "mouse", "needle", "nail", "otter", "opal", "piper", "pickle", "queen", "quail", "road", "record", "swamp", "shore", "train", "taco", "unicorn", "victor", "water", "witch", "yard", "zebra"];
        var preIndex = Math.floor(Math.random() * pre.length);
        var postIndex = Math.floor(Math.random() * post.length);

        var name = pre[preIndex] + post[postIndex];
        for (var i = 0; i < 4; i++) {
            var numberIndex = Math.floor(Math.random() * numbers.length);
            name += numbers[numberIndex];
        }

        return name;
    }

    //#endregion

    //#region === Character Name Generator ===

    public static getCharacterName(sex: Sex) {
        var firstName = "";
        if (sex == Sex.MALE) {
            var maleIndex = Utils.randomIndex(this.MALE_NAMES.length);
            firstName = this.MALE_NAMES[maleIndex];
        } else {
            var femaleIndex = Utils.randomIndex(this.FEMALE_NAMES.length);
            firstName = this.FEMALE_NAMES[femaleIndex];
        }
        return firstName + " " + this.getLastName();
    }

    private static getLastName() {
        var prefixIndex = Utils.randomIndex(this.LAST_NAMES_PREFIX.length);
        var postfixIndex = Utils.randomIndex(this.LAST_NAMES_POSTFIX.length);

        var prefixName = this.LAST_NAMES_PREFIX[prefixIndex];
        var postfixName = this.LAST_NAMES_POSTFIX[postfixIndex];

        while (prefixName == postfixName) {
            postfixIndex = Utils.randomIndex(this.LAST_NAMES_POSTFIX.length);
            postfixName = this.LAST_NAMES_POSTFIX[postfixIndex];
        }

        var fullname = prefixName + postfixName;
        return fullname.substring(0, 1).toUpperCase() + fullname.substring(1);
    }

    private static MALE_NAMES = ["Aragon", "Borin", "Cedric", "Draven", "Eamon", "Farlan", "Galen", "Haldor", "Idris", "Jareth", "Kael", "Loras", "Mordecai", "Niall", "Orin", "Perrin", "Quillon", "Ragnor", "Silas", "Thorne", "Ulric", "Varen", "Wystan", "Xander", "Yoren", "Zephyr", "Aelar", "Balric", "Cormac", "Daelan", "Elric", "Fenris", "Gethin", "Halmar", "Isen", "Jarin", "Karath", "Lucan", "Malric", "Nathair", "Oren", "Phelan", "Quinlan", "Roderic", "Soren", "Talon", "Ulmar", "Valen", "Wulfric", "Xavian", "Yorick", "Zarek", "Alaric", "Braith", "Corwin", "Doran", "Eryndor", "Faelan", "Gareth", "Harkin", "Ithor", "Jorund", "Kelric", "Lukan", "Merek", "Nerion", "Othar", "Phineas", "Quenlan", "Raiden", "Solon", "Tyrell", "Uther", "Veyron", "Wolfram", "Xerxes", "Yvain", "Zorion", "Aleron", "Brandis", "Cyran", "Daven", "Eirik", "Faric", "Garion", "Hadrian", "Ilian", "Jareth", "Kalron", "Lothar", "Maelor", "Nereus", "Orwin", "Pryce", "Quenton", "Ronan", "Severin", "Taric", "Ulthar", "Varren", "Wyland", "Xanderon", "Yoric", "Zayne", "Alistair", "Belric", "Carric", "Darion", "Elros", "Fendral", "Gawain", "Haldir", "Isran", "Jarethor", "Kelden", "Loran", "Mordred", "Nyron", "Oryn", "Paxton", "Quinlor", "Roderick", "Selric", "Talmar", "Ulver", "Valandor", "Wyndon", "Xanderian", "Ygrin", "Zethar", "Aldric", "Branthor", "Caden", "Drystan", "Eldarion", "Falkor", "Galdor", "Herion", "Iston", "Jereth", "Kildor", "Lyndor", "Maric", "Norin", "Ordan", "Perran", "Quillian", "Rurik", "Sorin", "Tanis", "Ulwin", "Velian", "Wyvern", "Xavion", "Yrithor", "Zevrin", "Aric", "Braedon", "Callon", "Davor", "Eiron", "Fenar", "Galor", "Haron", "Ithran", "Jorn", "Keldan", "Leoric", "Merric", "Nyran", "Orlen", "Pryderi", "Qorin", "Raelan", "Silar", "Thoron", "Ulan", "Vilar", "Wylan", "Xion", "Ylarion", "Zathor", "Alorin", "Branok", "Ciran", "Doranth", "Elyan", "Farlanor", "Garon", "Haleth", "Idran", "Jorlan", "Kellor", "Lorcan", "Miron", "Nalir", "Osric", "Parin", "Qadar", "Rynor", "Selwyn", "Thrand", "Uldor", "Voryn", "Wynric", "Xaric", "Yrion", "Zorvan", "Alden", "Brentar", "Caelan", "Daenor", "Eirikr", "Falon", "Gared", "Harlon", "Isenor", "Jorran", "Kendric", "Lucar", "Malen", "Neirin", "Orlan", "Pellin", "Quillianor", "Rydel", "Solandor", "Thrynn", "Ulricar", "Vynar", "Wrothgar", "Xavianor", "Ylric", "Zephyrion", "Asher", "Barron", "Crevan", "Doranthar", "Elion", "Falcor", "Gavron", "Haldorin", "Islin", "Joryn", "Karic", "Leif", "Mordan", "Nereth", "Orelan", "Paelorn", "Quinith", "Rorn", "Seron", "Thandor", "Ulanor", "Valcor", "Wylandor", "Xanthis", "Yvarin", "Zoren", "Aelric", "Brindor", "Cerran", "Davorn", "Eilion", "Farandor", "Garenor", "Halion", "Idrion", "Jornath", "Kelwin", "Lorion", "Mordran", "Nymor", "Ostan", "Perrion", "Qiran", "Roald", "Sorenor", "Tharn", "Uldorin", "Valon", "Wyllar", "Xaven", "Yorin", "Zarekion", "Aethor", "Brendor", "Cedran", "Durnor", "Eirion", "Falorn", "Galwin", "Halor", "Ilthor", "Jorric", "Karondor", "Leoricar", "Malar", "Norath", "Othran", "Paranor", "Quinlar", "Rythar", "Selricor", "Thorwin", "Ulanorion", "Verran", "Wylanor", "Xarion", "Yrthor", "Zorin", "Altor", "Baric", "Calloran", "Dornan", "Eldran", "Farion", "Garandor", "Haldar", "Iscarion", "Jorlanor", "Keldorion", "Loranth", "Morthan", "Nyrion", "Orlinar", "Pelion", "Quirion", "Roran", "Selar", "Thorinor", "Uldran", "Valoran", "Wynlor", "Xavianthor", "Ylrin", "Zethorin", "Aelarion", "Branir", "Coran", "Daranor", "Eirikion", "Faranor", "Galdorion", "Halindor", "Idril", "Joranth", "Kallor", "Lythor", "Miranor", "Nerionor", "Orend", "Perrith", "Quinorin", "Ronir", "Sornor", "Thranir", "Ulthor", "Valinor", "Wyrion", "Xandar", "Yvarion", "Zorithar", "Aldan", "Brinor", "Carad", "Drenor", "Eithor", "Fandor", "Garenath", "Halorn", "Iral", "Jornar", "Kelthar", "Lorinor", "Morion", "Nythar", "Orvar", "Pellanor", "Quindor", "Rornor", "Selthor", "Tharic", "Ulrion", "Varinor", "Wylanth", "Xanderor", "Ythor", "Zythar", "Arandir", "Berran", "Ceren", "Darith", "Eirinor", "Faldor", "Garron", "Halorion", "Ithanor", "Jorrith", "Kaldenor", "Leiric", "Morthor", "Nerrin", "Orwinor", "Perranor", "Quinreth", "Rynir", "Seldor", "Thrandor", "Ulanthar", "Valorn", "Wyrionor", "Xarathor", "Yrgan", "Zaranth", "Aelrin", "Brenor", "Callathor", "Durrin", "Eilir", "Farionor", "Galorn", "Haldrin", "Itharion", "Jorinor", "Kelran", "Lorinorion", "Mordranor", "Nyrith", "Orvanor", "Pelorn", "Quindar", "Roranth", "Sornorion", "Tharin", "Ultharion", "Varanor", "Wrynn", "Xarathorin", "Ygrinor", "Zethon", "Aeloron", "Brondor", "Cedranor", "Dornith", "Eirithor", "Faronor", "Garinor", "Halthor", "Istanor", "Joranor", "Kendrith", "Lythar", "Marithor", "Noren", "Orlinth", "Pellenor", "Quinlanor", "Ronar", "Serith", "Tharnor", "Ulanthorin", "Valithor", "Wynran", "Xalandor", "Yvinor", "Zanthir", "Aeronir", "Branthorin", "Corlan", "Daranthorin", "Eirikor", "Faldorin", "Galdron", "Halron", "Irithor", "Jorthan", "Kalran", "Lyndar", "Merithor", "Nerionth", "Orenth", "Perlanor", "Quinlenor", "Rorlan", "Selan", "Thrandorin", "Ulthorinor", "Varyn", "Wylandorion", "Xarionthorin", "Yvinorin", "Zorand", "Aerin", "Branorion", "Coranorin", "Darithorin", "Eirlanor", "Farionnor", "Galdorinor", "Halorin", "Istranor", "Jornithorin", "Kelandorion", "Lorindar", "Mordranorin", "Nyronir", "Oraneth", "Peloron", "Quinril", "Rorinthorin", "Serrithor", "Tharnorin", "Ulindorin", "Valonor", "Wyrin", "Xarinethor", "Yindarion", "Zorlinor"];

    private static FEMALE_NAMES = ["Elowen", "Ariadne", "Seraphina", "Lilith", "Ysolde", "Thalassa", "Astrid", "Selene", "Morgana", "Isolde", "Elysia", "Fiora", "Calista", "Freya", "Amara", "Lyra", "Elara", "Rowena", "Zara", "Daphne", "Vespera", "Nimue", "Celeste", "Ismira", "Ilyana", "Faelwen", "Arwen", "Lirael", "Bryndis", "Elira", "Talia", "Nyx", "Saoirse", "Aeliana", "Eira", "Melisande", "Gwenore", "Rhiannon", "Faylen", "Anwen", "Thalia", "Evangeline", "Althea", "Kaida", "Zephyra", "Seren", "Saphira", "Miriel", "Isara", "Kallista", "Lunara", "Naida", "Selena", "Lysandra", "Vivienne", "Aisling", "Esmeray", "Cerys", "Avaline", "Liara", "Serilda", "Morwenna", "Briallen", "Eldara", "Ylva", "Cassandra", "Ophelia", "Idril", "Arianwyn", "Galadriel", "Iselda", "Fiora", "Vanya", "Elvina", "Seraphiel", "Liora", "Naomi", "Azura", "Calypsa", "Eowyn", "Mira", "Sylvia", "Amethyst", "Cassia", "Illyria", "Tirion", "Xanthe", "Sorcha", "Imara", "Elowyn", "Maris", "Zariah", "Ravenna", "Adara", "Meliora", "Yvaine", "Kyra", "Ariella", "Zinnia", "Caelia", "Anara", "Selara", "Maelis", "Lyanna", "Eloweth", "Viora", "Iridessa", "Zalira", "Serenna", "Liriel", "Miranda", "Sorrel", "Valindra", "Aralyn", "Siona", "Elenia", "Kaelith", "Mireille", "Rosara", "Tiriel", "Selenae", "Aurelia", "Karis", "Zelena", "Elysande", "Faelira", "Leira", "Cassiel", "Lorien", "Nerina", "Sylvanna", "Tanith", "Virelai", "Mirella", "Aeliria", "Isla", "Xylia", "Nerys", "Valeria", "Isoldean", "Elowin", "Caladwen", "Lylith", "Maeve", "Arisa", "Evalith", "Velora", "Ceres", "Saphyra", "Eloria", "Nymeria", "Eowen", "Aeris", "Lavinia", "Serelle", "Kaelin", "Thessalia", "Brielle", "Iria", "Cailin", "Mirielis", "Lioraen", "Alysanne", "Tanwen", "Morrigan", "Eirae", "Fioraen", "Nithra", "Sylviana", "Caelira", "Yara", "Elaena", "Xyliana", "Calithra", "Velindra", "Iona", "Maraella", "Tarial", "Elysra", "Ithilwen", "Araleth", "Selenar", "Velith", "Nolwen", "Zephyraen", "Serelith", "Calira", "Evelith", "Nariah", "Liraen", "Alyndra", "Sable", "Thessara", "Morwena", "Evandra", "Zylara", "Ylwen", "Liraella", "Ismara", "Galadwen", "Alira", "Serildaen", "Vesperis", "Alyssara", "Eldria", "Loriel", "Marisiel", "Calissa", "Nimira", "Eliraen", "Faelana", "Isari", "Tarin", "Saphiraen", "Eowenna", "Kaelithra", "Sylira", "Valen", "Zeraphina", "Arwenna", "Nimara", "Lyrielle", "Serenella", "Aerisella", "Tanira", "Maevelyn", "Rhiannonis", "Calirwen", "Aurelen", "Syliraen", "Thalira", "Nimitha", "Evalira", "Eiralin", "Cerestra", "Ariana", "Zelina", "Xyra", "Morwenis", "Eowenys", "Liliana", "Celira", "Elisandra", "Miralin", "Tanirael", "Ithira", "Valerion", "Seraphielis", "Mirelin", "Caeliraen", "Faelen", "Isolyn", "Arianda", "Lioraella", "Nolira", "Thalindra", "Galadriella", "Elvira", "Nythera", "Ithilara", "Liraenys", "Selaria", "Caliraen", "Velithra", "Zephyrell", "Maeriel", "Tarinya", "Sorrelis", "Alysira", "Evaliraen", "Tanitha", "Elowenna", "Mirindra", "Calithrella", "Serelithra", "Faelith", "Sylviaen", "Elowynna", "Vesperith", "Maevela", "Zylithra", "Morriganis", "Arianae", "Ionaella", "Liraelys", "Xyrell", "Nerysella", "Zelira", "Thessaria", "Vesperaen", "Isariel", "Caeliraella", "Evalis", "Galadriellis", "Lioraena", "Serenara", "Calirwenna", "Nymerith", "Mirellis", "Faelora", "Aralith", "Sylvenna", "Elyndra", "Virelith", "Aureliaen", "Serenith", "Calisandra", "Elirael", "Zeraphinae", "Nolwenna", "Velithraen", "Faelindris", "Iselwen", "Tariella", "Nytheraen", "Valeriaen", "Ithilra", "Thalassaen", "Serelira", "Evalynna", "Zelindra", "Elisandraen", "Mirelith", "Caelith", "Isariella", "Arwenith", "Alyssaraen", "Vesperisella", "Eiralinys", "Galadriela", "Taniraen", "Lilianaen", "Faelenna", "Sylvira", "Zylitha", "Nyxella", "Serelithis", "Maevel", "Arianaella", "Isoldeina", "Evalisa", "Lioraenis", "Thessalira", "Vespereth", "Caliraella", "Morrigana", "Velindraen", "Saphyrena", "Mirielle", "Seraphira", "Eowenith", "Lysandrael", "Sylvannaen", "Alyndris", "Evalisara", "Galadrielis", "Veloriel", "Nimaraen", "Caelithra", "Zephirael", "Nymerithra", "Serenellis", "Liraenna", "Faeloraen", "Thalithra", "Aralynna", "Isarielle", "Calithraen", "Sylirael", "Vesperia", "Mirelaen", "Tariellis", "Evaliraella", "Lioraennis", "Zelithra", "Velinira", "Galadriellia", "Aurella", "Ithilwenna", "Maevelis", "Serenaraen", "Elysira", "Caeliraenys", "Nytherella", "Sylvannis", "Aralira", "Tarinella", "Isolara", "Valerith", "Faelindrell", "Saphiraenys", "Evalindra", "Galadriellaen", "Velirith", "Nimirella", "Zeraphira", "Nymerithis", "Caliraenna", "Liorael", "Sylvella", "Aravella", "Thaliris", "Serelithen", "Eldiriel", "Velindraella", "Nymerithen", "Caelindra", "Evalirael", "Zeliren", "Faelirael", "Galadriellara", "Isarion", "Lioraelith", "Sylvire", "Vesperelle", "Ariellis", "Nolirith", "Tariellen", "Morriganel", "Ithiliris", "Serenithra", "Elowira", "Calindris", "Evaliraenith", "Zelithen", "Alyssariel", "Thessariaen", "Maevelith", "Saphiriel", "Caeliraenith", "Faelindrith", "Galadriellith", "Velirithra", "Evalisthra", "Nymeris", "Lioraelithra", "Thalindris", "Sylverith", "Morriganael", "Seraphirith", "Ariannael", "Nimiraen", "Isaraen", "Tarinel", "Vesperithra", "Evaliraenis", "Serenithis", "Ithilirith", "Calindrith", "Velindraenith", "Galadrielleth", "Zeliraen", "Faelindrithis", "Elisariel", "Thessirith", "Ariandel", "Saphirithra", "Caeliraenlis", "Nytherith", "Evalindris", "Isarielith", "Velorith", "Vesperithis", "Sylvireth"];

    private static LAST_NAMES_PREFIX = [
        "alpen", "amber", "ash", "autumn", "axe",
        "barley", "battle", "bear", "black", "blade", "blaze", "blood", "blue", "bone", "boulder", "bright", "bronze", "burning",
        "cask", "chest", "cinder", "clan", "claw", "clear", "cliff", "cloud", "cold", "common", "coven", "crag", "crest", "crow", "crystal",
        "dark", "dawn", "day", "dead", "death", "deep", "dew", "dirge", "distant", "doom", "down", "dragon", "dream", "dusk", "dust",
        "eagle", "earth", "elf", "ember", "even",
        "fallen", "far", "farrow", "feather", "fern", "fire", "fist", "flame", "flat", "flint", "fog", "fore", "forest", "four", "free", "frost", "frozen", "full", "fuse",
        "gloom", "glory", "glow", "gold", "gore", "grand", "grass", "gray", "great", "green", "grizzly",
        "hallow", "hallowed", "hammer", "hard", "haven", "hawk", "haze", "heart", "heavy", "hell", "high", "hill", "holy", "honor", "horse", "humble", "hydra",
        "ice", "iron",
        // j's
        "keen",
        "laughing", "leaf", "light", "lightning", "lion", "lone", "long", "low", "luna",
        "marble", "marsh", "master", "meadow", "mild", "mirth", "mist", "molten", "monster", "moon", "morning", "moss", "mountain", "mourn", "mourning",
        "nether", "nickle", "night", "noble", "nose",
        "oat", "ocean", "orb",
        "pale", "peace", "phoenix", "pine", "plain", "pride", "proud", "pyre",
        // q's
        "rage", "rain", "rapid", "raven", "red", "regal", "rich", "river", "rock", "rose", "rough", "rumble", "rune",
        "sacred", "sage", "saur", "sea", "serpent", "shade", "shadow", "sharp", "shield", "silent", "silver", "simple", "single", "skull", "sky", "slate", "smart", "snake", "snow", "soft", "solid", "spider", "spirit", "spring", "stag", "star", "steel", "stern", "still", "stone", "storm", "stout", "strong", "summer", "sun", "swift",
        "tall", "tarren", "terra", "three", "thunder", "titan", "tree", "true", "truth", "tusk", "twilight", "two",
        // u's
        "void",
        "war", "water", "wheat", "whisper", "whit", "white", "wild", "willow", "wind", "winter", "wise", "wolf", "wood", "wooden", "wyvern",
        // x's
        "young",
        // z's
    ];

    private static LAST_NAMES_POSTFIX = [
        "arm", "arrow", "ash", "axe",
        "bane", "bash", "basher", "beam", "beard", "belly", "bend", "bender", "binder", "blade", "blaze", "bleeder", "blight", "blood", "bloom", "blossom", "bluff", "bone", "bough", "bow", "brace", "braid", "branch", "brand", "breaker", "breath", "breeze", "brew", "bringer", "brook", "brooke", "brow",
        "caller", "chaser", "chewer", "claw", "cleaver", "cloud", "crag", "creek", "crest", "crusher", "cut", "cutter",
        "dancer", "dane", "dew", "doom", "down", "draft", "dream", "dreamer", "drifter", "dust",
        "eye", "eyes",
        "fall", "fallow", "fang", "feather", "fire", "fist", "flame", "flare", "flaw", "flayer", "flow", "flower", "follower", "force", "forest", "forge", "fury",
        "gaze", "gazer", "gem", "glade", "gleam", "glide", "gloom", "glory", "glow", "grain", "grip", "grove", "guard", "gust",
        "hair", "hammer", "hand", "heart", "hell", "helm", "hide", "horn", "hunter",
        // i's
        "jumper",
        "keep", "keeper", "killer",
        "lance", "lash", "leaf", "less", "light",
        "mane", "mantle", "mark", "maul", "maw", "might", "moon", "more", "mourn",
        // n's
        "oak", "orb", "ore",
        "peak", "pelt", "pike", "punch",
        // q's
        "rage", "reaper", "reaver", "rider", "ridge", "ripper", "river", "roar", "rock", "root", "run", "runner",
        "scar", "scream", "scribe", "seeker", "shade", "shadow", "shaper", "shard", "shield", "shine", "shot", "shout", "singer", "sky", "slayer", "snarl", "snout", "snow", "soar", "song", "sorrow", "spark", "spear", "spell", "spire", "spirit", "splitter", "sprinter", "stalker", "star", "steam", "steel", "stone", "stream", "strength", "stride", "strider", "strike", "striker", "sun", "surge", "swallow", "swift", "sword", "sworn",
        "tail", "taker", "talon", "thorn", "thorne", "tide", "toe", "track", "trap", "trapper", "tree",
        // u's
        "vale", "valor", "vigor",
        "walker", "ward", "watcher", "water", "weaver", "whirl", "whisk", "whisper", "willow", "wind", "winds", "wing", "wolf", "wood", "woods", "wound"
        // x's
        // y's
        // z's
    ];

    //#endregion

}