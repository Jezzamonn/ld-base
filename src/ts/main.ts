import { Application, TextureSource } from "pixi.js";
import { Game } from "./game/game";
import { MockKeys } from "./lib/keys";
import "./lib/aseprite-loader"; // Registers the Aseprite loader with Pixi's Assets.

async function init() {
    // Keep those pixels sharp!
    TextureSource.defaultOptions.scaleMode = 'nearest';

    const app = new Application();
    await app.init({
        canvas: document.querySelector<HTMLCanvasElement>('.canvas')!,
        width: window.innerWidth,
        height: window.innerHeight,
        background: '#000000',
        antialias: false,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
    });

    await Game.preload()

    const urlParams = new URLSearchParams(window.location.search);
    const testMode = urlParams.has('test');

    const game = new Game(app);
    if (testMode) {
        game.keys = new MockKeys();
        (window as any).game = game;
        (window as any).advanceFrames = (n: number) => game.advanceFrames(n);
    }
    game.start(testMode);
}

window.addEventListener('load', init);