import {
    AnimatedSprite,
    extensions,
    ExtensionType,
    Rectangle,
    Texture,
    type ExtensionMetadataDetails,
    type LoaderParser,
} from 'pixi.js';

/**
 * PixiJS v8 loader for spritesheets exported from Aseprite (File > Export
 * Sprite Sheet, with "JSON Data" + "Tags" enabled).
 *
 * Importing this file registers the loader. After that, load a sprite with:
 *
 *     const asset = await Assets.load<AsepriteAsset>('sprites/player.json');
 *
 * The JSON's `meta.image` is resolved relative to the JSON file and loaded
 * automatically.
 *
 * To avoid clashing with other JSON files (e.g. level data), the loader only
 * handles `.json` files that live in a `sprites/` directory, or whose name
 * contains `aseprite`.
 */

//#region Aseprite JSON data
export interface AsepriteRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface AsepriteSize {
    w: number;
    h: number;
}

export interface AsepriteFrame {
    filename: string;
    frame: AsepriteRect;
    rotated: boolean;
    trimmed: boolean;
    spriteSourceSize: AsepriteRect;
    sourceSize: AsepriteSize;
    /** Duration of the frame in milliseconds. */
    duration: number;
}

export type AsepriteDirection = 'forward' | 'reverse' | 'pingpong';

export interface AsepriteTag {
    name: string;
    from: number;
    to: number;
    direction: AsepriteDirection;
}

export interface AsepriteMeta {
    app: string;
    version: string;
    image: string;
    format: string;
    size: AsepriteSize;
    scale: string;
    frameTags?: AsepriteTag[];
}

export interface AsepriteData {
    frames: AsepriteFrame[] | Record<string, AsepriteFrame>;
    meta: AsepriteMeta;
}
//#endregion

export interface AnimationFrame {
    texture: Texture;
    /** Duration of the frame in milliseconds. */
    time: number;
}

export interface Animation {
    /** Frames in playback order (reverse / pingpong are already expanded). */
    frames: AnimationFrame[];
    /** Total length of the animation, in milliseconds. */
    length: number;
    direction: AsepriteDirection;
}

/** A loaded Aseprite spritesheet, with its frames and tagged animations. */
export class AsepriteAsset<TAnimationNames extends string = string> {
    readonly textures: Record<string, Texture>;
    readonly frameList: Texture[];
    readonly animations: Record<TAnimationNames, Animation>;
    readonly meta: AsepriteMeta;

    constructor(
        textures: Record<string, Texture>,
        frameList: Texture[],
        animations: Record<string, Animation>,
        meta: AsepriteMeta,
    ) {
        this.textures = textures;
        this.frameList = frameList;
        this.animations = animations;
        this.meta = meta;
    }

    getAnimationNames(): TAnimationNames[] {
        return Object.keys(this.animations) as TAnimationNames[];
    }

    hasAnimation(animationName: string): animationName is TAnimationNames {
        return animationName in this.animations;
    }

    getAnimation(animationName: TAnimationNames): Animation {
        const animation = this.animations[animationName];
        if (!animation) {
            throw new Error(
                `Animation '${animationName}' not found. Available: ${this.getAnimationNames().join(', ')}`,
            );
        }
        return animation;
    }

    /**
     * Returns the texture that should be shown `time` seconds into an
     * animation. Driving sprites from game time (rather than Pixi's ticker)
     * keeps animations deterministic, pausable, and in sync with the fixed
     * timestep game loop.
     *
     * If `loop` is false, the last frame is held once the animation ends.
     */
    getFrameTexture(animationName: TAnimationNames, time: number, loop = true): Texture {
        const animation = this.getAnimation(animationName);
        let localTimeMs = 1000 * time;
        if (loop) {
            localTimeMs %= animation.length;
        } else {
            localTimeMs = Math.min(localTimeMs, animation.length - 1);
        }
        let cumulativeTimeMs = 0;
        for (const frame of animation.frames) {
            cumulativeTimeMs += frame.time;
            if (cumulativeTimeMs > localTimeMs) {
                return frame.texture;
            }
        }
        return animation.frames[animation.frames.length - 1].texture;
    }

    /** Animation length in seconds. */
    getAnimationLength(animationName: TAnimationNames): number {
        return this.getAnimation(animationName).length / 1000;
    }

    /**
     * Creates a self-updating AnimatedSprite (driven by Pixi's ticker). Handy
     * for effects, but prefer `getFrameTexture` for gameplay entities.
     */
    createAnimatedSprite(animationName: TAnimationNames, loop = true): AnimatedSprite {
        const animation = this.getAnimation(animationName);
        const sprite = new AnimatedSprite(animation.frames);
        sprite.loop = loop;
        sprite.animationSpeed = 1;
        return sprite;
    }

    /** Get a single texture by frame index. */
    getTexture(frameIndex: number): Texture | undefined {
        return this.frameList[frameIndex];
    }
}

function expandDirection(frames: AnimationFrame[], direction: AsepriteDirection): AnimationFrame[] {
    switch (direction) {
        case 'reverse':
            return frames.slice().reverse();
        case 'pingpong':
            // Play forward, then backward without repeating the end frames.
            return frames.concat(frames.slice(1, -1).reverse());
        default:
            return frames;
    }
}

function makeAnimation(frames: AnimationFrame[], direction: AsepriteDirection): Animation {
    const expanded = expandDirection(frames, direction);
    return {
        frames: expanded,
        length: expanded.reduce((sum, f) => sum + f.time, 0),
        direction,
    };
}

export const asepriteLoader: LoaderParser<AsepriteAsset> = {
    id: 'aseprite-loader',
    name: 'aseprite-loader',
    extension: {
        type: ExtensionType.LoadParser,
        name: 'aseprite-loader',
        priority: 100,
    } as ExtensionMetadataDetails,

    test(url: string) {
        const path = url.split('?')[0];
        return path.endsWith('.json') && (path.includes('sprites/') || path.includes('aseprite'));
    },

    async load(url: string, _asset: any, loader: any) {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to load Aseprite JSON ${url}: ${response.statusText}`);
        }
        const data: AsepriteData = await response.json();

        // The image path is relative to the JSON file.
        const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
        const baseTexture = (await loader.load({ src: baseUrl + data.meta.image })) as Texture;

        const { frames: rawFrames, meta } = data;
        const framesArray: AsepriteFrame[] = Array.isArray(rawFrames)
            ? rawFrames
            : Object.entries(rawFrames).map(([name, frame]) => ({ ...frame, filename: name }));

        const textures: Record<string, Texture> = {};
        const frameList: Texture[] = framesArray.map((frameData, index) => {
            const { frame, sourceSize, spriteSourceSize, filename, trimmed } = frameData;
            const texture = new Texture({
                source: baseTexture.source,
                frame: new Rectangle(frame.x, frame.y, frame.w, frame.h),
                orig: new Rectangle(0, 0, sourceSize.w, sourceSize.h),
                trim: trimmed
                    ? new Rectangle(spriteSourceSize.x, spriteSourceSize.y, spriteSourceSize.w, spriteSourceSize.h)
                    : undefined,
            });
            textures[filename || index.toString()] = texture;
            return texture;
        });

        const toAnimFrame = (i: number): AnimationFrame => ({
            texture: frameList[i],
            time: framesArray[i].duration,
        });

        const animations: Record<string, Animation> = {};
        if (meta.frameTags && meta.frameTags.length > 0) {
            for (const tag of meta.frameTags) {
                const frames: AnimationFrame[] = [];
                for (let i = tag.from; i <= tag.to; i++) {
                    if (framesArray[i]) frames.push(toAnimFrame(i));
                }
                animations[tag.name] = makeAnimation(frames, tag.direction || 'forward');
            }
        } else {
            // No tags: expose every frame as a 'default' animation.
            animations['default'] = makeAnimation(framesArray.map((_, i) => toAnimFrame(i)), 'forward');
        }

        return new AsepriteAsset(textures, frameList, animations, meta);
    },
};

extensions.add(asepriteLoader);
