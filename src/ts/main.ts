import { Game } from "./game/game";
import { MockKeys } from "./lib/keys";

async function init() {
    await Game.preload()

    const urlParams = new URLSearchParams(window.location.search);
    const testMode = urlParams.has('test');

    const game = new Game('.canvas');
    if (testMode) {
        game.manualTime = true;
        game.keys = new MockKeys();
        (window as any).game = game;
        (window as any).advanceFrames = (n: number) => game.advanceFrames(n);
    }
    game.start();
}

window.addEventListener('load', init);