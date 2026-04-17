const disableDefaultKeys = new Set(["Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"]);

export class RegularKeys {
    setUp(): void {}
    resetFrame(): void {}
    isPressed(keyCode: string): boolean {
        return false;
    }
    wasPressedThisFrame(keyCode: string): boolean {
        return false;
    }
    wasReleasedThisFrame(keyCode: string): boolean {
        return false;
    }

    anyIsPressed(keyCodes: string[]): boolean {
        for (const keyCode of keyCodes) {
            if (this.isPressed(keyCode)) {
                return true;
            }
        }
        return false;
    }

    anyWasPressedThisFrame(keyCodes: string[]): boolean {
        for (const keyCode of keyCodes) {
            if (this.wasPressedThisFrame(keyCode)) {
                return true;
            }
        }
        return false;
    }

    anyWasReleasedThisFrame(keyCodes: string[]): boolean {
        for (const keyCode of keyCodes) {
            if (this.wasReleasedThisFrame(keyCode)) {
                return true;
            }
        }
        return false;
    }
}

export class KeyboardKeys extends RegularKeys {
    #pressedKeys: Set<string> = new Set();
    #pressedThisFrame: Set<string> = new Set();
    #releasedThisFrame: Set<string> = new Set();

    setUp() {
        // Thought: Should this be adding to a number rather than triggering a boolean? Eh.
        document.addEventListener('keydown', (evt) => {
            if (!this.#pressedKeys.has(evt.code)) {
                this.#pressedThisFrame.add(evt.code);
                // console.log(evt.code);
            }
            this.#pressedKeys.add(evt.code);

            // Also disable scrolling
            if (disableDefaultKeys.has(evt.code)) {
                evt.preventDefault();
            }
        });
        document.addEventListener('keyup', (evt) => {
            this.#pressedKeys.delete(evt.code);
            this.#releasedThisFrame.add(evt.code);
        });
    }

    resetFrame() {
        this.#pressedThisFrame.clear();
        this.#releasedThisFrame.clear();
    }

    isPressed(keyCode: string): boolean {
        return this.#pressedKeys.has(keyCode);
    }

    wasPressedThisFrame(keyCode: string): boolean {
        return this.#pressedThisFrame.has(keyCode);
    }

    wasReleasedThisFrame(keyCode: string): boolean {
        return this.#releasedThisFrame.has(keyCode);
    }
}

export class ComboKeys extends RegularKeys {

    subKeys: RegularKeys[];

    constructor(...keys: RegularKeys[]) {
        super();
        this.subKeys = keys;
    }

    setUp(): void {
        this.subKeys.forEach(k => k.setUp());
    }
    resetFrame(): void {
        this.subKeys.forEach(k => k.resetFrame());
    }
    isPressed(keyCode: string): boolean {
        return this.subKeys.some(k => k.isPressed(keyCode));
    }
    wasPressedThisFrame(keyCode: string): boolean {
        return this.subKeys.some(k => k.wasPressedThisFrame(keyCode));
    }
    wasReleasedThisFrame(keyCode: string): boolean {
        return this.subKeys.some(k => k.wasReleasedThisFrame(keyCode));
    }
}

export class MockKeys extends RegularKeys {
    #pressedKeys: Set<string> = new Set();
    #pressedThisFrame: Set<string> = new Set();
    #releasedThisFrame: Set<string> = new Set();

    press(keyCode: string) {
        if (!this.#pressedKeys.has(keyCode)) {
            this.#pressedThisFrame.add(keyCode);
        }
        this.#pressedKeys.add(keyCode);
    }

    release(keyCode: string) {
        if (this.#pressedKeys.has(keyCode)) {
            this.#releasedThisFrame.add(keyCode);
        }
        this.#pressedKeys.delete(keyCode);
    }

    setUp() {}

    resetFrame() {
        this.#pressedThisFrame.clear();
        this.#releasedThisFrame.clear();
    }

    isPressed(keyCode: string): boolean {
        return this.#pressedKeys.has(keyCode);
    }

    wasPressedThisFrame(keyCode: string): boolean {
        return this.#pressedThisFrame.has(keyCode);
    }

    wasReleasedThisFrame(keyCode: string): boolean {
        return this.#releasedThisFrame.has(keyCode);
    }
}

export class NullKeys extends RegularKeys {}