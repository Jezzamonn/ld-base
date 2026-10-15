import { Assets, Container, Graphics, Sprite, Texture } from "pixi.js";
import { Point } from "../common";
import { GAME_HEIGHT, GAME_WIDTH, physFromPx, PHYSICS_SCALE } from "../constants";
import { Level } from "./level";

interface ImageLayerInfo {
    image: string,
    scale: number,
    offset?: Point,
}

interface FillLayerInfo {
    color: string,
}

type LayerInfo = ImageLayerInfo | FillLayerInfo;

// Drawn in order, so later layers are drawn on top of earlier ones.
// TODO: The fill layer currently covers the image layer. Swap them to make the image visible.
const BG_LAYERS: LayerInfo[] = [
    {
        image: "background",
        scale: 0.05,
        offset: {
            x: 0,
            y: -20,
        },
    },
    {
        color: "#c0cbdc",
    },
];

function imagePath(image: string) {
    return `sprites/${image}.png`;
}

export class Background {
    level: Level;

    layers: BackgroundLayer[] = [];
    offset: Point;

    container = new Container();

    constructor(level: Level, offset: Point) {
        this.level = level;
        this.offset = offset;

        for (const layer of BG_LAYERS) {
            if ("image" in layer) {
                this.layers.push(
                    new ImageLayer({
                        background: this,
                        image: layer.image,
                        scale: layer.scale,
                        offset: layer.offset,
                    })
                );
            }
            else {
                this.layers.push(
                    new FillLayer({
                        color: layer.color,
                    })
                );
            }
        }

        // Layers are drawn in list order (later layers on top).
        for (const layer of this.layers) {
            this.container.addChild(layer.container);
        }
    }

    update(dt: number) {
        for (const layer of this.layers) {
            layer.update(dt);
        }
    }

    updateGraphics() {
        for (const layer of this.layers) {
            layer.updateGraphics();
        }
    }

    static async preload() {
        const promises: Promise<any>[] = [];
        for (const layer of BG_LAYERS) {
            if ("image" in layer) {
                promises.push(Assets.load(imagePath(layer.image)));
            }
        }
        await Promise.all(promises);
    }
}

interface BackgroundLayer {
    container: Container;

    update(dt: number): void;

    updateGraphics(): void;
}

class FillLayer implements BackgroundLayer {
    container: Graphics;

    constructor({ color }: { color: string }) {
        // Big enough to cover the screen regardless of the aspect ratio.
        this.container = new Graphics()
            .rect(-10 * GAME_WIDTH, -10 * GAME_HEIGHT, 20 * GAME_WIDTH, 20 * GAME_HEIGHT)
            .fill(color);
    }

    update(_dt: number) {}

    updateGraphics() {}
}

class ImageLayer implements BackgroundLayer {
    background: Background;
    animCount = 0;
    image = "";
    scale = 1;

    offset: Point;

    container = new Container();
    sprite: Sprite;

    constructor({
        background,
        image,
        scale,
        offset = {x: 0, y: 0},
    }: {
        background: Background;
        image: string;
        scale: number;
        offset?: Point;
    }) {
        this.background = background;
        this.image = image;
        this.scale = scale;
        this.offset = offset;

        this.sprite = new Sprite(Assets.get<Texture>(imagePath(image)));
        this.sprite.scale.set(PHYSICS_SCALE);
        this.container.addChild(this.sprite);
    }

    update(dt: number) {
        this.animCount += dt;
    }

    updateGraphics() {
        // The layer moves with the camera, but scaled down for a parallax effect.
        this.background.level.camera.applyToPixi(this.container, this.scale);

        const texture = this.sprite.texture;
        this.sprite.x = physFromPx(this.offset.x - texture.width / 2 + this.scale * this.background.offset.x);
        this.sprite.y = physFromPx(this.offset.y - texture.height / 2 + this.scale * this.background.offset.y);
    }
}
