import { TIME_STEP } from "../constants";
import { lerp } from "./util";
import { Sounds } from "./sounds";

export type Coroutine = Generator<void, void, any>;

export interface ICamera {
    zoom: number;
}

export interface ILevel {
    entitiesUpdatesEnabled: boolean;
}

export interface IInput {
    wasPressedThisFrame(key: string): boolean;
}

export interface IOverlay {
    fadeAlpha: number;
    creditsAlpha: number;
    subtitleText: string;
}

export class CutsceneManager {
    private coroutines: Set<Coroutine> = new Set();
    input?: IInput;

    /**
     * Start a new coroutine.
     */
    start(co: Coroutine) {
        this.coroutines.add(co);
    }

    /**
     * Update all active coroutines.
     * Should be called once per frame.
     */
    update() {
        for (const co of this.coroutines) {
            try {
                const result = co.next();
                if (result.done) {
                    this.coroutines.delete(co);
                }
            } catch (e) {
                console.error("Error in cutscene coroutine:", e);
                this.coroutines.delete(co);
            }
        }
    }

    /**
     * Stop all active coroutines.
     */
    stopAll() {
        this.coroutines.clear();
    }

    /**
     * Check if any coroutines are active.
     */
    get hasActive(): boolean {
        return this.coroutines.size > 0;
    }
}

/**
 * Wait for a specified number of seconds.
 */
export function* wait(seconds: number, input?: IInput): Coroutine {
    let frames = Math.ceil(seconds / TIME_STEP);
    while (frames > 0) {
        if (input?.wasPressedThisFrame('Space')) {
            yield; // Wait a frame so the same press doesn't skip the next part
            return;
        }
        yield;
        frames--;
    }
}

/**
 * Run multiple generators in parallel and wait for all of them to finish.
 */
export function* doAll(...generators: Coroutine[]): Coroutine {
    const active = new Set(generators);
    while (active.size > 0) {
        for (const co of active) {
            const result = co.next();
            if (result.done) {
                active.delete(co);
            }
        }
        if (active.size > 0) {
            yield;
        }
    }
}

/**
 * Run multiple generators in parallel and finish as soon as the first one does.
 */
export function* race(...generators: Coroutine[]): Coroutine {
    while (true) {
        for (const co of generators) {
            const result = co.next();
            if (result.done) {
                return;
            }
        }
        yield;
    }
}

/**
 * Zoom the camera to a target level over time.
 */
export function* zoomTo(camera: ICamera, targetZoom: number, duration: number, input?: IInput): Coroutine {
    if (duration <= 0) {
        camera.zoom = targetZoom;
        return;
    }

    const startZoom = camera.zoom;
    let elapsed = 0;
    while (elapsed < duration) {
        if (input?.wasPressedThisFrame('Space')) {
            camera.zoom = targetZoom;
            yield; // Wait a frame so the same press doesn't skip the next part
            return;
        }
        yield;
        elapsed += TIME_STEP;
        const t = Math.min(1, elapsed / duration);
        camera.zoom = lerp(startZoom, targetZoom, t);
    }
    camera.zoom = targetZoom;
}

/**
 * Set the camera zoom instantly.
 */
export function* instantZoom(camera: ICamera, targetZoom: number): Coroutine {
    camera.zoom = targetZoom;
}

/**
 * Set whether entities should update in a level.
 */
export function* setEntitiesUpdatesEnabled(level: ILevel, enabled: boolean): Coroutine {
    level.entitiesUpdatesEnabled = enabled;
}

/**
 * Play a sound and wait for it to finish.
 */
export function* playAudio(name: string, input?: IInput, overlay?: IOverlay): Coroutine {
    let done = false;
    const subtitles = Sounds.getSubtitles(name);
    const audio = Sounds.getAudio(name);

    const { promise, stop } = Sounds.playSoundAndWait(name);
    promise.then(() => {
        done = true;
    });

    let elapsed = 0;
    let currentLineIndex = -1;
    const duration = audio?.duration ?? 0;
    const totalChars = subtitles ? subtitles.reduce((acc, s) => acc + s.length, 0) : 0;

    while (!done) {
        if (input?.wasPressedThisFrame('Space')) {
            stop();
            done = true;
            yield; // Wait a frame so the same press doesn't skip the next part
            break;
        }

        if (subtitles && overlay && duration > 0) {
            const progress = elapsed / duration;
            const currentTargetChar = progress * totalChars;

            let sum = 0;
            let targetLineIndex = subtitles.length - 1;
            for (let i = 0; i < subtitles.length; i++) {
                sum += subtitles[i].length;
                if (currentTargetChar <= sum) {
                    targetLineIndex = i;
                    break;
                }
            }

            if (targetLineIndex !== currentLineIndex) {
                currentLineIndex = targetLineIndex;
                overlay.subtitleText = subtitles[currentLineIndex];
            }
        } else if (subtitles && overlay && subtitles.length > 0 && currentLineIndex === -1) {
            currentLineIndex = 0;
            overlay.subtitleText = subtitles[0];
        }

        yield;
        elapsed += TIME_STEP;
    }

    if (overlay) {
        overlay.subtitleText = '';
    }
}

/**
 * Fade the screen to black over time.
 */
export function* fadeToBlack(overlay: IOverlay, duration: number, input?: IInput): Coroutine {
    let elapsed = 0;
    while (elapsed < duration) {
        if (input?.wasPressedThisFrame('Space')) {
            overlay.fadeAlpha = 1;
            yield;
            return;
        }
        yield;
        elapsed += TIME_STEP;
        overlay.fadeAlpha = Math.min(1, elapsed / duration);
    }
    overlay.fadeAlpha = 1;
}

/**
 * Fade an image in over time.
 */
export function* fadeInImage(overlay: IOverlay, duration: number, input?: IInput): Coroutine {
    let elapsed = 0;
    while (elapsed < duration) {
        if (input?.wasPressedThisFrame('Space')) {
            overlay.creditsAlpha = 1;
            yield;
            return;
        }
        yield;
        elapsed += TIME_STEP;
        overlay.creditsAlpha = Math.min(1, elapsed / duration);
    }
    overlay.creditsAlpha = 1;
}
