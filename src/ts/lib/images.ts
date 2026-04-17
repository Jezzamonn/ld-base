
export const images: {[key: string]: ImageInfo} = {};

export interface ImageInfo {
    image?: HTMLImageElement;
    loaded: boolean;
    loadPromise?: Promise<ImageInfo>;
}

/**
 * Asynchronously fetches an image.
 */
export function loadImage({name, path, extension = 'png'} : {name: string, path: string, extension?: string}): Promise<ImageInfo> {
    if (images.hasOwnProperty(name)) {
        throw new Error(`Already loaded image ${name}.`);
    }

    if (!path.endsWith('/')) {
        path = path + '/';
    }
    const imagePath = `${path}${name}.${extension}`;

    const info: ImageInfo = {
        loaded: false,
        image: undefined,
    };
    images[name] = info;

    const promise = new Promise<ImageInfo>((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
            info.image = image;
            info.loaded = true;
            resolve(info);
        }
        image.onerror = () => {
            reject(`Error loading image ${name}.`)
        }
        image.src = imagePath;
    });
    info.loadPromise = promise;

    return promise;
}

export const Images = {
    loadImage,
    images,
}