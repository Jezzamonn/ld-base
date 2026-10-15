import { LevelData, LevelEntity } from './level';
import { BaseTile } from './tile/base-layer';

export interface RoomBounds {
    /** Inclusive tile coordinates in the full map, including boundary tiles on all edges */
    minTileX: number;
    minTileY: number;
    maxTileX: number;
    maxTileY: number;
}

/**
 * Flood fills from a non-boundary starting tile to find the extent of the room.
 * Returns bounds that include the surrounding boundary tiles.
 */
export function floodFillRoom(data: LevelData, startX: number, startY: number): RoomBounds {
    const height = data.tiles.length;
    const width = height > 0 ? data.tiles[0].length : 0;

    const visited: boolean[][] = Array.from({ length: height }, () => new Array(width).fill(false));
    const stack: { x: number; y: number }[] = [{ x: startX, y: startY }];

    let minX = startX, minY = startY, maxX = startX, maxY = startY;

    while (stack.length > 0) {
        const { x, y } = stack.pop()!;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        if (visited[y][x]) continue;
        if (data.tiles[y][x] === BaseTile.Boundary) continue;

        visited[y][x] = true;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;

        stack.push({ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 });
    }

    return {
        minTileX: Math.max(0, minX - 1),
        minTileY: Math.max(0, minY - 1),
        maxTileX: Math.min(width - 1, maxX + 1),
        maxTileY: Math.min(height - 1, maxY + 1),
    };
}

/**
 * Extracts a sub-region of the full map data corresponding to the given room bounds.
 * Entity positions are translated to room-local tile coordinates.
 */
export function extractRoomData(data: LevelData, bounds: RoomBounds): LevelData {
    const roomHeight = bounds.maxTileY - bounds.minTileY + 1;
    const roomWidth = bounds.maxTileX - bounds.minTileX + 1;

    const tiles: number[][] = [];
    let objectTiles: number[][] | undefined = undefined;
    if (data.objectTiles) {
        objectTiles = [];
    }
    const entities: LevelEntity[] = [];

    for (let ry = 0; ry < roomHeight; ry++) {
        const fy = ry + bounds.minTileY;
        tiles[ry] = [];
        if (objectTiles) objectTiles[ry] = [];
        for (let rx = 0; rx < roomWidth; rx++) {
            const fx = rx + bounds.minTileX;
            tiles[ry][rx] = data.tiles[fy]?.[fx] ?? 0;
            if (objectTiles && data.objectTiles) {
                objectTiles[ry][rx] = data.objectTiles[fy]?.[fx] ?? 0;
            }
        }
    }

    for (const entity of data.entities) {
        if (
            entity.x >= bounds.minTileX && entity.x <= bounds.maxTileX &&
            entity.y >= bounds.minTileY && entity.y <= bounds.maxTileY
        ) {
            entities.push({
                type: entity.type,
                x: entity.x - bounds.minTileX,
                y: entity.y - bounds.minTileY,
            });
        }
    }

    return { tiles, objectTiles, entities };
}
