import { describe, it, expect } from 'vitest';
import { CenteredCamera } from './camera';
import { GAME_WIDTH, GAME_HEIGHT } from '../constants';

describe('CenteredCamera', () => {
    it('centers the level in the viewport', () => {
        const camera = new CenteredCamera();
        const levelWidth = GAME_WIDTH * 2;
        const levelHeight = GAME_HEIGHT * 2;
        camera.bounds = { minX: 0, minY: 0, maxX: levelWidth, maxY: levelHeight };
        
        camera.update(1.0);
        
        expect(camera.curPos!.x).toBe(levelWidth / 2);
        expect(camera.curPos!.y).toBe(levelHeight / 2);
    });

    it('centers even if level is smaller than viewport', () => {
        const camera = new CenteredCamera();
        const levelWidth = GAME_WIDTH * 0.5;
        const levelHeight = GAME_HEIGHT * 0.5;
        camera.bounds = { minX: 0, minY: 0, maxX: levelWidth, maxY: levelHeight };
        
        camera.update(1.0);
        
        expect(camera.curPos!.x).toBe(levelWidth / 2);
        expect(camera.curPos!.y).toBe(levelHeight / 2);
    });
});
