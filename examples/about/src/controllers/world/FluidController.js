import {
    HalfFloatType,
    Vector2,
    WebGLRenderTarget
} from 'three';

import { Stage } from 'alien.js';

import { Events } from '../../config/Events.js';
import { Global } from '../../config/Global.js';
import { Data } from '../../data/Data.js';
import { AudioController } from '../audio/AudioController.js';
import { Tracker } from '../../views/ui/Tracker.js';
import { FluidPassMaterial } from '../../materials/FluidPassMaterial.js';
import { FluidViewMaterial } from '../../materials/FluidViewMaterial.js';

export class FluidController {
    static init(renderer, scene, camera, screen, trackers) {
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;
        this.screen = screen;
        this.trackers = trackers;

        this.pointer = {};
        this.width = 1;
        this.height = 1;

        this.initRenderer();
        this.initPointers();

        this.addListeners();
    }

    static initRenderer() {
        // Render targets
        this.renderTargetA = new WebGLRenderTarget(this.width, this.height, {
            type: HalfFloatType,
            depthBuffer: false,
            stencilBuffer: false
        });
        this.renderTargetA.texture.generateMipmaps = false;
        this.renderTargetB = this.renderTargetA.clone();

        // Fluid materials
        this.passMaterial = new FluidPassMaterial();
        this.viewMaterial = new FluidViewMaterial();
    }

    static initPointers() {
        for (let i = 0; i < Global.NUM_POINTERS; i++) {
            this.passMaterial.uniforms.uMouse.value[i] = new Vector2(0.5, 0.5);
            this.passMaterial.uniforms.uLast.value[i] = new Vector2(0.5, 0.5);
            this.passMaterial.uniforms.uVelocity.value[i] = new Vector2();
            this.passMaterial.uniforms.uStrength.value[i] = new Vector2();
        }

        this.pointer.main = {};
        this.pointer.main.isMove = false;
        this.pointer.main.isDown = false;
        this.pointer.main.pos = new Vector2();
        this.pointer.main.last = new Vector2();
        this.pointer.main.delta = new Vector2();
        this.pointer.main.pos.set(this.width / 2, this.height / 2);
        this.pointer.main.last.copy(this.pointer.main.pos);
    }

    static addListeners() {
        Stage.events.on(Events.UPDATE, this.onUsers);
        Stage.element.addEventListener('touchstart', this.onTouchStart);
        Stage.element.addEventListener('mousedown', this.onTouchStart);
        window.addEventListener('touchmove', this.onTouchMove);
        window.addEventListener('mousemove', this.onTouchMove);
        window.addEventListener('touchend', this.onTouchEnd);
        window.addEventListener('touchcancel', this.onTouchEnd);
        window.addEventListener('mouseup', this.onTouchEnd);
        Data.Socket.on('motion', this.onMotion);
    }

    /**
     * Event handlers
     */

    static onUsers = e => {
        const ids = e.map(user => user.id);

        Object.keys(this.pointer).forEach((id, i) => {
            if (id === 'main') {
                return;
            }

            if (ids.includes(id)) {
                this.pointer[id].tracker.setData(Data.getUser(id));
            } else {
                this.pointer[id].tracker.animateOut(() => {
                    this.pointer[id].tracker.destroy();

                    delete this.pointer[id];

                    this.passMaterial.uniforms.uMouse.value[i] = new Vector2(0.5, 0.5);
                    this.passMaterial.uniforms.uLast.value[i] = new Vector2(0.5, 0.5);
                    this.passMaterial.uniforms.uVelocity.value[i] = new Vector2();
                    this.passMaterial.uniforms.uStrength.value[i] = new Vector2();

                    AudioController.remove(id);
                });
            }
        });
    };

    static onTouchStart = e => {
        e.preventDefault();

        if (!this.animatedIn) {
            return;
        }

        this.pointer.main.isDown = true;

        this.onTouchMove(e);
    };

    static onTouchMove = e => {
        if (!this.animatedIn) {
            return;
        }

        const event = {};

        if (e.changedTouches && e.changedTouches.length) {
            event.x = e.changedTouches[0].pageX;
            event.y = e.changedTouches[0].pageY;
        } else {
            event.x = e.clientX;
            event.y = e.clientY;
        }

        this.pointer.main.isMove = true;
        this.pointer.main.pos.copy(event);

        this.send(event);
    };

    static onTouchEnd = e => {
        if (!this.animatedIn) {
            return;
        }

        this.pointer.main.isDown = false;

        this.onTouchMove(e);
    };

    static onMotion = e => {
        if (!this.pointer[e.id]) {
            if (Object.keys(this.pointer).length >= Global.NUM_POINTERS) {
                return;
            }

            this.pointer[e.id] = {};
            this.pointer[e.id].isDown = false;
            this.pointer[e.id].pos = new Vector2();
            this.pointer[e.id].last = new Vector2();
            this.pointer[e.id].delta = new Vector2();
            this.pointer[e.id].target = new Vector2();
            this.pointer[e.id].target.set(e.x * this.width, e.y * this.height);
            this.pointer[e.id].pos.copy(this.pointer[e.id].target);
            this.pointer[e.id].last.copy(this.pointer[e.id].pos);
            this.pointer[e.id].tracker = this.trackers.add(new Tracker());
            this.pointer[e.id].tracker.css({ left: Math.round(this.pointer[e.id].pos.x), top: Math.round(this.pointer[e.id].pos.y) });
            this.pointer[e.id].tracker.setData(Data.getUser(e.id));
            this.pointer[e.id].frame = 0;
        }

        this.pointer[e.id].isDown = e.isDown;
        this.pointer[e.id].target.set(e.x * this.width, e.y * this.height);
        this.pointer[e.id].frame = 0;
    };

    /**
     * Public methods
     */

    static resize = (width, height, dpr) => {
        this.width = width;
        this.height = height;

        this.renderTargetA.setSize(width * dpr, height * dpr);
        this.renderTargetB.setSize(width * dpr, height * dpr);

        this.pointer.main.pos.set(this.width / 2, this.height / 2);
        this.pointer.main.last.copy(this.pointer.main.pos);
    };

    static update = () => {
        if (!this.animatedIn) {
            return;
        }

        Object.keys(this.pointer).forEach((id, i) => {
            if (id !== 'main') {
                this.pointer[id].frame++;

                if (this.pointer[id].frame > 100) {
                    return;
                }

                this.pointer[id].pos.lerp(this.pointer[id].target, 0.07);
                this.pointer[id].tracker.css({ left: Math.round(this.pointer[id].pos.x), top: Math.round(this.pointer[id].pos.y) });

                if (!this.pointer[id].tracker.animatedIn) {
                    this.pointer[id].tracker.animateIn();
                }
            }

            this.pointer[id].delta.subVectors(this.pointer[id].pos, this.pointer[id].last);
            this.pointer[id].last.copy(this.pointer[id].pos);

            const distance = Math.min(10, this.pointer[id].delta.length()) / 10;

            this.passMaterial.uniforms.uLast.value[i].copy(this.passMaterial.uniforms.uMouse.value[i]);
            this.passMaterial.uniforms.uMouse.value[i].set(this.pointer[id].pos.x / this.width, (this.height - this.pointer[id].pos.y) / this.height);
            this.passMaterial.uniforms.uVelocity.value[i].copy(this.pointer[id].delta);
            this.passMaterial.uniforms.uStrength.value[i].set((id === 'main' && !this.pointer[id].isMove) || this.pointer[id].isDown ? 50 : 50 * distance, 50 * distance);

            AudioController.update(id, this.pointer[id].pos.x, this.pointer[id].pos.y);
        });

        this.passMaterial.uniforms.tMap.value = this.renderTargetA.texture;
        this.screen.material = this.passMaterial;
        this.renderer.setRenderTarget(this.renderTargetB);
        this.renderer.render(this.scene, this.camera);

        this.viewMaterial.uniforms.tMap.value = this.renderTargetB.texture;
        this.screen.material = this.viewMaterial;
        this.renderer.setRenderTarget(null);
        this.renderer.render(this.scene, this.camera);

        // Swap render targets
        const renderTarget = this.renderTargetA;
        this.renderTargetA = this.renderTargetB;
        this.renderTargetB = renderTarget;
    };

    static send = e => {
        Data.Socket.send('motion', {
            isDown: this.pointer.main.isDown,
            x: e.x / this.width,
            y: e.y / this.height
        });
    };

    static animateIn = () => {
        this.animatedIn = true;
    };
}
