import { Point } from "../../common";
import { TileLayer } from "./tile-layer";

export enum ObjectTile {
    Empty = 0,
    Spawn = 1,
    Goal = 2,
    Platform = 3,
}

// Position of the tile in the tileset.
const tilePositions: Partial<Record<ObjectTile, Point>> = {
    [ObjectTile.Spawn]: { x: 6, y: 0 },
    [ObjectTile.Goal]: { x: 7, y: 0 },
    [ObjectTile.Platform]: { x: 6, y: 1 },
}

export class ObjectLayer extends TileLayer<ObjectTile> {

    renderTile(context: CanvasRenderingContext2D, pos: Point, renderPos: Point): void {
        const tile = this.getTile(pos);

        const tilePos = tilePositions[tile];
        if (!tilePos) {
            return;
        }

        this.drawTile(context, {tilePos, renderPos});
    }
}
