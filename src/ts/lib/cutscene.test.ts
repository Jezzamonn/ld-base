import { describe, it, expect } from "vitest";
import { CutsceneManager, wait, doAll, race } from "./cutscene";
import { TIME_STEP } from "../constants";

describe("Cutscene System", () => {
    it("should wait for the correct number of frames", () => {
        const manager = new CutsceneManager();
        const seconds = 0.05; // 3 frames at 60fps (0.0166... * 3 = 0.05)
        const co = wait(seconds);
        manager.start(co);

        expect(manager.hasActive).toBe(true);
        
        // Frame 1
        manager.update();
        expect(manager.hasActive).toBe(true);

        // Frame 2
        manager.update();
        expect(manager.hasActive).toBe(true);

        // Frame 3
        manager.update();
        expect(manager.hasActive).toBe(true);

        // Frame 4
        manager.update();
        expect(manager.hasActive).toBe(false);
    });

    it("should run tasks in parallel with doAll", () => {
        const manager = new CutsceneManager();
        
        let task1Done = false;
        let task2Done = false;

        function* task1() {
            yield* wait(TIME_STEP * 2);
            task1Done = true;
        }

        function* task2() {
            yield* wait(TIME_STEP * 4);
            task2Done = true;
        }

        manager.start(doAll(task1(), task2()));

        manager.update(); // Frame 1
        expect(task1Done).toBe(false);
        expect(task2Done).toBe(false);

        manager.update(); // Frame 2
        expect(task1Done).toBe(false);
        
        manager.update(); // Frame 3
        expect(task1Done).toBe(true);
        expect(task2Done).toBe(false);

        manager.update(); // Frame 4
        manager.update(); // Frame 5
        expect(task2Done).toBe(true);
        expect(manager.hasActive).toBe(false);
    });

    it("should finish as soon as one task finishes with race", () => {
        const manager = new CutsceneManager();
        
        let task1Done = false;
        let task2Done = false;

        function* task1() {
            yield* wait(TIME_STEP * 2);
            task1Done = true;
        }

        function* task2() {
            yield* wait(TIME_STEP * 10);
            task2Done = true;
        }

        manager.start(race(task1(), task2()));

        manager.update(); // Frame 1
        manager.update(); // Frame 2
        manager.update(); // Frame 3 - task1 finishes here
        
        expect(task1Done).toBe(true);
        expect(task2Done).toBe(false);
        expect(manager.hasActive).toBe(false);
    });
});
