import * as THREE from 'three';

import { div } from '../helpers/dom';

/**
 * Floating world-space text rendered with DOM.
 *
 * Damage numbers, "+1 wood", quest markers. DOM text stays crisp at any
 * resolution and costs nothing on the GPU, which makes it the right tool for
 * numbers that change every frame.
 */
export type FloatingTextOptions = {
    /** Colour of the text, defaults to white. */
    color?: THREE.ColorRepresentation;
    /** Font size in pixels. */
    fontSize?: number;
    /** Seconds the text stays on screen. */
    duration?: number;
    /** Meters the text drifts upwards over its lifetime. */
    rise?: number;
    /** Extra horizontal drift in meters, random by default when `spread` is set. */
    spread?: number;
    /** Bold weight, on by default. */
    bold?: boolean;
    /** Outline that keeps the text readable over bright scenery. */
    outline?: boolean;
};

type Entry = {
    element: HTMLElement;
    position: THREE.Vector3;
    drift: THREE.Vector3;
    age: number;
    duration: number;
    rise: number;
};

const DEFAULTS = {
    duration: 1.1,
    rise: 1.2,
    fontSize: 18,
};

export class FloatingTextLayer {
    /** Maximum number of live labels; older ones are recycled. */
    maxEntries = 64;

    private readonly container: HTMLElement;
    private readonly entries: Entry[] = [];
    private readonly projected = new THREE.Vector3();

    constructor(parent: HTMLElement) {
        this.container = div('float-text-layer', undefined, parent);
        this.container.style.position = 'absolute';
        this.container.style.inset = '0';
        this.container.style.pointerEvents = 'none';
    }

    /** Number of labels currently on screen. */
    get activeCount(): number {
        return this.entries.length;
    }

    /** Spawn a label at a world position. */
    spawn(position: THREE.Vector3, text: string, options: FloatingTextOptions = {}): void {
        if (this.entries.length >= this.maxEntries) {
            const oldest = this.entries[0];
            if (oldest) this.remove(oldest);
        }

        const element = div('float-text', text, this.container);
        element.style.color = new THREE.Color(options.color ?? 0xffffff).getStyle();
        element.style.fontSize = `${options.fontSize ?? DEFAULTS.fontSize}px`;
        element.style.fontWeight = options.bold === false ? '500' : '700';
        if (options.outline !== false) element.style.textShadow = '0 2px 6px rgba(0, 0, 0, 0.9), 0 0 2px #000';

        const spread = options.spread ?? 0;
        this.entries.push({
            element,
            position: position.clone(),
            drift: new THREE.Vector3((Math.random() * 2 - 1) * spread, 0, (Math.random() * 2 - 1) * spread),
            age: 0,
            duration: options.duration ?? DEFAULTS.duration,
            rise: options.rise ?? DEFAULTS.rise,
        });
    }

    /**
     * Reposition and fade every label.
     * Call from the game loop, after the camera has been moved.
     */
    update(delta: number, camera: THREE.Camera, sizes: Sizes): void {
        for (let index = this.entries.length - 1; index >= 0; index -= 1) {
            const entry = this.entries[index]!;
            entry.age += delta;
            if (entry.age >= entry.duration) {
                this.remove(entry);
                continue;
            }

            const t = entry.age / entry.duration;
            this.projected.copy(entry.position).project(camera);
            const visible = this.projected.z > -1 && this.projected.z < 1;
            entry.element.style.display = visible ? '' : 'none';
            if (!visible) continue;

            const x = ((this.projected.x + 1) / 2) * sizes.width;
            const y = ((1 - this.projected.y) / 2) * sizes.height - t * entry.rise * 60;
            entry.element.style.transform = `translate(-50%, -50%) translate(${x + entry.drift.x * t * 60}px, ${y + entry.drift.z * t * 60}px)`;
            entry.element.style.opacity = String(1 - t * t);
        }
    }

    /** Remove every label, e.g. when the level restarts. */
    clear(): void {
        for (const entry of [...this.entries]) this.remove(entry);
    }

    dispose(): void {
        this.clear();
        this.container.remove();
    }

    private remove(entry: Entry): void {
        const index = this.entries.indexOf(entry);
        if (index >= 0) this.entries.splice(index, 1);
        entry.element.remove();
    }
}
