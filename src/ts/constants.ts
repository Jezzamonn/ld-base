import { seededRandom } from "./lib/util";

// Multiple for the fixed-point physics.
export const PHYSICS_SCALE = 16;
export const FPS = 60;
export const TIME_STEP = 1 / FPS;

export const PIXEL_SCALE = 4;

export const IS_DEBUG = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');
export const DEBUG_HITBOXES = IS_DEBUG;

export const GAME_WIDTH_PX = 200;
export const GAME_HEIGHT_PX = 150;
export const GAME_WIDTH = GAME_WIDTH_PX * PHYSICS_SCALE;
export const GAME_HEIGHT = GAME_HEIGHT_PX * PHYSICS_SCALE;

export const TILE_SIZE_PX = 16;
export const TILE_SIZE = TILE_SIZE_PX * PHYSICS_SCALE;

export const LEFT_KEYS = ['KeyA', 'ArrowLeft', 'TouchButtonLeft'];
export const RIGHT_KEYS = ['KeyD', 'ArrowRight', 'TouchButtonRight'];
export const JUMP_KEYS = ['KeyW', 'ArrowUp', 'TouchButtonJump'];
// export const DOWN_KEYS = ['KeyS', 'ArrowDown'];
export const PLANT_KEYS = ['KeyS', 'ArrowDown', 'TouchButtonPlant'];
export const SELECT_KEYS = ['Space', 'Enter', 'AnyTouch'];
export const TITLE_KEYS = ['Space', 'Enter', 'AnyTouch'];
export const RESTART_KEYS = ['KeyR', 'TouchButtonRestart'];

export function physFromPx(x: number): number {
    return x * PHYSICS_SCALE;
}

export function pxFromPhys(x: number): number {
    return Math.floor(x / PHYSICS_SCALE);
}

// Not really a constant :)
export const rng = seededRandom("blah bloo blee blah");