import { Point } from "../../common";
import { PHYSICS_SCALE, TILE_SIZE, TILE_SIZE_PX } from "../../constants";
import { Images } from "../../lib/images";
import { TileSource } from "./tiles";
import { Container, Sprite, Texture } from "pixi.js";

/**
 * How many extra tiles to render around each edge of the layer. getTile()
 * clamps to the edge of the layer, so this makes the edge tiles appear to
 * extend past the level boundary instead of showing empty space.
 */
const TILE_RENDER_PADDING = 16;

/**
 * 2D array of tiles.
 *
 * Rendering: the whole layer (plus padding) is drawn once to an offscreen
 * canvas, which is uploaded as a single texture and shown with one Pixi
 * Sprite. When tiles change, call `patchTiles` to redraw just those tiles.
 */
export class TileLayer<T extends number> implements TileSource<T> {
    tiles: T[][] = [];

    w = 0;
    h = 0;
    // Index of the top left corner of this level. Can move when the level grows.
    x = 0;
    y = 0;

    animCount = 0;

    image: HTMLImageElement | undefined;

    sprite: Sprite | undefined;
    private canvas: HTMLCanvasElement | undefined;
    private context: CanvasRenderingContext2D | undefined;
    private texture: Texture | undefined;

    constructor(w: number, h: number) {
        this.w = w;
        this.h = h;

        // Fill with the zero value.
        for (let y = 0; y < this.h; y++) {
            this.tiles[y] = [];

            for (let x = 0; x < this.w; x++) {
                this.tiles[y][x] = 0 as T;
            }
        }
    }

    update(dt: number) {
        this.animCount += dt;
    }

    addToScene(container: Container) {
        if (!this.sprite) {
            this.sprite = new Sprite();
            this.sprite.scale.set(PHYSICS_SCALE);
        }
        this.redraw();
        container.addChild(this.sprite);
    }

    removeFromScene() {
        this.sprite?.removeFromParent();
    }

    /** Redraws the whole layer. Call this after making lots of changes, or if the layer grew. */
    redraw() {
        if (!this.sprite || !this.loadImage()) {
            return;
        }

        const widthPx = (this.w + 2 * TILE_RENDER_PADDING) * TILE_SIZE_PX;
        const heightPx = (this.h + 2 * TILE_RENDER_PADDING) * TILE_SIZE_PX;

        if (!this.canvas || this.canvas.width !== widthPx || this.canvas.height !== heightPx) {
            this.canvas = document.createElement('canvas');
            this.canvas.width = widthPx;
            this.canvas.height = heightPx;
            this.context = this.canvas.getContext('2d')!;
            this.texture?.destroy();
            this.texture = undefined;
        }

        const context = this.context!;
        context.clearRect(0, 0, widthPx, heightPx);
        for (let y = this.minY - TILE_RENDER_PADDING; y <= this.maxY + TILE_RENDER_PADDING; y++) {
            for (let x = this.minX - TILE_RENDER_PADDING; x <= this.maxX + TILE_RENDER_PADDING; x++) {
                this.renderTile(context, { x, y }, this.canvasPos({ x, y }));
            }
        }

        if (!this.texture) {
            this.texture = Texture.from(this.canvas);
            this.texture.source.scaleMode = 'nearest';
        } else {
            this.texture.source.update();
        }

        this.sprite.texture = this.texture;
        this.sprite.x = (this.minX - TILE_RENDER_PADDING) * TILE_SIZE;
        this.sprite.y = (this.minY - TILE_RENDER_PADDING) * TILE_SIZE;
    }

    /**
     * Incrementally redraws only the changed tiles and their neighbours (as
     * rendering can depend on adjacent tiles), then re-uploads the texture.
     */
    patchTiles(changedPositions: Point[]) {
        if (!this.context || !this.texture) {
            this.redraw();
            return;
        }

        const toRedraw = new Map<string, Point>();
        for (const pos of changedPositions) {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const p = { x: pos.x + dx, y: pos.y + dy };
                    toRedraw.set(`${p.x},${p.y}`, p);
                }
            }
        }

        for (const p of toRedraw.values()) {
            const renderPos = this.canvasPos(p);
            this.context.clearRect(renderPos.x, renderPos.y, TILE_SIZE_PX, TILE_SIZE_PX);
            this.renderTile(this.context, p, renderPos);
        }

        this.texture.source.update();
    }

    /** Position of a tile within the offscreen canvas, in pixels. */
    private canvasPos(p: Point): Point {
        return {
            x: (p.x - this.minX + TILE_RENDER_PADDING) * TILE_SIZE_PX,
            y: (p.y - this.minY + TILE_RENDER_PADDING) * TILE_SIZE_PX,
        };
    }

    private loadImage(): boolean {
        if (!this.image) {
            const imageInfo = Images.images["tiles"];
            if (!imageInfo?.loaded) {
                return false;
            }
            this.image = imageInfo.image;
        }
        return true;
    }

    /**
     * Draws a single tile to the offscreen canvas.
     *
     * @param pos Tile coordinate.
     * @param renderPos Top left corner of where to draw the tile, in canvas pixels.
     */
    renderTile(
        _context: CanvasRenderingContext2D,
        _pos: Point,
        _renderPos: Point,
    ) {
        // Logic handled per layer.
    }

    drawTile(
        context: CanvasRenderingContext2D,
        {
            tilePos,
            renderPos,
        }: { tilePos: Point; renderPos: Point }
    ) {
        // Image must be loaded when this is called.
        context.drawImage(
            this.image!,
            tilePos.x * TILE_SIZE_PX,
            tilePos.y * TILE_SIZE_PX,
            TILE_SIZE_PX,
            TILE_SIZE_PX,
            renderPos.x,
            renderPos.y,
            TILE_SIZE_PX,
            TILE_SIZE_PX,
        );
    }

    drawQuarterTile(
        context: CanvasRenderingContext2D,
        {
            tilePos,
            subTilePos,
            renderPos,
        }: { tilePos: Point; subTilePos: Point; renderPos: Point }
    ) {
        // Image must be loaded when this is called.
        const halfTileSizePx = TILE_SIZE_PX / 2;
        context.drawImage(
            this.image!,
            tilePos.x * TILE_SIZE_PX + subTilePos.x * halfTileSizePx,
            tilePos.y * TILE_SIZE_PX + subTilePos.y * halfTileSizePx,
            halfTileSizePx,
            halfTileSizePx,
            renderPos.x + subTilePos.x * halfTileSizePx,
            renderPos.y + subTilePos.y * halfTileSizePx,
            halfTileSizePx,
            halfTileSizePx,
        );
    }

    setTile(p: Point, tile: T, {allowGrow = true} = {}) {
        // If out of bounds, extend the board!
        let y = p.y;
        while (allowGrow && y + this.y < 1) {
            this.tiles.unshift(this.tiles[0].slice())
            this.y++;
            this.h++;
        }
        while (allowGrow && y + this.y >= this.h - 1) {
            this.tiles.push(this.tiles[this.h - 1].slice())
            this.h++;
        }

        let x = p.x;
        while (allowGrow && x + this.x < 1) {
            for (let y = 0; y < this.h; y++) {
                this.tiles[y].unshift(this.tiles[y][0]);
            }
            this.x++;
            this.w++;
        }
        while (allowGrow && x + this.x >= this.w - 1) {
            for (let y = 0; y < this.h; y++) {
                this.tiles[y].push(this.tiles[y][this.w - 1]);
            }
            this.w++;
        }

        // Check if we're out of bounds, for when allowGrow is false.
        if (p.x + this.x < 0 || p.y + this.y < 0 || p.x + this.x >= this.w || p.y + this.y >= this.h) {
            throw new Error(`Tile out of bounds: ${p.x}, ${p.y}`);
        }

        this.tiles[p.y + this.y][p.x + this.x] = tile;
    }

    setTileAtCoord(p: Point, tile: T, {allowGrow = true} = {}) {
        this.setTile({
            x: Math.floor(p.x / TILE_SIZE),
            y: Math.floor(p.y / TILE_SIZE),
        }, tile, {allowGrow});
    }

    getTile(p: Point): T {
        let x = Math.min(Math.max(p.x + this.x, 0), this.w - 1);
        let y = Math.min(Math.max(p.y + this.y, 0), this.h - 1);
        return this.tiles[y][x];
    }

    getTileAtCoord(p: Point): T {
        return this.getTile({
            x: Math.floor(p.x / TILE_SIZE),
            y: Math.floor(p.y / TILE_SIZE),
        });
    }

    // Note: These are in tile coordinates (the same coordinates as getTile() takes).
    get minX() {
        return -this.x;
    }

    get minY() {
        return -this.y;
    }

    get maxX() {
        return this.w - this.x - 1;
    }

    get maxY() {
        return this.h - this.y - 1;
    }
}
