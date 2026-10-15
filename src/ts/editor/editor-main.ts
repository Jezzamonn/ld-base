import { Application, TextureSource } from "pixi.js";
import "../lib/aseprite-loader";
import { Editor } from "./editor";

async function main() {
    TextureSource.defaultOptions.scaleMode = 'nearest';

    const app = new Application();
    await app.init({
        width: window.innerWidth,
        height: window.innerHeight,
        backgroundColor: 0x1a1a1a,
        antialias: false,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
    });

    document.getElementById('app')?.appendChild(app.canvas);

    const editor = new Editor(app);
    await editor.start();

    window.addEventListener('resize', () => {
        app.renderer.resize(window.innerWidth, window.innerHeight);
        editor.resize();
    });
}

main().catch(console.error);
