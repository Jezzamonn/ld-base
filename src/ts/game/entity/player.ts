import { FacingDir, Point } from "../../common";
import { FPS, JUMP_KEYS, LEFT_KEYS, physFromPx, PHYSICS_SCALE, RIGHT_KEYS } from "../../constants";
import { Aseprite } from "../../lib/aseprite";
import { NullKeys } from "../../lib/keys";
import { Level } from "../level";
import { SFX } from "../sfx";
import { ObjectTile } from "../tile/object-layer";
import { Entity } from "./entity";

const imageName = 'player';

export class Player extends Entity {

    runSpeed = 1.5 * PHYSICS_SCALE * FPS;
    jumpSpeed = 3 * PHYSICS_SCALE * FPS;

    groundAccel = 0.25 * PHYSICS_SCALE * FPS * FPS / 2;
    airAccel = 0.125 * PHYSICS_SCALE * FPS * FPS / 2;

    controlledByPlayer = true;

    constructor(level: Level) {
        super(level);
        // TODO: Set w and h
        this.w = physFromPx(6);
        this.h = physFromPx(10);
        // TODO: Tweak gravity? This was from Teeniest Seed.
        this.gravity = 0.13 * PHYSICS_SCALE * FPS * FPS;
    }

    getAnimationName() {
        let animName = 'idle';
        let loop = true;

        // TODO: This logic will probably need to be tweaked for whatever character this game has.
        if (!this.isStanding()) {
            animName = 'jump';
            if (this.dy < -0.3 * this.jumpSpeed) {
                animName += '-up';
            }
            else if (this.dy > 0.3 * this.jumpSpeed) {
                animName += '-down';
            }
            else {
                animName += '-mid';
            }
        } else if (Math.abs(this.dx) > 0.01) {
            animName = 'run';
        }
        return { animName, loop }
    }

    render(context: CanvasRenderingContext2D) {
        // super.render(context);

        const {animName, loop} = this.getAnimationName();

        Aseprite.drawAnimation({
            context,
            image: "player",
            animationName: animName,
            time: this.animCount,
            position: {x: this.midX, y: this.maxY},
            scale: PHYSICS_SCALE,
            anchorRatios: {x: 0.5, y: 1},
            // filter: filter,
            flippedX: this.facingDir == FacingDir.Left,
            loop,
        });
    }

    cameraFocus(): Point {
        // TODO: This made people dizzy, should adjust it / change the speed the camera moves.
        const facingMult = this.facingDir == FacingDir.Right ? 1 : -1;
        const facingOffset = facingMult * physFromPx(30) * 0; // disable for now.
        return { x: this.midX + facingOffset, y: this.maxY };
    }

    jump() {
        this.dy = -this.jumpSpeed;
        SFX.play('jump');
    }

    dampX(dt: number): void {
        this.xDampAmt = this.isStanding() ? this.groundAccel : this.airAccel;
        super.dampX(dt);
    }

    moveLeft(dt: number) {
        const accel = this.isStanding() ? this.groundAccel : this.airAccel;
        this.dx -= accel * dt;
        if (this.dx < -this.runSpeed) {
            this.dx = -this.runSpeed;
        }

        this.facingDir = FacingDir.Left;
    }

    moveRight(dt: number) {
        const accel = this.isStanding() ? this.groundAccel : this.airAccel;
        this.dx += accel * dt;
        if (this.dx > this.runSpeed) {
            this.dx = this.runSpeed;
        }

        this.facingDir = FacingDir.Right;
    }

    update(dt: number) {
        this.animCount += dt;

        // TODO: Maybe checking what animation frame we're add and playing a sound effect (e.g. if it's a footstep frame.)

        let keys = this.controlledByPlayer ? this.level.game.keys : new NullKeys();

        if (this.isStanding() && keys.anyWasPressedThisFrame(JUMP_KEYS)) {
            this.jump();
        }

        const left = keys.anyIsPressed(LEFT_KEYS);
        const right = keys.anyIsPressed(RIGHT_KEYS);
        if (left && !right) {
            this.moveLeft(dt);
        }
        else if (right && !left) {
            this.moveRight(dt);
        }
        else {
            this.dampX(dt);
        }

        this.applyGravity(dt);
        this.moveX(dt);
        this.moveY(dt);

        // Checking for winning
        if (this.isTouchingTile(this.level.tiles.objectLayer, ObjectTile.Goal)) {
            this.level.win();
        }
    }

    applyGravity(dt: number): void {
        // if (!this.level.game.keys.anyIsPressed(JUMP_KEYS)) {
        //     this.dy += 2 * this.gravity * dt;
        //     return;
        // }
        this.dy += this.gravity * dt;
    }

    onDownCollision() {
        if (this.dy > 0.5 * this.jumpSpeed) {
            SFX.play('land');
        }
        super.onDownCollision();
    }

    static async preload() {
        await Aseprite.loadImage({name: imageName, basePath: 'sprites'});
    }
}