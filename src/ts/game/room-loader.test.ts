import { describe, it, expect } from 'vitest';
import { floodFillRoom, extractRoomData } from './room-loader';
import { BaseTile } from './tile/base-layer';
import { LevelData } from './level';

describe('room-loader', () => {
    it('floodFillRoom correctly finds room bounds surrounded by Boundary tiles', () => {
        // 5x5 map with room of size 3x3 at center surrounded by Boundary (3)
        const B = BaseTile.Boundary;
        const W = BaseTile.Wall;
        const E = BaseTile.Empty;

        const mapData: LevelData = {
            tiles: [
                [B, B, B, B, B],
                [B, E, E, E, B],
                [B, E, W, E, B],
                [B, E, E, E, B],
                [B, B, B, B, B],
            ],
            entities: [{ type: 'player', x: 2, y: 2 }],
        };

        const bounds = floodFillRoom(mapData, 2, 2);
        expect(bounds).toEqual({
            minTileX: 0,
            minTileY: 0,
            maxTileX: 4,
            maxTileY: 4,
        });
    });

    it('extractRoomData correctly slices tiles and offsets entities to local coords', () => {
        const B = BaseTile.Boundary;
        const W = BaseTile.Wall;
        const E = BaseTile.Empty;

        const mapData: LevelData = {
            tiles: [
                [B, B, B, B, B, B, B],
                [B, E, E, B, E, E, B],
                [B, E, W, B, E, W, B],
                [B, B, B, B, B, B, B],
            ],
            entities: [
                { type: 'player', x: 1, y: 1 },
                { type: 'player', x: 4, y: 1 }, // in room 2
            ],
        };

        // Room 1 bounds: x 0..3, y 0..3
        const room1Bounds = floodFillRoom(mapData, 1, 1);
        expect(room1Bounds.minTileX).toBe(0);
        expect(room1Bounds.maxTileX).toBe(3);

        const room1Data = extractRoomData(mapData, room1Bounds);
        expect(room1Data.tiles.length).toBe(4);
        expect(room1Data.tiles[0].length).toBe(4);
        expect(room1Data.entities).toEqual([
            { type: 'player', x: 1, y: 1 },
        ]);

        // Room 2 bounds: x 3..6, y 0..3
        const room2Bounds = floodFillRoom(mapData, 5, 1);
        expect(room2Bounds.minTileX).toBe(3);
        expect(room2Bounds.maxTileX).toBe(6);

        const room2Data = extractRoomData(mapData, room2Bounds);
        expect(room2Data.entities).toEqual([
            { type: 'player', x: 1, y: 1 }, // x: 4 - 3 = 1
        ]);
    });
});
