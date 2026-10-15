import { Point } from "../common";
import { Camera } from "../game/camera";

export class EditorCamera extends Camera {
    curPos: Point = { x: 0, y: 0 };

    constructor() {
        super();
    }

    override update(_dt: number) {
        // No automatic tracking
    }

    override applyToPixi(container: import("pixi.js").Container) {
        if (!this.curPos) return;

        const app = (container as any)._editorApp || (window as any).editor?.app;
        if (app) {
            container.x = Math.round(app.screen.width / 2 - this.curPos.x * container.scale.x);
            container.y = Math.round(app.screen.height / 2 - this.curPos.y * container.scale.y);
        } else {
            container.x = Math.round(-this.curPos.x);
            container.y = Math.round(-this.curPos.y);
        }
    }
}
