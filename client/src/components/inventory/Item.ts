import * as PIXI from "pixi.js";
import { itemPic } from "../../art/ItemArt";
import { picTexture } from "../../people/People";
import { outlined } from "../ringmenu/RingMenu";

// an item's picture (art/ItemArt), outlined: 16 x 16
const itemTextures = new Map<number, PIXI.Texture>();
export function itemTexture(id: number) {
    let texture = itemTextures.get(id);
    if (!texture) itemTextures.set(id, texture = picTexture(outlined(itemPic(id))));
    return texture;
}
