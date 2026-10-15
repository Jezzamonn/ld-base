import { Application, Container, Graphics, Rectangle, FederatedPointerEvent } from "pixi.js";
import { Level } from "../game/level";
import { LEVELS } from "../game/levels";
import { TILE_SIZE } from "../constants";
import { BaseTile } from "../game/tile/base-layer";
import { ObjectTile } from "../game/tile/object-layer";
import { Game } from "../game/game";
import { Point } from "../common";
import { EditorCamera } from "./camera";

const DB_NAME = 'ld_editor_db';
const STORE_NAME = 'file_handles';
const LAST_FILE_KEY = 'last_opened_file';

function setLastFileHandle(handle: FileSystemFileHandle): Promise<void> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
        req.onsuccess = () => {
            const tx = req.result.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).put(handle, LAST_FILE_KEY);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
    });
}

function getLastFileHandle(): Promise<FileSystemFileHandle | undefined> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
        req.onsuccess = () => {
            if (!req.result.objectStoreNames.contains(STORE_NAME)) {
                resolve(undefined);
                return;
            }
            const tx = req.result.transaction(STORE_NAME, 'readonly');
            const getReq = tx.objectStore(STORE_NAME).get(LAST_FILE_KEY);
            getReq.onsuccess = () => resolve(getReq.result);
            getReq.onerror = () => reject(getReq.error);
        };
        req.onerror = () => reject(req.error);
    });
}

export type EditorTool = 'draw' | 'fill' | 'eyedrop' | 'pan' | 'select';

interface ClipboardData {
    w: number;
    h: number;
    baseTiles: BaseTile[][];
    objectTiles: ObjectTile[][];
    entities: Array<{ type: string; relX: number; relY: number }>;
}

export type EditorLayer = 'base' | 'object' | 'entity';
export type SelectedType = 
    | { type: 'base', value: BaseTile }
    | { type: 'object', value: ObjectTile }
    | { type: 'entity', value: string };

export class Editor {
    app: Application;
    level!: Level;

    currentTool: EditorTool = 'draw';
    currentLayer: EditorLayer = 'base';
    selection: SelectedType = { type: 'base', value: BaseTile.Wall };

    hoverBox = new Graphics();
    levelBackground = new Graphics();
    editorOverlay = new Container();

    isPointerDown = false;
    isModified = false;
    fileHandle: FileSystemFileHandle | null = null;
    isSpaceDown = false;
    lastPanPos: Point | null = null;
    savedTool: EditorTool | null = null;
    activeKeys: Set<string> = new Set();

    brushSize: number = 1;
    shiftLineAnchor: Point | null = null;

    undoStack: ReturnType<Level['serializeToJson']>[] = [];

    selectionStart: Point | null = null;
    selectionRect: { x: number; y: number; w: number; h: number } | null = null;
    clipboard: ClipboardData | null = null;
    isPasting = false;
    pastePos: Point = { x: 0, y: 0 };
    selectionGraphics = new Graphics();
    pasteGraphics = new Graphics();

    zoom: number = 1.0;
    readonly BASE_SCALE = 0.125;
    readonly MIN_ZOOM = 0.5;
    readonly MAX_ZOOM = 8.0;

    constructor(app: Application) {
        this.app = app;
        (window as any).editor = this;
    }

    async start() {
        await Game.preload();

        const mockGame = {
            app: this.app,
            win: () => console.log('Win!'),
            nextLevel: () => {},
            prevLevel: () => {},
            startLevel: () => {},
        } as unknown as Game;

        this.level = new Level(mockGame, LEVELS[0]);
        this.level.camera = new EditorCamera();

        this.app.stage.addChild(this.level.container);
        this.level.container.addChildAt(this.levelBackground, 0);
        this.app.stage.addChild(this.editorOverlay);
        this.editorOverlay.addChild(this.hoverBox);
        this.editorOverlay.addChild(this.selectionGraphics);
        this.editorOverlay.addChild(this.pasteGraphics);

        this.resetLevel();

        let loadedFromStorage = false;
        try {
            const handle = await getLastFileHandle();
            if (handle) {
                if ((await (handle as any).queryPermission({ mode: 'read' })) === 'granted') {
                    const file = await handle.getFile();
                    const text = await file.text();
                    const json = JSON.parse(text);
                    this.level.initFromJson(json);
                    if (this.level.background) this.level.background.container.removeFromParent();
                    this.renderLevelBounds();
                    this.fileHandle = handle;
                    this.isModified = false;
                    this.undoStack = [];
                    loadedFromStorage = true;
                }
            }
        } catch (err) {
            console.error('Failed to auto-load last file', err);
        }

        if (!loadedFromStorage) {
            try {
                const res = await fetch('/default-level.json');
                if (res.ok) {
                    const json = await res.json();
                    this.level.initFromJson(json);
                    if (this.level.background) this.level.background.container.removeFromParent();
                    this.renderLevelBounds();
                    this.isModified = false;
                    this.undoStack = [];
                }
            } catch (err) {
                console.error('Failed to load default level', err);
            }
        }

        this.setupInteraction();
        this.setupKeyboard();
        this.setupButtons();
        this.setupZoom();
        this.resize();

        this.app.ticker.add((ticker) => {
            const dt = ticker.deltaTime / 60;

            const isInputFocused = ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName || '');
            const editorCam = this.level.camera as EditorCamera;
            if (!isInputFocused && editorCam.curPos) {
                const panVelocity = TILE_SIZE * 15;
                let dx = 0;
                let dy = 0;

                if (this.activeKeys.has('ArrowLeft')) dx -= 1;
                if (this.activeKeys.has('ArrowRight')) dx += 1;
                if (this.activeKeys.has('ArrowUp')) dy -= 1;
                if (this.activeKeys.has('ArrowDown')) dy += 1;

                if (dx !== 0 || dy !== 0) {
                    const len = Math.sqrt(dx * dx + dy * dy);
                    editorCam.curPos.x += (dx / len) * panVelocity * dt;
                    editorCam.curPos.y += (dy / len) * panVelocity * dt;
                }
            }

            this.level.camera.update(1/60);
            if (editorCam.curPos) {
                this.level.camera.applyToPixi(this.level.container);
                this.updateHoverAfterPan();
            }
        });

        this.setupTouch();
        this.setupUIListeners();
        this.updateUI();
    }

    resetLevel() {
        const width = 40;
        const height = 30;

        (this.level.camera as EditorCamera).curPos = {
            x: (width * TILE_SIZE) / 2,
            y: (height * TILE_SIZE) / 2
        };

        const tiles = Array(height).fill(0).map(() => Array(width).fill(BaseTile.Empty));
        for (let x = 0; x < width; x++) {
            tiles[height - 1][x] = BaseTile.Wall;
            tiles[0][x] = BaseTile.Wall;
        }
        for (let y = 0; y < height; y++) {
            tiles[y][0] = BaseTile.Wall;
            tiles[y][width - 1] = BaseTile.Wall;
        }

        const objectTiles = Array(height).fill(0).map(() => Array(width).fill(ObjectTile.Empty));

        this.level.initFromJson({
            tiles,
            objectTiles,
            entities: [{ type: 'player', x: 5, y: height - 2 }]
        });

        if (this.level.background) {
            this.level.background.container.removeFromParent();
        }

        this.isModified = false;
        this.fileHandle = null;
        this.renderLevelBounds();
        this.updateUI();
    }

    setupUIListeners() {
        const brushEl = document.getElementById('brush-size') as HTMLSelectElement;
        if (brushEl) {
            brushEl.addEventListener('change', () => {
                this.brushSize = parseInt(brushEl.value);
            });
        }

        document.getElementById('btn-resize')?.addEventListener('click', () => {
            const wEl = document.getElementById('level-width') as HTMLInputElement;
            const hEl = document.getElementById('level-height') as HTMLInputElement;
            const newW = Math.max(1, parseInt(wEl.value) || this.level.tiles.baseLayer.w);
            const newH = Math.max(1, parseInt(hEl.value) || this.level.tiles.baseLayer.h);
            this.resizeLevel(newW, newH);
        });

        const selEl = document.getElementById('current-selection') as HTMLSelectElement;
        if (selEl) {
            selEl.addEventListener('change', () => {
                const parts = selEl.value.split(':');
                const type = parts[0];
                const value = parts[1];

                if (type === 'base') {
                    this.setSelection({ type: 'base', value: parseInt(value) as BaseTile });
                } else if (type === 'object') {
                    this.setSelection({ type: 'object', value: parseInt(value) as ObjectTile });
                } else if (type === 'entity') {
                    this.setSelection({ type: 'entity', value: value });
                }
                this.setTool('draw');
            });
        }
    }

    setupInteraction() {
        this.app.stage.eventMode = 'static';
        this.app.stage.hitArea = new Rectangle(-100000, -100000, 200000, 200000);

        this.app.stage.on('pointerdown', (e) => {
            // Middle click — start panning
            if (e.button === 1) {
                this.lastPanPos = { x: e.global.x, y: e.global.y };
                return;
            }

            // Right click — eyedrop on active layer
            if (e.button === 2) {
                const pos = this.getMouseTilePos(e);
                if (pos.x >= 0 && pos.y >= 0 && pos.x < this.level.tiles.baseLayer.w && pos.y < this.level.tiles.baseLayer.h) {
                    this.applyEyedrop(pos);
                }
                return;
            }

            // Left click
            if (e.button !== 0) return;
            this.lastDrawTilePos = null;

            if (this.isPasting) {
                this.commitPaste(this.pastePos);
                return;
            }

            this.isPointerDown = true;

            if (this.isSpaceDown) {
                this.lastPanPos = { x: e.global.x, y: e.global.y };
            } else if (this.currentTool === 'select') {
                const pos = this.getMouseTilePos(e);
                this.selectionStart = pos;
                this.selectionRect = null;
                this.renderSelectionRect(pos, pos);
            } else {
                if (this.currentTool === 'draw' || this.currentTool === 'fill') {
                    this.pushUndo();
                }
                this.handlePointerAction(e);
            }
        });

        this.app.stage.on('pointermove', (e) => {
            const isPanning = (e.buttons & 4) !== 0
                || (this.isSpaceDown && this.isPointerDown);

            const cam = this.level.camera as EditorCamera;
            if (isPanning && this.lastPanPos) {
                const dx = e.global.x - this.lastPanPos.x;
                const dy = e.global.y - this.lastPanPos.y;

                if (cam.curPos) {
                    cam.curPos.x -= dx / this.level.container.scale.x;
                    cam.curPos.y -= dy / this.level.container.scale.y;
                }

                this.lastPanPos = { x: e.global.x, y: e.global.y };
            } else {
                this.lastPanPos = null;
                const pos = this.getMouseTilePos(e);

                if (this.isPasting) {
                    this.pastePos = pos;
                    this.updateHover(e);
                    this.renderPastePreview(pos);
                } else if (this.currentTool === 'select' && this.isPointerDown && this.selectionStart) {
                    this.renderSelectionRect(this.selectionStart, pos);
                } else {
                    this.updateHover(e);
                    if (this.isPointerDown) {
                        this.handlePointerAction(e);
                    }
                }
            }
        });

        this.app.stage.on('pointerup', (e) => {
            if (e.button === 0) {
                if (this.currentTool === 'select' && this.selectionStart) {
                    const pos = this.getMouseTilePos(e);
                    this.selectionRect = this.calcSelectionRect(this.selectionStart, pos);
                    this.selectionStart = null;
                    this.renderSelectionRect(
                        { x: this.selectionRect.x, y: this.selectionRect.y },
                        { x: this.selectionRect.x + this.selectionRect.w - 1, y: this.selectionRect.y + this.selectionRect.h - 1 }
                    );
                }
                if (this.currentTool === 'draw' && this.lastDrawTilePos) {
                    this.shiftLineAnchor = { ...this.lastDrawTilePos };
                }
                this.isPointerDown = false;
            }
            if (e.button === 1) this.lastPanPos = null;
        });

        this.app.stage.on('pointerupoutside', () => {
            this.isPointerDown = false;
            this.lastPanPos = null;
        });
    }

    private _lastTouchMid: { x: number; y: number } | null = null;
    private _lastTouchDist: number | null = null;

    setupTouch() {
        const canvas = this.app.canvas;

        const getTouches = (e: TouchEvent) => Array.from(e.touches);

        const midpoint = (a: Touch, b: Touch) => ({
            x: (a.clientX + b.clientX) / 2,
            y: (a.clientY + b.clientY) / 2,
        });

        const distance = (a: Touch, b: Touch) =>
            Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

        const cam = this.level.camera as EditorCamera;

        canvas.addEventListener('touchstart', (e: TouchEvent) => {
            if (e.touches.length === 2) {
                e.preventDefault();
                const [a, b] = getTouches(e);
                this._lastTouchMid = midpoint(a, b);
                this._lastTouchDist = distance(a, b);
            }
        }, { passive: false });

        canvas.addEventListener('touchmove', (e: TouchEvent) => {
            if (e.touches.length !== 2) {
                this._lastTouchMid = null;
                this._lastTouchDist = null;
                return;
            }
            e.preventDefault();

            const [a, b] = getTouches(e);
            const newMid = midpoint(a, b);
            const newDist = distance(a, b);
            const rect = canvas.getBoundingClientRect();

            if (this._lastTouchMid && this._lastTouchDist) {
                const dx = newMid.x - this._lastTouchMid.x;
                const dy = newMid.y - this._lastTouchMid.y;
                if (cam.curPos) {
                    cam.curPos.x -= dx / this.level.container.scale.x;
                    cam.curPos.y -= dy / this.level.container.scale.y;
                }

                const ratio = newDist / this._lastTouchDist;
                const newZoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, this.zoom * ratio));
                if (newZoom !== this.zoom) {
                    const pinchScreenX = newMid.x - rect.left;
                    const pinchScreenY = newMid.y - rect.top;
                    const oldScale = this.BASE_SCALE * this.zoom;
                    const worldX = (pinchScreenX - this.level.container.x) / oldScale;
                    const worldY = (pinchScreenY - this.level.container.y) / oldScale;

                    this.zoom = newZoom;
                    const newScale = this.BASE_SCALE * this.zoom;

                    if (cam.curPos) {
                        cam.curPos.x = (this.app.screen.width / 2 - pinchScreenX + worldX * newScale) / newScale;
                        cam.curPos.y = (this.app.screen.height / 2 - pinchScreenY + worldY * newScale) / newScale;
                    }
                    this.level.container.scale.set(newScale);
                    this.updateHoverAfterPan();
                }
            }

            this._lastTouchMid = newMid;
            this._lastTouchDist = newDist;
        }, { passive: false });

        canvas.addEventListener('touchend', () => {
            this._lastTouchMid = null;
            this._lastTouchDist = null;
        });

        canvas.addEventListener('touchcancel', () => {
            this._lastTouchMid = null;
            this._lastTouchDist = null;
        });
    }

    setupZoom() {
        this.app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        this.app.canvas.addEventListener('wheel', (e: WheelEvent) => {
            e.preventDefault();
            const cam = this.level.camera as EditorCamera;

            if (e.ctrlKey) {
                const zoomFactor = e.deltaY < 0 ? 1.05 : 1 / 1.05;
                const newZoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, this.zoom * zoomFactor));
                if (newZoom === this.zoom) return;

                const mouseScreen = { x: e.offsetX, y: e.offsetY };
                const oldScale = this.BASE_SCALE * this.zoom;

                const worldX = (mouseScreen.x - this.level.container.x) / oldScale;
                const worldY = (mouseScreen.y - this.level.container.y) / oldScale;

                this.zoom = newZoom;
                const newScale = this.BASE_SCALE * this.zoom;

                if (cam.curPos) {
                    cam.curPos.x = (this.app.screen.width / 2 - mouseScreen.x + worldX * newScale) / newScale;
                    cam.curPos.y = (this.app.screen.height / 2 - mouseScreen.y + worldY * newScale) / newScale;
                }

                this.level.container.scale.set(newScale);
                this.updateHoverAfterPan();
            } else {
                if (cam.curPos) {
                    cam.curPos.x += e.deltaX / this.level.container.scale.x;
                    cam.curPos.y += e.deltaY / this.level.container.scale.y;
                }
                this.updateHoverAfterPan();
            }
        }, { passive: false });
    }

    getMouseTilePos(e: FederatedPointerEvent): Point {
        const local = this.level.container.toLocal(e.global);
        return {
            x: Math.floor(local.x / TILE_SIZE),
            y: Math.floor(local.y / TILE_SIZE)
        };
    }

    brushOffset(): number {
        return -Math.floor((this.brushSize - 1) / 2);
    }

    updateHover(e: FederatedPointerEvent) {
        if (this.currentTool === 'select') {
            this.hoverBox.clear();
            return;
        }
        const pos = this.getMouseTilePos(e);

        const isShift = this.activeKeys.has('ShiftLeft') || this.activeKeys.has('ShiftRight');
        if (this.currentTool === 'draw' && isShift && this.shiftLineAnchor && !this.isPointerDown) {
            const offset = this.brushOffset();
            this.hoverBox.clear();
            for (const p of this.lineTiles(this.shiftLineAnchor, pos)) {
                this.hoverBox.rect(
                    (p.x + offset) * TILE_SIZE,
                    (p.y + offset) * TILE_SIZE,
                    TILE_SIZE * this.brushSize,
                    TILE_SIZE * this.brushSize
                );
            }
            this.hoverBox.stroke({ width: 1, color: 0xff8800, alpha: 0.6 });
            return;
        }

        const offset = this.isPasting && this.clipboard ? 0 : this.brushOffset();
        const size = this.isPasting && this.clipboard
            ? { w: this.clipboard.w, h: this.clipboard.h }
            : { w: this.brushSize, h: this.brushSize };
        this.hoverBox.clear();
        this.hoverBox.rect(
            (pos.x + offset) * TILE_SIZE,
            (pos.y + offset) * TILE_SIZE,
            TILE_SIZE * size.w,
            TILE_SIZE * size.h
        );
        this.hoverBox.stroke({ width: 2, color: 0xffff00, alpha: 0.8 });
    }

    handlePointerAction(e: FederatedPointerEvent) {
        const pos = this.getMouseTilePos(e);

        if (pos.x < 0 || pos.y < 0 || pos.x >= this.level.tiles.baseLayer.w || pos.y >= this.level.tiles.baseLayer.h) {
            this.lastDrawTilePos = null;
            return;
        }

        if (this.currentTool === 'draw') {
            const isShift = this.activeKeys.has('ShiftLeft') || this.activeKeys.has('ShiftRight');
            if (isShift && this.shiftLineAnchor && e.type === 'pointerdown') {
                for (const p of this.lineTiles(this.shiftLineAnchor, pos)) {
                    this.applyDraw(p);
                }
                this.shiftLineAnchor = { ...pos };
                this.lastDrawTilePos = { ...pos };
            } else if (!isShift) {
                if (this.lastDrawTilePos && (this.lastDrawTilePos.x !== pos.x || this.lastDrawTilePos.y !== pos.y)) {
                    for (const p of this.lineTiles(this.lastDrawTilePos, pos)) {
                        this.applyDraw(p);
                    }
                } else {
                    this.applyDraw(pos);
                }
                this.lastDrawTilePos = { ...pos };
            }
        } else if (this.currentTool === 'fill') {
            if (this.isPointerDown && e.type === 'pointerdown') {
                this.applyFill(pos);
            }
        } else if (this.currentTool === 'eyedrop') {
            this.applyEyedrop(pos);
        }
    }

    *lineTiles(from: Point, to: Point): Iterable<Point> {
        let { x: x0, y: y0 } = from;
        const { x: x1, y: y1 } = to;
        const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
        let err = dx - dy;
        while (true) {
            yield { x: x0, y: y0 };
            if (x0 === x1 && y0 === y1) break;
            const e2 = 2 * err;
            if (e2 > -dy) { err -= dy; x0 += sx; }
            if (e2 < dx) { err += dx; y0 += sy; }
        }
    }

    applyDraw(pos: Point) {
        if (this.selection.type === 'base') {
            const offset = this.brushOffset();
            const changed: Point[] = [];
            for (let dy = 0; dy < this.brushSize; dy++) {
                for (let dx = 0; dx < this.brushSize; dx++) {
                    const p = { x: pos.x + offset + dx, y: pos.y + offset + dy };
                    if (p.x < 0 || p.y < 0 || p.x >= this.level.tiles.baseLayer.w || p.y >= this.level.tiles.baseLayer.h) continue;
                    if (this.level.tiles.baseLayer.getTile(p) !== this.selection.value) {
                        this.level.tiles.baseLayer.setTile(p, this.selection.value, { allowGrow: false });
                        changed.push({ ...p });
                    }
                }
            }
            if (changed.length > 0) {
                this.level.tiles.baseLayer.patchTiles(changed);
                this.markModified();
            }
        } else if (this.selection.type === 'object') {
            const offset = this.brushOffset();
            const changed: Point[] = [];
            for (let dy = 0; dy < this.brushSize; dy++) {
                for (let dx = 0; dx < this.brushSize; dx++) {
                    const p = { x: pos.x + offset + dx, y: pos.y + offset + dy };
                    if (p.x < 0 || p.y < 0 || p.x >= this.level.tiles.objectLayer.w || p.y >= this.level.tiles.objectLayer.h) continue;
                    if (this.level.tiles.objectLayer.getTile(p) !== this.selection.value) {
                        this.level.tiles.objectLayer.setTile(p, this.selection.value, { allowGrow: false });
                        changed.push({ ...p });
                    }
                }
            }
            if (changed.length > 0) {
                this.level.tiles.objectLayer.patchTiles(changed);
                this.markModified();
            }
        } else if (this.selection.type === 'entity') {
            const isErase = this.selection.value === 'none';
            if (this.isPointerDown && (isErase || !this.wasLastPosENTITY(pos))) {
                const physPos = this.level.tiles.getTileCoord(pos, { x: 0.5, y: 1 });
                this.spawnSelectedEntity(physPos);
                if (!isErase) this.lastEntityTilePos = { ...pos };
                this.markModified();
            }
        }
    }

    lastDrawTilePos: Point | null = null;
    lastEntityTilePos: Point | null = null;
    wasLastPosENTITY(pos: Point) {
        return this.lastEntityTilePos && this.lastEntityTilePos.x === pos.x && this.lastEntityTilePos.y === pos.y;
    }

    spawnSelectedEntity(pos: Point) {
        if (this.selection.type !== 'entity') return;

        const existingIdx = this.level.entities.findIndex(e =>
            Math.floor(e.midX / TILE_SIZE) === Math.floor(pos.x / TILE_SIZE) &&
            Math.floor(e.maxY / TILE_SIZE) === Math.floor(pos.y / TILE_SIZE)
        );
        if (existingIdx !== -1) {
            this.level.entities[existingIdx].removeFromScene();
            this.level.entities.splice(existingIdx, 1);
        }

        if (this.selection.value === 'none') return;

        if (this.selection.value === 'player') {
            this.level.spawnPlayer(pos);
        }

        const lastEntity = this.level.entities[this.level.entities.length - 1];
        if (lastEntity) {
            lastEntity.updateGraphics();
        }
    }

    applyFill(pos: Point) {
        if (this.selection.type === 'entity') return;

        const isBase = this.selection.type === 'base';
        const layer = isBase ? this.level.tiles.baseLayer : this.level.tiles.objectLayer;
        const targetValue = layer.getTile(pos);
        const newValue = this.selection.value;

        if (targetValue === newValue) return;

        const queue: Point[] = [pos];
        const visited = new Set<string>();

        while (queue.length > 0) {
            const p = queue.shift()!;
            const key = `${p.x},${p.y}`;
            if (visited.has(key)) continue;
            visited.add(key);

            if (p.x < 0 || p.y < 0 || p.x >= layer.w || p.y >= layer.h) continue;
            if (layer.getTile(p) !== targetValue) continue;

            if (isBase) {
                (layer as any).setTile(p, newValue, { allowGrow: false });
            } else {
                (layer as any).setTile(p, newValue, { allowGrow: false });
            }

            queue.push({ x: p.x + 1, y: p.y });
            queue.push({ x: p.x - 1, y: p.y });
            queue.push({ x: p.x, y: p.y + 1 });
            queue.push({ x: p.x, y: p.y - 1 });
        }

        layer.redraw();
        this.markModified();
    }

    applyEyedrop(pos: Point) {
        if (this.currentLayer === 'entity') {
            const physPos = this.level.tiles.getTileCoord(pos, { x: 0.5, y: 1 });
            const entity = this.level.entities.find(e =>
                Math.abs(e.midX - physPos.x) < TILE_SIZE / 2 &&
                Math.abs(e.maxY - physPos.y) < TILE_SIZE / 2
            );
            if (entity) {
                const type = entity.getEntityType();
                this.selection = { type: 'entity', value: type || 'none' };
            } else {
                this.selection = { type: 'entity', value: 'none' };
            }
        } else if (this.currentLayer === 'object') {
            this.selection = { type: 'object', value: this.level.tiles.objectLayer.getTile(pos) };
        } else {
            this.selection = { type: 'base', value: this.level.tiles.baseLayer.getTile(pos) };
        }

        if (this.currentTool === 'eyedrop') {
            this.setTool('draw');
        } else {
            this.updateUI();
        }
    }

    setupKeyboard() {
        window.addEventListener('keydown', (e) => {
            const isInputFocused = ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName || '');

            if (e.code === 'Space' && !isInputFocused) {
                if (!this.isSpaceDown) {
                    this.isSpaceDown = true;
                    this.savedTool = this.currentTool;
                    this.setTool('pan');
                }
                e.preventDefault();
                return;
            }

            this.activeKeys.add(e.code);

            if (isInputFocused) return;

            if (e.code === 'KeyB') this.setTool('draw');
            if (e.code === 'KeyK') this.setTool('fill');
            if (e.code === 'KeyI') this.setTool('eyedrop');
            if (e.code === 'KeyM') this.setTool('select');
            if (e.code === 'KeyE') this.exportLevel();
            if (e.code === 'KeyS') { e.preventDefault(); this.saveToFile(); }
            if (e.code === 'KeyO') { e.preventDefault(); this.openFile(); }
            if (e.code === 'KeyN') { e.preventDefault(); this.newLevel(); }

            if (e.code === 'KeyZ') this.undo();
            if (e.code === 'Escape') {
                if (this.isPasting) { this.cancelPaste(); }
                else { this.selectionRect = null; this.selectionGraphics.clear(); }
            }
            if (e.code === 'KeyC' && this.selectionRect) this.copySelection();
            if (e.code === 'KeyX' && this.selectionRect) this.cutSelection();
            if (e.code === 'KeyV' && this.clipboard) {
                if (this.isPasting) { this.cancelPaste(); }
                else { this.startPaste(); }
            }

            // Layer switching
            if (e.code === 'Digit1') this.switchToLayer('base');
            if (e.code === 'Digit2') this.switchToLayer('object');
            if (e.code === 'Digit3') this.switchToLayer('entity');

            // Cycle selection
            if (e.code === 'BracketLeft') this.cycleSelectionBack();
            if (e.code === 'BracketRight') this.cycleSelectionForward();
        });

        window.addEventListener('keyup', (e) => {
            this.activeKeys.delete(e.code);

            if (e.code === 'Space') {
                if (this.isSpaceDown) {
                    this.isSpaceDown = false;
                    this.lastPanPos = null;
                    if (this.savedTool) {
                        this.setTool(this.savedTool);
                        this.savedTool = null;
                    }
                }
            }
        });
    }

    readonly layerSelections: Record<EditorLayer, SelectedType[]> = {
        base: [
            { type: 'base', value: BaseTile.Wall },
            { type: 'base', value: BaseTile.Background },
            { type: 'base', value: BaseTile.Empty },
        ],
        object: [
            { type: 'object', value: ObjectTile.Platform },
            { type: 'object', value: ObjectTile.Goal },
            { type: 'object', value: ObjectTile.Spawn },
            { type: 'object', value: ObjectTile.Empty },
        ],
        entity: [
            { type: 'entity', value: 'player' },
            { type: 'entity', value: 'none' },
        ],
    };

    switchToLayer(layer: EditorLayer) {
        this.currentLayer = layer;
        if (this.selection.type !== layer) {
            this.selection = this.layerSelections[layer][0];
        }
        this.updateUI();
    }

    currentSelectionIndex(): number {
        const list = this.layerSelections[this.currentLayer];
        return list.findIndex(s =>
            s.type === this.selection.type && (s as any).value === (this.selection as any).value
        );
    }

    cycleSelectionForward() {
        const list = this.layerSelections[this.currentLayer];
        const idx = this.currentSelectionIndex();
        this.setSelection(list[(idx + 1) % list.length]);
    }

    cycleSelectionBack() {
        const list = this.layerSelections[this.currentLayer];
        const idx = this.currentSelectionIndex();
        this.setSelection(list[(idx + list.length - 1) % list.length]);
    }

    updateHoverAfterPan() {
        this.hoverBox.clear();
        if (this.selectionRect) {
            const { x, y, w, h } = this.selectionRect;
            this.renderSelectionRect({ x, y }, { x: x + w - 1, y: y + h - 1 });
        }
        if (this.isPasting) this.renderPastePreview(this.pastePos);
    }

    calcSelectionRect(a: Point, b: Point) {
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        const w = Math.abs(a.x - b.x) + 1;
        const h = Math.abs(a.y - b.y) + 1;
        return { x, y, w, h };
    }

    renderSelectionRect(a: Point, b: Point) {
        const { x, y, w, h } = this.calcSelectionRect(a, b);
        const s = this.level.container.scale.x;
        const origin = this.level.container.toGlobal({ x: x * TILE_SIZE, y: y * TILE_SIZE });

        this.selectionGraphics.clear();
        this.selectionGraphics.rect(origin.x, origin.y, w * TILE_SIZE * s, h * TILE_SIZE * s);
        this.selectionGraphics.fill({ color: 0x00cfff, alpha: 0.1 });
        this.selectionGraphics.stroke({ width: 2, color: 0x00cfff, alpha: 1 });
    }

    private baseTileColor(t: BaseTile): number | null {
        switch (t) {
            case BaseTile.Wall: return 0x555566;
            case BaseTile.Background: return 0x334455;
            default: return null;
        }
    }

    private objectTileColor(t: ObjectTile): number | null {
        switch (t) {
            case ObjectTile.Platform: return 0xcc8844;
            case ObjectTile.Goal: return 0xffdd00;
            case ObjectTile.Spawn: return 0x44cc88;
            default: return null;
        }
    }

    renderPastePreview(pos: Point) {
        if (!this.clipboard) return;
        const { w, h, baseTiles, objectTiles } = this.clipboard;
        const s = this.level.container.scale.x;
        const ts = TILE_SIZE * s;
        const origin = this.level.container.toGlobal({ x: pos.x * TILE_SIZE, y: pos.y * TILE_SIZE });

        this.pasteGraphics.clear();
        for (let dy = 0; dy < h; dy++) {
            for (let dx = 0; dx < w; dx++) {
                const px = origin.x + dx * ts;
                const py = origin.y + dy * ts;
                const bc = this.baseTileColor(baseTiles[dy][dx]);
                if (bc !== null) {
                    this.pasteGraphics.rect(px, py, ts, ts);
                    this.pasteGraphics.fill({ color: bc, alpha: 0.6 });
                }
                const oc = objectTiles ? this.objectTileColor(objectTiles[dy][dx]) : null;
                if (oc !== null) {
                    this.pasteGraphics.rect(px, py, ts, ts);
                    this.pasteGraphics.fill({ color: oc, alpha: 0.6 });
                }
            }
        }
        this.pasteGraphics.rect(origin.x, origin.y, w * ts, h * ts);
        this.pasteGraphics.stroke({ width: 2, color: 0xffffff, alpha: 0.9 });
    }

    copySelection() {
        if (!this.selectionRect) return;
        const { x, y, w, h } = this.selectionRect;
        const baseTiles: BaseTile[][] = [];
        const objectTiles: ObjectTile[][] = [];
        for (let dy = 0; dy < h; dy++) {
            baseTiles[dy] = [];
            objectTiles[dy] = [];
            for (let dx = 0; dx < w; dx++) {
                baseTiles[dy][dx] = this.level.tiles.baseLayer.getTile({ x: x + dx, y: y + dy });
                objectTiles[dy][dx] = this.level.tiles.objectLayer.getTile({ x: x + dx, y: y + dy });
            }
        }
        const entities = this.level.entities.flatMap(e => {
            const type = e.getEntityType();
            if (!type) return [];
            
            const ex = Math.floor(e.midX / TILE_SIZE);
            const ey = Math.floor(e.maxY / TILE_SIZE);
            if (ex >= x && ex < x + w && ey >= y && ey < y + h) {
                return [{ type, relX: ex - x, relY: ey - y }];
            }
            return [];
        });
        this.clipboard = { w, h, baseTiles, objectTiles, entities };
    }

    cutSelection() {
        if (!this.selectionRect) return;
        this.pushUndo();
        this.copySelection();
        const { x, y, w, h } = this.selectionRect;
        const changedBase: Point[] = [];
        const changedObj: Point[] = [];
        for (let dy = 0; dy < h; dy++) {
            for (let dx = 0; dx < w; dx++) {
                const p = { x: x + dx, y: y + dy };
                if (p.x >= 0 && p.y >= 0 && p.x < this.level.tiles.baseLayer.w && p.y < this.level.tiles.baseLayer.h) {
                    this.level.tiles.baseLayer.setTile(p, BaseTile.Empty, { allowGrow: false });
                    this.level.tiles.objectLayer.setTile(p, ObjectTile.Empty, { allowGrow: false });
                    changedBase.push({ ...p });
                    changedObj.push({ ...p });
                }
            }
        }
        const toRemove = this.level.entities.filter(e => {
            if (!e.getEntityType()) return false;
            const ex = Math.floor(e.midX / TILE_SIZE);
            const ey = Math.floor(e.maxY / TILE_SIZE);
            return ex >= x && ex < x + w && ey >= y && ey < y + h;
        });
        for (const e of toRemove) {
            e.removeFromScene();
            this.level.entities.splice(this.level.entities.indexOf(e), 1);
        }
        this.level.tiles.baseLayer.patchTiles(changedBase);
        this.level.tiles.objectLayer.patchTiles(changedObj);
        this.markModified();
    }

    startPaste() {
        if (!this.clipboard) return;
        this.isPasting = true;
        this.selectionGraphics.clear();
        this.renderPastePreview(this.pastePos);
    }

    commitPaste(pos: Point) {
        if (!this.clipboard) return;
        this.pushUndo();
        const { w, h, baseTiles, objectTiles, entities } = this.clipboard;
        const changedBase: Point[] = [];
        const changedObj: Point[] = [];
        for (let dy = 0; dy < h; dy++) {
            for (let dx = 0; dx < w; dx++) {
                const p = { x: pos.x + dx, y: pos.y + dy };
                if (p.x < 0 || p.y < 0 || p.x >= this.level.tiles.baseLayer.w || p.y >= this.level.tiles.baseLayer.h) continue;
                this.level.tiles.baseLayer.setTile(p, baseTiles[dy][dx], { allowGrow: false });
                changedBase.push({ ...p });
                if (objectTiles) {
                    this.level.tiles.objectLayer.setTile(p, objectTiles[dy][dx], { allowGrow: false });
                    changedObj.push({ ...p });
                }
            }
        }
        for (const e of entities) {
            const physPos = this.level.tiles.getTileCoord({ x: pos.x + e.relX, y: pos.y + e.relY }, { x: 0.5, y: 1 });
            if (e.type === 'player') {
                this.level.spawnPlayer(physPos);
            }
            const last = this.level.entities[this.level.entities.length - 1];
            if (last) last.updateGraphics();
        }
        this.level.tiles.baseLayer.patchTiles(changedBase);
        this.level.tiles.objectLayer.patchTiles(changedObj);
        this.markModified();
        this.isPasting = false;
        this.pasteGraphics.clear();
        this.hoverBox.clear();
    }

    cancelPaste() {
        this.isPasting = false;
        this.pasteGraphics.clear();
        this.hoverBox.clear();
    }

    setupButtons() {
        document.getElementById('btn-new')?.addEventListener('click', () => this.newLevel());
        document.getElementById('btn-open')?.addEventListener('click', () => this.openFile());
        document.getElementById('btn-save')?.addEventListener('click', () => this.saveToFile());
        document.getElementById('btn-save-as')?.addEventListener('click', () => this.saveAs());
    }

    newLevel() {
        if (this.isModified) {
            if (!confirm('You have unsaved changes. Create new level anyway?')) return;
        }
        this.fileHandle = null;
        this.isModified = false;
        this.undoStack = [];
        this.resetLevel();
        this.showStatus('New level created');
    }

    async openFile() {
        try {
            const [handle] = await (window as any).showOpenFilePicker({
                types: [{ description: 'JSON Level File', accept: { 'application/json': ['.json'] } }],
            });
            const file = await handle.getFile();
            const text = await file.text();
            const json = JSON.parse(text);
            this.level.initFromJson(json);
            if (this.level.background) this.level.background.container.removeFromParent();
            this.renderLevelBounds();
            this.fileHandle = handle;
            setLastFileHandle(handle).catch(console.error);
            this.isModified = false;
            this.undoStack = [];
            this.updateUI();
            this.showStatus(`Loaded ${handle.name}`);
        } catch (err) {
            if ((err as Error).name !== 'AbortError') {
                console.error(err);
                this.showStatus('Failed to open file', true);
            }
        }
    }

    async saveToFile(forceNewHandle = false) {
        try {
            if (!this.fileHandle || forceNewHandle) {
                this.fileHandle = await (window as any).showSaveFilePicker({
                    types: [{ description: 'JSON Level File', accept: { 'application/json': ['.json'] } }],
                });
            }
            const writable = await (this.fileHandle as any).createWritable();
            const json = this.level.serializeToJson();
            await writable.write(JSON.stringify(json, null, 2));
            await writable.close();
            if (this.fileHandle) setLastFileHandle(this.fileHandle).catch(console.error);
            this.isModified = false;
            this.updateUI();
            this.showStatus(`Saved to ${this.fileHandle!.name}`);
        } catch (err) {
            if ((err as Error).name !== 'AbortError') {
                console.error(err);
                this.showStatus('Failed to save file', true);
            }
        }
    }

    async saveAs() {
        await this.saveToFile(true);
    }

    resizeLevel(newW: number, newH: number) {
        this.pushUndo();
        this.level.tiles.baseLayer.resizeTo(newW, newH, BaseTile.Empty);
        this.level.tiles.objectLayer.resizeTo(newW, newH, ObjectTile.Empty);
        this.level.tiles.baseLayer.redraw();
        this.level.tiles.objectLayer.redraw();
        this.renderLevelBounds();
        this.markModified();
    }

    pushUndo() {
        this.undoStack.push(this.level.serializeToJson());
        if (this.undoStack.length > 50) this.undoStack.shift();
    }

    undo() {
        const state = this.undoStack.pop();
        if (!state) return;
        this.level.initFromJson(state);
        if (this.level.background) this.level.background.container.removeFromParent();
        this.renderLevelBounds();
        this.isModified = true;
        this.updateUI();
        this.showStatus('Undo');
    }

    markModified() {
        if (!this.isModified) {
            this.isModified = true;
            this.updateUI();
        }
    }

    setTool(tool: EditorTool) {
        if (tool !== 'select') {
            this.selectionRect = null;
            this.selectionGraphics.clear();
        }
        if (tool !== 'draw') {
            this.shiftLineAnchor = null;
        }
        if (this.isPasting) this.cancelPaste();
        this.currentTool = tool;
        this.updateUI();
    }

    setSelection(sel: SelectedType) {
        this.selection = sel;
        this.currentLayer = sel.type;
        this.updateUI();
    }

    updateUI() {
        const selEl = document.getElementById('current-selection') as HTMLSelectElement;
        if (selEl) {
            let value = '';
            if (this.selection.type === 'base') value = `base:${this.selection.value}`;
            if (this.selection.type === 'object') value = `object:${this.selection.value}`;
            if (this.selection.type === 'entity') value = `entity:${this.selection.value}`;
            selEl.value = value;
        }

        const toolEl = document.getElementById('current-tool');
        if (toolEl) {
            if (this.currentTool === 'pan') {
                toolEl.innerText = 'Panning';
            } else {
                toolEl.innerText = this.currentTool.charAt(0).toUpperCase() + this.currentTool.slice(1);
            }
        }

        const layerEl = document.getElementById('current-layer');
        if (layerEl) {
            const labels: Record<EditorLayer, string> = {
                base: 'Base Tiles',
                object: 'Object Tiles',
                entity: 'Entities',
            };
            const colors: Record<EditorLayer, string> = {
                base: '#e67e22',
                object: '#27ae60',
                entity: '#8e44ad',
            };
            layerEl.innerText = labels[this.currentLayer];
            (layerEl as HTMLElement).style.color = colors[this.currentLayer];
        }

        const wEl = document.getElementById('level-width') as HTMLInputElement;
        const hEl = document.getElementById('level-height') as HTMLInputElement;
        if (wEl) wEl.value = String(this.level.tiles.baseLayer.w);
        if (hEl) hEl.value = String(this.level.tiles.baseLayer.h);

        const statusDetailEl = document.getElementById('status-detail');
        if (statusDetailEl) {
            const fileName = this.fileHandle?.name ?? 'Unsaved Level';
            statusDetailEl.innerText = `${fileName}${this.isModified ? '*' : ''}`;
        }
    }

    async exportLevel() {
        const json = this.level.serializeToJson();
        const str = JSON.stringify(json, null, 2);
        try {
            await navigator.clipboard.writeText(str);
            this.showStatus('Exported to clipboard!');
        } catch (err) {
            console.error('Failed to copy: ', err);
            this.showStatus('Failed to copy to clipboard', true);
        }
    }

    showStatus(msg: string, isError = false) {
        const statusEl = document.getElementById('status-msg');
        if (statusEl) {
            statusEl.innerText = msg;
            statusEl.style.color = isError ? '#ff4444' : '#fff';
            setTimeout(() => {
                statusEl.innerText = 'Ready';
                statusEl.style.color = '#888';
            }, 2000);
        }
    }

    renderLevelBounds() {
        this.levelBackground.clear();

        const w = this.level.tiles.baseLayer.w * TILE_SIZE;
        const h = this.level.tiles.baseLayer.h * TILE_SIZE;

        this.levelBackground.rect(0, 0, w, h);
        this.levelBackground.fill({ color: 0x22222e, alpha: 1 });
        this.levelBackground.stroke({ width: TILE_SIZE / 4, color: 0xffffff, alpha: 0.5 });

        if (!this.level.container.children.includes(this.levelBackground)) {
            this.level.container.addChildAt(this.levelBackground, 0);
        }
    }

    resize() {
        this.level.container.x = Math.round(this.app.screen.width * 0.5);
        this.level.container.y = Math.round(this.app.screen.height * 0.5);
        this.level.container.scale.set(this.BASE_SCALE * this.zoom);
    }
}
