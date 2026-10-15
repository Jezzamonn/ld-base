import { Container } from "pixi.js";
import { Point } from "../common";
import { lerp } from "../lib/util";
import { GAME_WIDTH, GAME_HEIGHT } from "../constants";

/** Where the camera's focus point appears on screen, as a ratio of the screen size. */
export const CAMERA_SCREEN_POS: Point = { x: 0.5, y: 0.6 };

export interface CameraBounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

export class Camera {
    curPos: Point | undefined;
    zoom: number = 1;
    bounds: CameraBounds | undefined;

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
            container.x = Math.round(-parallax * this.curPos.x * this.zoom);
            container.y = Math.round(-parallax * this.curPos.y * this.zoom);
            container.scale.set(this.zoom);
        }
    }
}

export class CenteredCamera extends Camera {
    update(_dt: number) {
        if (this.bounds) {
            this.curPos = {
                x: (this.bounds.minX + this.bounds.maxX) / 2,
                y: (this.bounds.minY + this.bounds.maxY) / 2
            };
        } else {
            this.curPos = { x: 0, y: 0 };
        }
    }
}

export class FocusCamera extends Camera {

    target: (() => { x: number, y: number }) | undefined;

    animCount = 0;

    constructor() {
        super();
    }

    update(dt: number) {
        this.animCount += dt;
        if (!this.target) {
            return;
        }
        const targetPos = this.target();
        if (!this.curPos) {
            this.curPos = { ...targetPos };
        } else {
            const updateSmoothness = 1 - Math.exp(-3 * dt);
            this.curPos.x = lerp(this.curPos.x, targetPos.x, updateSmoothness);
            this.curPos.y = lerp(this.curPos.y, targetPos.y, updateSmoothness);
        }

        if (this.bounds) {
            const centerX = 0.5;
            const centerY = 0.5;

            const viewportXOffset = (centerX * GAME_WIDTH) / this.zoom;
            const viewportYOffset = (centerY * GAME_HEIGHT) / this.zoom;

            const minClampX = this.bounds.minX + viewportXOffset;
            const maxClampX = this.bounds.maxX - (GAME_WIDTH / this.zoom - viewportXOffset);

            const minClampY = this.bounds.minY + viewportYOffset;
            const maxClampY = this.bounds.maxY - (GAME_HEIGHT / this.zoom - viewportYOffset);

            if (minClampX > maxClampX) {
                this.curPos.x = (this.bounds.minX + this.bounds.maxX) / 2 + (centerX - 0.5) * (GAME_WIDTH / this.zoom);
            } else {
                this.curPos.x = Math.max(minClampX, Math.min(maxClampX, this.curPos.x));
            }

            if (minClampY > maxClampY) {
                const midY = (this.bounds.minY + this.bounds.maxY) / 2;
                this.curPos.y = midY + (centerY - 0.5) * (GAME_HEIGHT / this.zoom);
            } else {
                this.curPos.y = Math.max(minClampY, Math.min(maxClampY, this.curPos.y));
            }
        }
    }
}