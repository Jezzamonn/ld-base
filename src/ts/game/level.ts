import { Point } from "../common";
import { TILE_SIZE, TILE_SIZE_PX } from "../constants";
import { Entity } from "./entity/entity";
import { Player } from "./entity/player";
import { Images } from "../lib/images";
import { Camera, FocusCamera } from "./camera";
import { Game } from "./game";
import { LevelInfo } from "./levels";
import { Tiles } from "./tile/tiles";
import { Background } from "./background";
import { BaseTile } from "./tile/base-layer";
import { ObjectTile } from "./tile/object-layer";
import { Container } from "pixi.js";

export interface LevelEntity {
    type: string;
    x: number;
    y: number;
}

export interface LevelData {
    tiles: number[][];
    objectTiles?: number[][];
    entities: LevelEntity[];
}

// Contains everything in one level, including the tiles and the entities.
export class Level {
    game: Game;
    entities: Entity[] = [];
    image: HTMLImageElement | undefined;
    levelInfo: LevelInfo

    camera: Camera = new FocusCamera();
    background: Background | undefined;

    tiles: Tiles = new Tiles(0, 0);

    start: Point = { x: 0, y: 0 };

    won = false;

    /**
     * Root display object for the level. Contains the background (which
     * positions itself) and the world container (which the camera moves).
     */
    container = new Container();
    /** Everything that exists in world space: tiles, entities, etc. */
    worldContainer = new Container();

    constructor(game: Game, levelInfo: LevelInfo) {
        this.game = game;
        this.levelInfo = levelInfo;
    }

    initFromImage() {
        const image = Images.images[this.levelInfo.name].image!;
        this.image = image;
        this.entities = [];
        this.tiles = new Tiles(image.width, image.height);

        this.background = new Background(this, {
            x: TILE_SIZE_PX * image.width / 2,
            y: TILE_SIZE_PX * image.height / 2,
        });

        // Draw the image to a canvas to get the pixels.
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0, image.width, image.height);

        // Read the pixels. White is empty, black is wall, and the red square is the starting position.
        const imageData = context.getImageData(0, 0, image.width, image.height);
        for (let y = 0; y < image.height; y++) {
            for (let x = 0; x < image.width; x++) {

                const basePos = this.tiles.getTileCoord({x, y}, { x: 0.5, y: 1 })

                const color = pixelToColorString(imageData, x, y);
                if (color === 'ffffff') {
                    // Don't need to do anything for empty tiles as they're the default.
                }
                else if (color === '000000') {
                    this.tiles.baseLayer.setTile({ x, y }, BaseTile.Wall, { allowGrow: false });
                }
                else if (color === 'aaaaaa') {
                    this.tiles.baseLayer.setTile({ x, y }, BaseTile.Background, { allowGrow: false });
                }
                else if (color === 'ffff00') {
                    this.tiles.objectLayer.setTile({ x, y }, ObjectTile.Goal, { allowGrow: false });
                    this.tiles.baseLayer.setTile({ x, y }, BaseTile.Unknown, { allowGrow: false });
                }
                else if (color === 'ff0000') {
                    this.start = basePos;
                    this.tiles.objectLayer.setTile({ x, y }, ObjectTile.Spawn, { allowGrow: false });
                    this.tiles.baseLayer.setTile({ x, y }, BaseTile.Unknown, { allowGrow: false });
                }
                else if (color === '0000ff') {
                    this.tiles.objectLayer.setTile({ x, y }, ObjectTile.Platform, { allowGrow: false });
                    this.tiles.baseLayer.setTile({ x, y }, BaseTile.Unknown, { allowGrow: false });
                }
                else {
                    console.log(`Unknown color: ${color} at ${x}, ${y}.`);
                }
            }
        }
        this.tiles.baseLayer.fillInUnknownTiles();

        this.initScene();

        // this.camera.target = () => ({x: this.start.x, y: this.start.y});

        this.spawnPlayer();
    }

    /** (Re)builds the display tree. Call after loading the tiles. */
    initScene() {
        this.container.removeChildren();
        this.worldContainer.removeChildren();

        if (this.background) {
            this.container.addChild(this.background.container);
        }
        this.container.addChild(this.worldContainer);

        this.tiles.addToScene(this.worldContainer);
        for (const entity of this.entities) {
            entity.addToScene(this.worldContainer);
        }
    }

    /** Adds an entity to the level, and its graphics to the scene. */
    addEntity<T extends Entity>(entity: T): T {
        this.entities.push(entity);
        entity.addToScene(this.worldContainer);
        return entity;
    }

    removeEntity(entity: Entity) {
        const index = this.entities.indexOf(entity);
        if (index >= 0) {
            this.entities.splice(index, 1);
        }
        entity.removeFromScene();
    }

    spawnPlayer(pos?: Point) {
        const player = new Player(this);
        player.midX = pos?.x ?? this.start.x;
        player.maxY = pos?.y ?? this.start.y;
        this.addEntity(player);

        if (this.camera instanceof FocusCamera) {
            this.camera.target = () => player.cameraFocus();
        }
    }

    initFromJson(data: LevelData) {
        const height = data.tiles.length;
        const width = height > 0 ? data.tiles[0].length : 0;

        for (const entity of this.entities) {
            entity.removeFromScene();
        }
        this.entities = [];

        this.tiles = new Tiles(width, height);
        this.background = new Background(this, {
            x: TILE_SIZE_PX * width / 2,
            y: TILE_SIZE_PX * height / 2,
        });

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                this.tiles.baseLayer.setTile({ x, y }, data.tiles[y][x], { allowGrow: false });
            }
        }
        this.tiles.baseLayer.fillInUnknownTiles();

        if (data.objectTiles) {
            for (let y = 0; y < Math.min(height, data.objectTiles.length); y++) {
                for (let x = 0; x < Math.min(width, data.objectTiles[y].length); x++) {
                    this.tiles.objectLayer.setTile({ x, y }, data.objectTiles[y][x], { allowGrow: false });
                }
            }
        }

        this.initScene();

        for (const entity of data.entities) {
            const pos = this.tiles.getTileCoord({ x: entity.x, y: entity.y }, { x: 0.5, y: 1 });
            if (entity.type === 'player') {
                this.start = pos;
                this.spawnPlayer(pos);
            }
        }
    }

    serializeToJson(): LevelData {
        const tiles: number[][] = [];
        for (let y = 0; y < this.tiles.baseLayer.h; y++) {
            tiles[y] = [];
            for (let x = 0; x < this.tiles.baseLayer.w; x++) {
                tiles[y][x] = this.tiles.baseLayer.getTile({ x: x - this.tiles.baseLayer.x, y: y - this.tiles.baseLayer.y });
            }
        }

        const objectTiles: number[][] = [];
        for (let y = 0; y < this.tiles.objectLayer.h; y++) {
            objectTiles[y] = [];
            for (let x = 0; x < this.tiles.objectLayer.w; x++) {
                objectTiles[y][x] = this.tiles.objectLayer.getTile({ x: x - this.tiles.objectLayer.x, y: y - this.tiles.objectLayer.y });
            }
        }

        const entities: LevelEntity[] = this.entities
            .filter(e => e.getEntityType() !== undefined)
            .map(e => ({
                type: e.getEntityType()!,
                x: Math.floor(e.midX / TILE_SIZE),
                y: Math.floor(e.maxY / TILE_SIZE)
            }));

        return { tiles, objectTiles, entities };
    }

    update(dt: number) {
        for (const entity of this.entities) {
            entity.update(dt);
        }

        for (let i = this.entities.length - 1; i >= 0; i--) {
            if (this.entities[i].done) {
                this.entities[i].removeFromScene();
                this.entities.splice(i, 1);
            }
        }

        this.background?.update(dt);
        this.tiles.update(dt);
        this.camera.update(dt);

        this.updateGraphics();
    }

    /** Syncs all the display objects with the current state of the level. */
    updateGraphics() {
        for (const entity of this.entities) {
            entity.updateGraphics();
        }
        this.camera.applyToPixi(this.worldContainer);
        this.background?.updateGraphics();
    }

    win() {
        this.won = true;
        this.game.win();
    }
}

function pixelToColorString(imageData: ImageData, x: number, y: number) {
    const i = (y * imageData.width + x) * 4;
    const r = imageData.data[i];
    const g = imageData.data[i + 1];
    const b = imageData.data[i + 2];
    return r.toString(16).padStart(2, '0') + g.toString(16).padStart(2, '0') + b.toString(16).padStart(2, '0');
}