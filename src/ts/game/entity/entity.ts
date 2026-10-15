import { Dir, Dirs, FacingDir, Point } from "../../common";
import { FPS, PHYSICS_SCALE } from "../../constants";
import { Level } from "../level";
import { PhysicTile, TileSource } from "../tile/tiles";
import { Container, Graphics } from "pixi.js";

export class Entity {
    level: Level;

    x = 0;
    y = 0;
    w = 0;
    h = 0;
    dx = 0;
    dy = 0;
    // Copying some constants from my previous games. Might need tweaking.
    gravity = 0;
    xDampAmt = 0.125 * PHYSICS_SCALE * FPS * FPS;
    animCount = 0;
    facingDir = FacingDir.Right;
    canCollide = true;
    done = false;

    /** Color of the placeholder rectangle. Set to undefined if the entity has its own graphics. */
    debugColor: string | undefined = '#ff00ff'
    placeholderGraphics: Graphics | undefined;

    constructor(level: Level) {
        this.level = level;
    }

    update(dt: number) {
        this.animCount += dt;

        this.applyGravity(dt);
        this.dampX(dt);

        this.move(dt);
    }

    // Physics stuff
    applyGravity(dt: number) {
        this.dy += this.gravity * dt;
    }

    dampX(dt: number) {
        const damp = this.xDampAmt * dt;
        if (this.dx > damp) {
            this.dx -= damp;
        } else if (this.dx < -damp) {
            this.dx += damp;
        } else {
            this.dx = 0;
        }
    }

    move(dt: number) {
        this.moveX(dt);
        this.moveY(dt);
    }

    moveX(dt: number) {
        this.x += this.dx * dt;

        this.x = Math.round(this.x);

        if (!this.canCollide) {
            return;
        }

        if (this.dx < 0) {
            if (this.isTouchingTile(this.level.tiles, PhysicTile.Wall, { dir: Dir.Left })) {
                this.onLeftCollision();
            }
        } else if (this.dx > 0) {
            if (this.isTouchingTile(this.level.tiles, PhysicTile.Wall, { dir: Dir.Right })) {
                this.onRightCollision();
            }
        }
    }

    moveY(dt: number) {
        const wasTouchingOneWayPlatform = this.isTouchingTile(this.level.tiles, PhysicTile.OneWayPlatform, { dir: Dir.Down });
        this.y += this.dy * dt;

        this.y = Math.round(this.y);

        if (!this.canCollide) {
            return;
        }

        if (this.dy < 0) {
            if (this.isTouchingTile(this.level.tiles, PhysicTile.Wall, { dir: Dir.Up })) {
                this.onUpCollision();
            }
        } else if (this.dy > 0) {
            if (this.isTouchingTile(this.level.tiles, PhysicTile.Wall, { dir: Dir.Down })) {
                this.onDownCollision();
            }
            if (!wasTouchingOneWayPlatform && this.isTouchingTile(this.level.tiles, PhysicTile.OneWayPlatform, { dir: Dir.Down })) {
                this.onDownCollision();
            }
        }
    }

    onLeftCollision() {
        const resetPos = this.level.tiles.getTileCoordFromCoord({ x: this.minX, y: 0 }, { x: 1, y: 0});

        this.minX = resetPos.x + 1;
        this.dx = 0;
    }

    onRightCollision() {
        const resetPos = this.level.tiles.getTileCoordFromCoord({ x: this.maxX, y: 0 }, { x: 0, y: 0});

        this.maxX = resetPos.x - 1;
        this.dx = 0;
    }

    onUpCollision() {
        const resetPos = this.level.tiles.getTileCoordFromCoord({ x: 0, y: this.minY }, { x: 0, y: 1});

        this.minY = resetPos.y + 1;
        this.dy = 0;
    }

    onDownCollision() {
        const resetPos = this.level.tiles.getTileCoordFromCoord({ x: 0, y: this.maxY }, { x: 0, y: 0});

        this.maxY = resetPos.y - 1;
        this.dy = 0;
    }

    isTouchingTile<T extends number>(tileSource: TileSource<T>, tile: T | T[], { dir = undefined, offset = undefined } : { dir?: Dir, offset?: Point } = {}): boolean {
        if (!Array.isArray(tile)) {
            tile = [tile];
        }
        const corners = Dirs.cornersInDirection(dir);
        for (const corner of corners) {
            const x = this.x + corner.x * this.w + (offset?.x ?? 0);
            const y = this.y + corner.y * this.h + (offset?.y ?? 0);
            for (const t of tile) {
                if (tileSource.getTileAtCoord({x, y}) === t) {
                    return true;
                }
            }
        }
        return false
    }

    isStanding(): boolean {
        return this.isTouchingTile(this.level.tiles, [PhysicTile.Wall, PhysicTile.OneWayPlatform], { dir: Dir.Down, offset: { x: 0, y: 1 } }) &&
            !this.isTouchingTile(this.level.tiles, PhysicTile.OneWayPlatform, { dir: Dir.Down })
    }

    isTouchingEntity(other: Entity): boolean {
        return this.maxX > other.minX && this.minX < other.maxX && this.maxY > other.minY && this.minY < other.maxY;
    }

    /**
     * Adds this entity's display objects to the scene. Called by the level
     * when the entity is spawned. Subclasses should override this (and
     * removeFromScene) to add their own sprites.
     *
     * By default, draws a placeholder rectangle in debugColor.
     */
    addToScene(container: Container) {
        if (this.debugColor) {
            this.placeholderGraphics = new Graphics()
                .rect(0, 0, this.w, this.h)
                .fill(this.debugColor);
            container.addChild(this.placeholderGraphics);
        }
        this.updateGraphics();
    }

    /** Removes this entity's display objects from the scene. Called when the entity is removed. */
    removeFromScene() {
        this.placeholderGraphics?.removeFromParent();
    }

    /**
     * Syncs display objects (position, animation frame, etc.) with the
     * entity's state. Called by the level after every update.
     */
    updateGraphics() {
        if (this.placeholderGraphics) {
            this.placeholderGraphics.x = this.x;
            this.placeholderGraphics.y = this.y;
        }
    }

    //#region Getters and setter for min / mid / max.
    get minX() {
        return this.x;
    }
    get minY() {
        return this.y;
    }
    get maxX() {
        return this.x + this.w;
    }
    get maxY() {
        return this.y + this.h;
    }
    get midX() {
        return this.x + this.w / 2;
    }
    get midY() {
        return this.y + this.h / 2;
    }
    set minX(val: number) {
        this.x = val;
    }
    set minY(val: number) {
        this.y = val;
    }
    set maxX(val: number) {
        this.x = val - this.w;
    }
    set maxY(val: number) {
        this.y = val - this.h;
    }
    set midX(val: number) {
        this.x = val - this.w / 2;
    }
    set midY(val: number) {
        this.y = val - this.h / 2;
    }
    //#endregion
}