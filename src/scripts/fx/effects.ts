import * as THREE from 'three';

import * as CONSTANTS from '../Constants/Constants';
import { div } from '../helpers/dom';
import { SYSTEM_ORDER } from '../core/systems';
import { CameraShake } from './camera-shake';
import { FloatingTextLayer, type FloatingTextOptions } from './floating-text';
import { ParticleSystem, type ParticleBurstOptions } from './particles';

/**
 * The one-stop facade for juice.
 *
 * `Effects` owns the particle pool, the camera shake, the screen flash and the
 * floating text layer, and exposes them as intents: `impact`, `explosion`,
 * `flash`, `hitStop`. Templates wire it up once and gameplay code stays short.
 */
export type EffectsOptions = {
    maxParticles?: number;
    /** Enable the full screen flash overlay. */
    flash?: boolean;
};

export class Effects {
    readonly particles: ParticleSystem;
    readonly shake = new CameraShake();
    readonly floatingText: FloatingTextLayer;

    private readonly game: Game;
    private readonly flashElement: HTMLElement | undefined;

    constructor(game: Game, options: EffectsOptions = {}) {
        this.game = game;
        this.particles = new ParticleSystem(options.maxParticles ?? 2048);
        game.scene.add(this.particles.object);

        const effectsRoot = div('effects-layer', undefined, game.uiRoot);
        effectsRoot.style.position = 'absolute';
        effectsRoot.style.inset = '0';
        effectsRoot.style.pointerEvents = 'none';
        this.floatingText = new FloatingTextLayer(effectsRoot);

        if (options.flash !== false) {
            this.flashElement = div('screen-flash', undefined, effectsRoot);
            Object.assign(this.flashElement.style, {
                position: 'absolute',
                inset: '0',
                opacity: '0',
                pointerEvents: 'none',
            } satisfies Partial<CSSStyleDeclaration>);
        }

        game.systems.add({
            name: 'effects',
            order: 96,
            update: (delta) => this.update(delta),
        });
        game.systems.add({
            name: 'effects-camera-shake',
            order: SYSTEM_ORDER.CAMERA + 5,
            lateUpdate: () => this.shake.applyTo(game.camera),
        });
    }

    //#region Gameplay intents

    /** Sparks and dust where a projectile landed. */
    impact(position: THREE.Vector3, options: { color?: THREE.ColorRepresentation; count?: number; size?: number } = {}): void {
        this.particles.burst(position, {
            count: options.count ?? 18,
            color: options.color ?? 0xffcf7a,
            size: options.size ?? 0.06,
            speed: 5,
            spread: Math.PI / 2.4,
            lifetime: 0.35,
            damping: 0.75,
            gravity: -6,
        });
        this.shake.add(0.12);
    }

    /** Muzzle flash at a barrel position, aimed along the shot direction. */
    muzzle(position: THREE.Vector3, direction: THREE.Vector3): void {
        this.particles.burst(position, {
            count: 10,
            color: 0xffe9a8,
            size: 0.07,
            speed: 7,
            spread: 0.35,
            direction,
            lifetime: 0.12,
            damping: 0.6,
        });
    }

    /** Blood-free, cartoony hit puff for enemies that are not supposed to gore. */
    hitPuff(position: THREE.Vector3, color: THREE.ColorRepresentation = 0x9fe7ff): void {
        this.particles.burst(position, {
            count: 14,
            color,
            size: 0.09,
            speed: 3.5,
            spread: Math.PI,
            lifetime: 0.3,
            damping: 0.6,
        });
    }

    /** Big burst for something that explodes, including a shake and a flash. */
    explosion(position: THREE.Vector3, radius = 3, color: THREE.ColorRepresentation = 0xff8a3d): void {
        this.particles.burst(position, {
            count: 90,
            color,
            size: 0.22 * Math.max(radius / 3, 0.5),
            speed: radius * 2.6,
            spread: Math.PI,
            lifetime: 0.9,
            damping: 0.55,
            gravity: -4,
        });
        this.particles.burst(position, {
            count: 30,
            color: 0x4a4a4a,
            size: 0.4 * Math.max(radius / 3, 0.5),
            speed: radius * 1.2,
            spread: Math.PI,
            lifetime: 1.6,
            damping: 0.4,
            gravity: 1.2,
        });
        this.shake.add(0.8);
        this.flash(0.35, 0xffd2a1, 0.25);
    }

    /** A stream of particles that follows a moving position, e.g. an engine exhaust. */
    stream(position: THREE.Vector3, options: ParticleBurstOptions = {}): void {
        this.particles.burst(position, { count: 2, size: 0.1, lifetime: 0.5, speed: 0.6, damping: 0.4, ...options });
    }

    /** Show a number in world space, e.g. damage or gained resources. */
    text(position: THREE.Vector3, text: string, options: FloatingTextOptions = {}): void {
        this.floatingText.spawn(position, text, options);
    }

    /** Damage number with the conventional colour ramp. */
    damageText(position: THREE.Vector3, amount: number, options: FloatingTextOptions = {}): void {
        const rounded = Math.round(amount);
        this.floatingText.spawn(position, rounded > 0 ? `-${rounded}` : '+0', { color: 0xff7a7a, ...options });
    }

    /** Heal number, green and rising. */
    healText(position: THREE.Vector3, amount: number, options: FloatingTextOptions = {}): void {
        this.floatingText.spawn(position, `+${Math.round(amount)}`, { color: 0x7affa1, ...options });
    }

    /** Full screen colour flash, e.g. taking damage. */
    flash(opacity = 0.3, color: THREE.ColorRepresentation = 0xffffff, duration = 0.2): void {
        if (!this.flashElement) return;
        this.flashElement.style.background = new THREE.Color(color).getStyle();
        this.flashElement.style.transition = `opacity ${duration}s ease-out`;
        this.flashElement.style.opacity = String(opacity);
        requestAnimationFrame(() => {
            if (this.flashElement) this.flashElement.style.opacity = '0';
        });
    }

    /**
     * Briefly slow time on a hit so impacts land harder.
     * Uses the game clock, so it also freezes tweens.
     */
    hitStop(seconds: number = CONSTANTS.FEEL.HIT_STOP, scale = 0.05): void {
        this.game.time.slowMotion(seconds, scale);
    }

    /** Turn off for players who get queasy; `shakeCamera` then does nothing. A setting usually owns this. */
    shakeEnabled = true;

    /** Shake the camera. `0.2` is a hit, `1` is an explosion. */
    shakeCamera(amount: number): void {
        if (this.shakeEnabled) this.shake.add(amount);
    }

    //#endregion Gameplay intents

    /** Called every frame by the effects system. */
    update(delta: number): void {
        this.particles.update(delta);
        this.shake.update(delta);
        this.floatingText.update(delta, this.game.camera, this.game.sizes);
    }

    /** Remove everything Effects created. */
    dispose(): void {
        this.particles.object.removeFromParent();
        this.particles.dispose();
        this.floatingText.dispose();
        this.flashElement?.remove();
    }
}
