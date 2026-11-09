import * as THREE from 'three';

import { SYSTEM_ORDER } from '../core/systems';

/**
 * A corner minimap: a small 2D canvas redrawn a few times a second.
 *
 * The map centers on the courier, optionally rotates with their heading, and
 * draws whatever static geometry (roads) plus live markers (the beacon, the
 * van, rivals) the game hands it. It is deliberately a canvas, not a second
 * scene render: a 2D top-down redraw costs almost nothing.
 */
export type MinimapMarker = {
    /** World position. */
    position: THREE.Vector3 | Vec3;
    /** Dot colour. */
    color: string;
    /** Radius in pixels. Defaults to 3. */
    size?: number;
    /** Draw as a triangle pointing along the yaw, e.g. for the player. */
    heading?: number;
};

export type MinimapOptions = {
    /** Canvas size in CSS pixels. Defaults to 148. */
    size?: number;
    /** Meters of world the map spans. Defaults to 90. */
    zoom?: number;
    /** The point the map follows. Defaults to the player or the camera. */
    follow?: () => THREE.Vector3;
    /** Heading source, for a rotating map. */
    heading?: () => number;
    /** Rotate the map so "up" is the heading. Defaults to false (north up). */
    rotate?: boolean;
    /** Live markers, called every redraw. */
    markers?: () => MinimapMarker[];
    /** Static geometry drawn under the markers, e.g. the road network. */
    drawStatic?: (context: CanvasRenderingContext2D, toMap: (x: number, z: number) => [number, number]) => void;
    /** Frames between redraws. Defaults to 3. */
    interval?: number;
};

export class Minimap {
    readonly root: HTMLCanvasElement;

    private readonly context: CanvasRenderingContext2D;
    private readonly game: Game;
    private readonly options: MinimapOptions;
    private frame = 0;
    private readonly detach: () => void;

    constructor(game: Game, options: MinimapOptions = {}) {
        this.game = game;
        this.options = options;
        this.root = document.createElement('canvas');
        this.root.className = 'minimap';
        const size = options.size ?? 148;
        this.root.width = size * 2; // retina
        this.root.height = size * 2;
        this.root.style.width = `${size}px`;
        this.root.style.height = `${size}px`;
        game.screens.layer('hud').appendChild(this.root);
        const context = this.root.getContext('2d');
        if (!context) throw new Error('minimap: no 2d context');
        this.context = context;

        this.detach = game.systems.add({
            name: 'minimap',
            order: SYSTEM_ORDER.UI,
            update: () => {
                this.frame += 1;
                if (this.frame % (options.interval ?? 3) === 0) this.draw();
            },
        });
    }

    show(visible: boolean): void {
        this.root.classList.toggle('is-hidden', !visible);
    }

    dispose(): void {
        this.detach();
        this.root.remove();
    }

    //#region Internals

    private draw(): void {
        const { context: ctx } = this;
        const size = this.root.width;
        const zoom = this.options.zoom ?? 90;
        const center = this.options.follow?.() ?? this.game.player?.position ?? this.game.camera.position;
        const heading = this.options.heading?.() ?? 0;

        ctx.clearRect(0, 0, size, size);
        ctx.save();
        ctx.translate(size / 2, size / 2);
        if (this.options.rotate) ctx.rotate(-heading);

        const scale = size / zoom;
        // The canvas transform handles the rotation; markers just need the offset.
        const toMap = (x: number, z: number): [number, number] => [(x - center.x) * scale, (z - center.z) * scale];

        // Ground disc.
        ctx.beginPath();
        ctx.arc(0, 0, size / 2 - 2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(8, 10, 16, 0.72)';
        ctx.fill();
        ctx.clip();

        this.options.drawStatic?.(ctx, toMap);

        for (const marker of this.options.markers?.() ?? []) {
            const [mx, my] = toMap(marker.position.x, marker.position.z);
            if (marker.heading !== undefined) {
                ctx.save();
                ctx.translate(mx, my);
                ctx.rotate(marker.heading);
                ctx.beginPath();
                ctx.moveTo(0, -(marker.size ?? 5));
                ctx.lineTo((marker.size ?? 5) * 0.7, marker.size ?? 5);
                ctx.lineTo(-(marker.size ?? 5) * 0.7, marker.size ?? 5);
                ctx.closePath();
                ctx.fillStyle = marker.color;
                ctx.fill();
                ctx.restore();
            } else {
                ctx.beginPath();
                ctx.arc(mx, my, marker.size ?? 3, 0, Math.PI * 2);
                ctx.fillStyle = marker.color;
                ctx.fill();
            }
        }

        ctx.restore();

        // Rim.
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    //#endregion Internals
}
