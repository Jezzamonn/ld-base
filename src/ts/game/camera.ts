import { Container } from "pixi.js";
import { Point } from "../common";
import { lerp } from "../lib/util";

/** Where the camera's focus point appears on screen, as a ratio of the screen size. */
export const CAMERA_SCREEN_POS: Point = { x: 0.5, y: 0.6 };

export class Camera {
    curPos: Point | undefined;

    constructor() {
    }

    update(_dt: number) {}

    /**
     * Positions a container so that curPos appears at the camera's focus point.
     *
     * @param parallax How much the container moves relative to the camera. 1
     *     is normal, smaller values make things appear further away.
     */
    applyToPixi(container: Container, parallax = 1) {
        if (this.curPos) {
            container.x = Math.round(-parallax * this.curPos.x);
            container.y = Math.round(-parallax * this.curPos.y);
        }
    }
}

export class FocusCamera extends Camera {

    target: (() => { x: number, y: number }) | undefined;

    constructor() {
        super();
    }

    update(dt: number) {
        if (!this.target) {
            return;
        }
        const targetPos = this.target();
        if (!this.curPos) {
            this.curPos = { ...targetPos };
            return;
        }

        const updateSmoothness = 1 - Math.exp(-3 * dt);
        this.curPos.x = lerp(this.curPos.x, targetPos.x, updateSmoothness);
        this.curPos.y = lerp(this.curPos.y, targetPos.y, updateSmoothness);
    }
}