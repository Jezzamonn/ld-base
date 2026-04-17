import '../scss/styles.scss';
import { Game } from "./game/game";

async function init() {
    await Game.preload()

    const game = new Game('.canvas');
    game.start();
}

window.addEventListener('load', init);