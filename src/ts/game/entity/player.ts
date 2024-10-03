import { Dir, FacingDir, Point } from "../../common";
import { FPS, JUMP_KEYS, LEFT_KEYS, physFromPx, PHYSICS_SCALE, RIGHT_KEYS } from "../../constants";
import { Aseprite } from "../../lib/aseprite";
import { NullKeys } from "../../lib/keys";
import { Level } from "../level";
import { SFX } from "../sfx";
import { ObjectTile } from "../tile/object-layer";
import { PhysicTile } from "../tile/tiles";
import { Entity } from "./entity";

const imageName = 'player';

// How long the player gets to jump after falling off a platform.
// 0.1 seems a little too lenient, but whatever :)
const COYOTE_TIME_SECS = 0.1;
const BUFFER_JUMP_TIME_SECS = 0.1;

export class Player extends Entity {

    runSpeed = 1.5 * PHYSICS_SCALE * FPS;
    jumpSpeed = 3 * PHYSICS_SCALE * FPS;
    wallSlideSpeed = 1 * PHYSICS_SCALE * FPS;
    maxFallSpeed = 3 * PHYSICS_SCALE * FPS;

    groundAccel = 0.25 * PHYSICS_SCALE * FPS * FPS / 2;
    airAccel = 0.125 * PHYSICS_SCALE * FPS * FPS / 2;

    controlledByPlayer = true;

    // Used to track Coyote Time.
    onGroundCount = 0;
    onLeftWallCount = 0;
    onRightWallCount = 0;

    bufferedJumpCount = 0;

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
        let facingDir = this.facingDir;

        // TODO: This logic will probably need to be tweaked for whatever character this game has.
        if (!this.isStanding()) {
            if (this.isAgainstLeftWall()) {
                animName = 'wall-slide'
                facingDir = FacingDir.Right;
            }
            else if (this.isAgainstRightWall()) {
                animName = 'wall-slide'
                facingDir = FacingDir.Left;
            }
            else {
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
            }
        } else if (Math.abs(this.dx) > 0.01) {
            animName = 'run';
        }
        return { animName, loop, facingDir }
    }

    render(context: CanvasRenderingContext2D) {
        // super.render(context);

        const {animName, loop, facingDir} = this.getAnimationName();

        Aseprite.drawAnimation({
            context,
            image: "player",
            animationName: animName,
            time: this.animCount,
            position: {x: this.midX, y: this.maxY},
            scale: PHYSICS_SCALE,
            anchorRatios: {x: 0.5, y: 1},
            // filter: filter,
            flippedX: facingDir == FacingDir.Left,
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
        // Reset coyote time variables.
        this.onGroundCount = 0;
        this.onLeftWallCount = 0;
        this.onRightWallCount = 0;
        this.bufferedJumpCount = 0;
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

        if (this.onGroundCount > 0) {
            this.onGroundCount -= dt;
        }
        if (this.onLeftWallCount > 0) {
            this.onLeftWallCount -= dt;
        }
        if (this.onRightWallCount > 0) {
            this.onRightWallCount -= dt;
        }
        if (this.bufferedJumpCount > 0) {
            this.bufferedJumpCount -= dt;
        }

        if (this.isStanding()) {
            this.onGroundCount = COYOTE_TIME_SECS;
        }
        if (this.isAgainstLeftWall()) {
            this.onLeftWallCount = COYOTE_TIME_SECS;
        }
        if (this.isAgainstRightWall()) {
            this.onRightWallCount = COYOTE_TIME_SECS;
        }

        // TODO: Maybe checking what animation frame we're add and playing a sound effect (e.g. if it's a footstep frame.)

        let keys = this.controlledByPlayer ? this.level.game.keys : new NullKeys();

        if (keys.anyWasPressedThisFrame(JUMP_KEYS)) {
            this.bufferedJumpCount = BUFFER_JUMP_TIME_SECS;
        }

        if (this.bufferedJumpCount > 0) {
            if (this.onGroundCount > 0) {
                this.jump();
            }
            else if (this.onLeftWallCount > 0) {
                // Wall jump! To da right
                this.dx = this.runSpeed;
                this.facingDir = FacingDir.Right;
                this.jump();
            }
            else if (this.onRightWallCount > 0) {
                this.dx = -this.runSpeed;
                this.facingDir = FacingDir.Left;
                this.jump();
            }
            // Can't jump, sadly.
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
        if (this.isAgainstLeftWall() || this.isAgainstRightWall()) {
            if (this.dy > this.wallSlideSpeed) {
                const diff = this.dy - this.wallSlideSpeed;
                this.dy -= 0.5 * diff;
            }
        }
        else {
            if (this.dy > this.maxFallSpeed) {
                const diff = this.dy - this.maxFallSpeed;
                this.dy -= 0.5 * diff;
            }
        }
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

    isAgainstLeftWall() {
        return this.isTouchingTile(this.level.tiles, [PhysicTile.Wall], { dir: Dir.Left, offset: { x: -1, y: 0 } });
    }

    isAgainstRightWall() {
        return this.isTouchingTile(this.level.tiles, [PhysicTile.Wall], { dir: Dir.Right, offset: { x: 1, y: 0 } });
    }

    static async preload() {
        await Aseprite.loadImage({name: imageName, basePath: 'sprites'});
    }
}