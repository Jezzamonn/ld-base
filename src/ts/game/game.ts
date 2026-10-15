import { GAME_HEIGHT_PX, GAME_WIDTH_PX, PHYSICS_SCALE, RESTART_KEYS, TIME_STEP } from "../constants";
import { Player } from "./entity/player";
import { ComboKeys, KeyboardKeys, NullKeys, RegularKeys } from "../lib/keys";
import { Sounds } from "../lib/sounds";
import { CAMERA_SCREEN_POS } from "./camera";
import { Level } from "./level";
import { Levels, LEVELS } from "./levels";
import { SFX } from "./sfx";
import { Tiles } from "./tile/tiles";
import { Background } from "./background";
import { TouchKeys } from "./touch-keys";
import { Application, Ticker } from "pixi.js";

export class Game {

    app: Application;

    /** Scale from physics units to CSS pixels. */
    scale = 1;

    simulatedTimeMs: number | undefined;

    levelIndex = 0;
    showingTitle = true;
    curLevel: Level | undefined;

    keys: RegularKeys;
    nullKeys = new NullKeys();

    constructor(app: Application) {
        this.app = app;

        this.keys = new ComboKeys(new KeyboardKeys(), new TouchKeys());

        Sounds.loadMuteState();
    }

    start(testMode = false) {
        this.keys.setUp();

        this.resize();
        if (!testMode) {
            window.addEventListener('resize', () => this.resize());

            // Whenever any touch event happens, try to enter fullscreen.
            window.addEventListener('touchstart', () => this.enterFullscreen());

            this.app.ticker.add(this.tick, this);
        }

        this.startLevel(0);
    }

    nextLevel() {
        this.startLevel((this.levelIndex + 1) % LEVELS.length);
    }

    prevLevel() {
        this.startLevel((this.levelIndex + LEVELS.length - 1) % LEVELS.length);
    }

    startLevel(levelIndex: number) {
        if (this.curLevel) {
            this.curLevel.container.removeFromParent();
            this.curLevel.container.destroy({ children: true });
        }

        this.levelIndex = levelIndex;
        const levelInfo = LEVELS[this.levelIndex];
        const level = new Level(this, levelInfo);
        level.initFromImage();
        this.curLevel = level;
        this.app.stage.addChild(level.container);

        // if (levelInfo.song) {
        //     Sounds.setSong(levelInfo.song);
        // }
    }

    win() {
        this.nextLevel();
    }

    /**
     * Called by Pixi's ticker every animation frame. Runs the game logic at a
     * fixed timestep; Pixi then renders the stage.
     */
    tick(_ticker: Ticker) {
        if (this.simulatedTimeMs == undefined) {
            this.simulatedTimeMs = Date.now();
        }

        let curTime = Date.now();
        let updateCount = 0;
        while (this.simulatedTimeMs < curTime) {
            this.update(TIME_STEP);

            this.simulatedTimeMs += 1000 * TIME_STEP;

            updateCount++;
            if (updateCount > 10) {
                this.simulatedTimeMs = curTime;
                break;
            }
        }
    }

    /** Used by tests to step the game manually. */
    advanceFrames(frames: number) {
        for (let i = 0; i < frames; i++) {
            this.update(TIME_STEP);
        }
        this.app.render();
    }

    handleInput() {
        if (this.keys.wasPressedThisFrame('KeyM')) {
            // Mute
            Sounds.toggleMute();
        }
        // Debug:
        if (this.keys.wasPressedThisFrame('Comma')) {
            this.prevLevel();
        }
        if (this.keys.wasPressedThisFrame('Period')) {
            this.nextLevel();
        }
        if (this.keys.anyWasPressedThisFrame(RESTART_KEYS)) {
            this.startLevel(this.levelIndex);
        }
    }

    update(dt: number) {
        try {
            this.handleInput();

            Sounds.update(dt);
            this.curLevel?.update(dt);

            this.keys.resetFrame();
        }
        catch (e) {
            console.error(e);
        }
    }

    resize() {
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        const pixelScale = window.devicePixelRatio || 1;

        this.app.renderer.resize(windowWidth, windowHeight);

        const xScale = windowWidth / GAME_WIDTH_PX;
        const yScale = windowHeight / GAME_HEIGHT_PX;

        // Math.min = scale to fit. Floor in device pixels so that game pixels
        // are always a whole number of device pixels.
        const pxScale = Math.floor(Math.min(xScale, yScale) * pixelScale);
        // The stage is in CSS pixels (Pixi handles the device pixel ratio).
        this.scale = pxScale / pixelScale / PHYSICS_SCALE;
        this.app.stage.scale.set(this.scale);

        // Put the origin at the camera's focus point, snapped to a device pixel.
        this.app.stage.x = Math.round(windowWidth * pixelScale * CAMERA_SCREEN_POS.x) / pixelScale;
        this.app.stage.y = Math.round(windowHeight * pixelScale * CAMERA_SCREEN_POS.y) / pixelScale;

        document.body.style.setProperty('--scale', `${pxScale / pixelScale}`);

        // Set HTML element size
        document.body.style.setProperty('--pageWidth', `${windowWidth}px`);
        document.body.style.setProperty('--pageHeight', `${windowHeight}px`);
    }

    enterFullscreen() {
        // If we're already fullscreen, don't do anything.
        if (document.fullscreenElement) {
            return;
        }

        const elem = document.documentElement;
        if (elem.requestFullscreen) {
            elem.requestFullscreen();
        }
    }

    static async preload() {
        await Promise.all([
            Levels.preload(),
            Tiles.preload(),
            Player.preload(),
            Background.preload(),
        ]);
        SFX.preload();
    }
}