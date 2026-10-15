import { Point } from "../../common";
import { physFromPx, PHYSICS_SCALE } from "../../constants";
import { Level } from "../level";
import type { AsepriteAsset } from "../../lib/aseprite-loader";
import { Entity } from "./entity";
import { Assets, Container, Sprite as PixiSprite } from "pixi.js";

/**
 * An entity that just plays the 'idle' animation of a spritesheet, e.g. for
 * decorations or one-off effects. The spritesheet (sprites/[name].json) must
 * already be loaded.
 */
export class Sprite extends Entity {

    name = '';
    oneLoop = false;
    anchorRatios: Point;

    sprite = new PixiSprite();

    constructor(level: Level, name: string, { oneLoop = false, anchorRatios = { x: 0.5, y: 1 } } = {}) {
        super(level);

        this.name = name;
        this.oneLoop = oneLoop;
        this.anchorRatios = anchorRatios;
        this.debugColor = undefined;

        const firstFrame = this.asset.frameList[0];
        this.w = physFromPx(firstFrame.orig.width);
        this.h = physFromPx(firstFrame.orig.height);

        this.sprite.anchor.set(anchorRatios.x, anchorRatios.y);
        this.sprite.scale.set(PHYSICS_SCALE);
    }

    get asset(): AsepriteAsset {
        return Assets.get<AsepriteAsset>(`sprites/${this.name}.json`);
    }

    update(dt: number): void {
        super.update(dt);

        if (this.oneLoop && this.animCount >= this.asset.getAnimationLength('idle')) {
            this.done = true;
        }
    }

    addToScene(container: Container) {
        container.addChild(this.sprite);
        this.updateGraphics();
    }

    removeFromScene() {
        this.sprite.removeFromParent();
    }

    updateGraphics() {
        this.sprite.texture = this.asset.getFrameTexture('idle', this.animCount, !this.oneLoop);
        this.sprite.x = this.x + this.anchorRatios.x * this.w;
        this.sprite.y = this.y + this.anchorRatios.y * this.h;
    }
}