import * as PIXI from "pixi.js";

export class ImageUtils {

    public static createTextureFrames(baseTexture: PIXI.BaseTexture, frameWidth: number, frameHeight: number) {
        let columns = baseTexture.width / frameWidth;
        let rows = baseTexture.height / frameHeight;

        let textures: PIXI.Texture[] = [];
        for (let i = 0; i < rows; i++) {
            for (let j = 0; j < columns; j++) {
                textures.push(new PIXI.Texture(
                    baseTexture,
                    new PIXI.Rectangle(
                        j * frameWidth,
                        i * frameHeight,
                        frameWidth,
                        frameHeight)
                ));
            }
        }
        return textures;
    }

    //#region === Avatars ===

    /*
    public static createAvatarTextures(app: App, cosmetics: AvatarCosmetics, callback: CallableFunction) {
        let t1 = performance.now();
        this.loadAssets(app, cosmetics, () => {
            this.dyeAssets(app, cosmetics, (canvases: HTMLCanvasElement[]) => {
                this.layerAssets(canvases, (canvas: HTMLCanvasElement) => {
                    let baseTexture = new PIXI.BaseTexture(canvas);
                    let textures = this.createTextureFrames(baseTexture, 32, 32);

                    let t2 = performance.now();
                    console.log("Avatar Creation took " + (t2 - t1) + "ms");

                    callback(textures);
                });
            })
        });
    }

    private static loadAssets(app: App, cosmetics: AvatarCosmetics, callback: CallableFunction) {
        app.assets.loadTextures(
            [
                ["avatar-" + cosmetics.headId, Constants.IMAGES_PATH + "avatars/" + cosmetics.headId + ".png"],
                ["avatar-" + cosmetics.bodyId, Constants.IMAGES_PATH + "avatars/" + cosmetics.bodyId + ".png"]
            ],
            () => { callback(); }
        );
    }

    private static dyeAssets(app: App, cosmetics: AvatarCosmetics, callback: CallableFunction) {
        const palette = new IU_Palette(cosmetics);
        callback([
            this.dyeAsset(app, "avatar-" + cosmetics.bodyId, palette),
            this.dyeAsset(app, "avatar-" + cosmetics.headId, palette)
        ]);
    }

    private static dyeAsset(app: App, imageKey: string, palette: IU_Palette) {
        const texture = app.pixi.loader.resources[imageKey].texture;
        const resource = texture.baseTexture.resource as PIXI.ImageResource;
        const image = resource.source as CanvasImageSource;

        const canvas = document.createElement("canvas");
        canvas.width = texture.width;
        canvas.height = texture.height;

        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);

        const imgData = context.getImageData(0, 0, texture.width, texture.height);
        const data = imgData.data;
        for (let j = 0; j < data.length; j += 4) {
            if (data[j + 3] == 0) continue; // ignore transparent

            const colorIndex = this.getColorIndex(data[j], data[j + 1], data[j + 2]);
            if (colorIndex == -1) continue; // ignore unswappable colors

            const color = palette.colors[colorIndex][1];
            data[j] = color[0];
            data[j + 1] = color[1];
            data[j + 2] = color[2];
        }
        context.putImageData(imgData, 0, 0);

        return canvas;
    }

    private static layerAssets(canvases: HTMLCanvasElement[], callback: CallableFunction) {
        let finalCanvas = document.createElement("canvas");
        finalCanvas.width = canvases[0].width;
        finalCanvas.height = canvases[0].height;

        let finalContext = finalCanvas.getContext("2d");
        for (let i = 0; i < canvases.length; i++)
            finalContext.drawImage(canvases[i], 0, 0);

        callback(finalCanvas);
    }

    private static getColorIndex(r: number, g: number, b: number) {
        if (r != g || r != b) return -1; // not same color
        if (r == 0) return -1; // not at least 30
        if (r % 30 != 0) return -1; // not multiple of 30
        return Math.floor(r / 30) - 1;
    }

    //#endregion

    //#region === Helper Methods ===

    public static rgbToHex(r: number, g: number, b: number) {
        let rgb = r;
        rgb = (rgb << 8) + g;
        rgb = (rgb << 8) + b;
        return rgb;
    }

    public static hexToRgb(hex: number) {
        let red = (hex >> 16) & 0xFF;
        let green = (hex >> 8) & 0xFF;
        let blue = hex & 0xFF;
        return [red, green, blue];
    }

    //#endregion

    */

}

/*
export class IU_Palette {

    public colors: any[] = [];

    constructor(cosmetics: AvatarCosmetics) {
        // get secondary dye (30/60) (darker shade/lighter shade)
        const secondaryDye = Dyes.getRBG(cosmetics.secondaryDye);
        for (let i = 0; i < secondaryDye.length; i++)
            this.colors.push([30 + (i * 30), secondaryDye[i]]);

        // get primary dye (90/120)
        const primaryDye = Dyes.getRBG(cosmetics.primaryDye);
        for (let i = 0; i < primaryDye.length; i++)
            this.colors.push([90 + (i * 30), primaryDye[i]]);

        // get hair color (150/180)
        const hairColor = Dyes.getRBG(cosmetics.hairColor);
        for (let i = 0; i < hairColor.length; i++)
            this.colors.push([150 + (i * 30), hairColor[i]]);

        // get skin color (210)
        const skinColor = Dyes.getRBG(cosmetics.skinColor);
        this.colors.push([210, skinColor[0]]);

        // get eye color (240)
        const eyeColor = Dyes.getRBG(cosmetics.eyeColor);
        this.colors.push([240, eyeColor[0]]);
    }

}

// secondary dye (30/60) (darker shade/lighter shade)
// primary dye (90/120)
// hair color (150/180)
// skin color (210)
// eye color (240)

*/