import * as THREE from 'three';

import { SYSTEM_ORDER } from '../core/systems';
import { div, setText, setVisible } from '../helpers/dom';

//#region Compass

/**
 * A compass strip along the top of the screen: N, E, S, W slide past as the
 * camera turns, and markers show which way a place lies.
 *
 * North is -z by default, which matches a map drawn with x to the east.
 *
 * ```ts
 * addCompass(game, {
 *     markers: () => [
 *         { glyph: '🏠', position: HOME },
 *         { glyph: '➤', position: questTarget() },
 *     ],
 * });
 * ```
 */
export type CompassMarker = {
    /** Emoji or a short glyph. */
    glyph: string;
    position: Vec3;
    /** Hide it when closer than this, e.g. once the player has arrived. */
    hideWithin?: number;
};

export type AddCompassOptions = {
    /** Places to point at. Asked every frame, so it can follow a quest. */
    markers?: () => CompassMarker[];
    /** World direction of north. Defaults to -z. */
    north?: { x: number; z: number };
    /** Degrees of the horizon visible on the strip. Defaults to 150. */
    span?: number;
    /** Show the four in-between points as well. Defaults to true. */
    intercardinals?: boolean;
};

export type CompassHandle = {
    /** Bearing the camera faces, in degrees: 0 north, 90 east. */
    readonly bearing: number;
    setVisible: (visible: boolean) => void;
    dispose: () => void;
};

const POINTS: Array<[string, number]> = [
    ['N', 0],
    ['NE', 45],
    ['E', 90],
    ['SE', 135],
    ['S', 180],
    ['SW', 225],
    ['W', 270],
    ['NW', 315],
];

export function addCompass(game: Game, options: AddCompassOptions = {}): CompassHandle {
    const root = div('compass click-through', undefined, game.hud.root);
    div('compass-needle', undefined, root);
    const span = options.span ?? 150;
    const north = Math.atan2(options.north?.x ?? 0, -(options.north?.z ?? -1));
    const points = POINTS.filter(([label]) => options.intercardinals !== false || label.length === 1).map(([label, degrees]) => ({
        degrees,
        element: div(label.length === 1 ? 'compass-point is-cardinal' : 'compass-point', label, root),
    }));
    const markers: HTMLElement[] = [];
    const forward = new THREE.Vector3();
    let bearing = 0;

    /** Slide an element to where a bearing sits on the strip, or hide it when it is behind. */
    const position = (element: HTMLElement, degrees: number): void => {
        const offset = ((((degrees - bearing) % 360) + 540) % 360) - 180;
        const shown = Math.abs(offset) <= span / 2;
        setVisible(element, shown);
        if (shown) element.style.left = `${50 + (offset / span) * 100}%`;
    };

    const removeSystem = game.systems.add({
        name: 'compass',
        order: SYSTEM_ORDER.UI,
        update: () => {
            game.camera.getWorldDirection(forward);
            bearing = THREE.MathUtils.radToDeg(Math.atan2(forward.x, -forward.z) - north);
            for (const point of points) position(point.element, point.degrees);

            const wanted = options.markers?.() ?? [];
            const origin = game.player?.position ?? game.camera.position;
            wanted.forEach((marker, index) => {
                const element = (markers[index] ??= div('compass-marker', '', root));
                const dx = marker.position.x - origin.x;
                const dz = marker.position.z - origin.z;
                if (Math.hypot(dx, dz) < (marker.hideWithin ?? 0)) return setVisible(element, false);
                setText(element, marker.glyph);
                position(element, THREE.MathUtils.radToDeg(Math.atan2(dx, -dz) - north));
            });
            for (let index = wanted.length; index < markers.length; index += 1) setVisible(markers[index] as HTMLElement, false);
        },
    });

    return {
        get bearing() {
            return ((bearing % 360) + 360) % 360;
        },
        setVisible: (visible) => setVisible(root, visible),
        dispose: () => {
            removeSystem();
            root.remove();
        },
    };
}

//#endregion Compass
