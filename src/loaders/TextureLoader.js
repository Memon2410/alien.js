/**
 * @author pschroen / https://ufo.ai/
 */

import {
    LinearFilter,
    RGBAFormat,
    RGBFormat,
    Texture,
    Math as ThreeMath
} from 'three';

import { Device } from '../config/Device.js';
import { Thread } from '../utils/Thread.js';
import { ImageBitmapThread } from '../utils/ImageBitmapThread.js';
import { Assets } from './Assets.js';
import { Loader } from './Loader.js';

export class TextureLoader extends Loader {
    constructor(assets, callback) {
        super(assets, callback);

        this.defaultOptions = {
            imageOrientation: 'flipY',
            premultiplyAlpha: 'none'
        };

        this.options = this.defaultOptions;
    }

    load(path, callback) {
        path = Assets.getPath(path);

        const cached = Assets.get(path);

        if (cached) {
            this.total++;

            this.increment();

            if (callback) {
                callback(cached);
            }

            return;
        }

        const texture = new Texture();

        let promise;

        if (Device.agent.includes('chrome')) {
            if (Thread.threads) {
                promise = ImageBitmapThread.load(path, Assets.options, this.options);
            } else {
                promise = fetch(path, Assets.options).then(response => {
                    return response.blob();
                }).then(blob => {
                    return createImageBitmap(blob, this.options);
                });
            }
        } else {
            promise = Assets.loadImage(path);
        }

        promise.then(image => {
            if (image.error) {
                throw new Error(image.error);
            }

            texture.image = image;
            texture.format = /jpe?g/.test(path) ? RGBFormat : RGBAFormat;

            if (!ThreeMath.isPowerOfTwo(image.width, image.height)) {
                texture.minFilter = LinearFilter;
                texture.generateMipmaps = false;
            }

            texture.needsUpdate = true;

            texture.onUpdate = () => {
                if (image.close) {
                    image.close();
                }

                Assets.add(path, texture);

                this.increment();

                if (callback) {
                    callback(texture);
                }

                texture.onUpdate = null;
            };
        }).catch(event => {
            this.increment();

            if (callback) {
                callback(event);
            }
        });

        this.total++;

        return texture;
    }

    setOptions(options) {
        this.options = Object.assign(this.defaultOptions, options);

        return this;
    }
}
