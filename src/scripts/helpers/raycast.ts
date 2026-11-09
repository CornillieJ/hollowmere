import * as THREE from 'three';

/**
 * Picking and projecting with the shared raycaster.
 *
 * These work in screen space and against three.js objects. For physics-accurate
 * queries use `physics/queries.ts` instead; the two are complementary.
 */

/** A ray in world space, as produced by `screenToRay`. */
export type ScreenRay = { origin: THREE.Vector3; direction: THREE.Vector3 };

/**
 * Build a world space ray from a screen position.
 * @param game The game hub, used for camera and raycaster.
 * @param ndc Cursor in normalised device coordinates, defaults to the centre of the screen.
 */
export function screenToRay(game: Game, ndc = new THREE.Vector2(0, 0), out?: ScreenRay): ScreenRay {
    game.raycaster.setFromCamera(ndc, game.camera);
    const origin = out?.origin ?? new THREE.Vector3();
    const direction = out?.direction ?? new THREE.Vector3();
    origin.copy(game.raycaster.ray.origin);
    direction.copy(game.raycaster.ray.direction);
    return { origin, direction };
}

/**
 * Nearest object under the cursor.
 * @param targets Objects or groups to test against.
 */
export function pickFromCamera(game: Game, targets: THREE.Object3D[], ndc = new THREE.Vector2(0, 0), recursive = true): THREE.Intersection | undefined {
    game.raycaster.setFromCamera(ndc, game.camera);
    return game.raycaster.intersectObjects(targets, recursive)[0];
}

/** Every object under the cursor, sorted near to far. */
export function pickAllFromCamera(game: Game, targets: THREE.Object3D[], ndc = new THREE.Vector2(0, 0), recursive = true): THREE.Intersection[] {
    game.raycaster.setFromCamera(ndc, game.camera);
    return game.raycaster.intersectObjects(targets, recursive);
}

/** Nearest object under the cursor whose userData matches the tag. */
export function pickByTag(game: Game, targets: THREE.Object3D[], tag: string, ndc = new THREE.Vector2(0, 0)): THREE.Intersection | undefined {
    return pickAllFromCamera(game, targets, ndc).find((hit) => {
        let current: THREE.Object3D | null = hit.object;
        while (current) {
            if (current.userData.tag === tag) return true;
            current = current.parent;
        }
        return false;
    });
}

/** World position of a click on the given surfaces, e.g. the floor. */
export function groundPointFromCamera(game: Game, surfaces: THREE.Object3D[], ndc = new THREE.Vector2(0, 0)): THREE.Vector3 | undefined {
    return pickFromCamera(game, surfaces, ndc)?.point.clone();
}

/**
 * Project a world position onto the screen.
 * @param out Receives normalised device coordinates, z carries the depth.
 */
export function worldToScreen(game: Game, position: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(position).project(game.camera);
}

/** Normalised device coordinates to pixels, origin top-left. */
export function ndcToPixels(ndc: THREE.Vector2 | THREE.Vector3, sizes: Sizes, out = new THREE.Vector2()): THREE.Vector2 {
    return out.set(((ndc.x + 1) / 2) * sizes.width, ((1 - ndc.y) / 2) * sizes.height);
}

/** Pixels to normalised device coordinates. */
export function pixelsToNdc(x: number, y: number, sizes: Sizes, out = new THREE.Vector2()): THREE.Vector2 {
    return out.set((x / sizes.width) * 2 - 1, -(y / sizes.height) * 2 + 1);
}

/** True when a world position projects inside the viewport and is in front of the camera. */
export function isOnScreen(game: Game, position: THREE.Vector3, margin = 0): boolean {
    const projected = worldToScreen(game, position);
    const withinDepth = projected.z > -1 && projected.z < 1;
    const withinBounds = projected.x >= -1 - margin && projected.x <= 1 + margin && projected.y >= -1 - margin && projected.y <= 1 + margin;
    return withinDepth && withinBounds;
}

/** Distance from the camera to a hit, handy for range checks on a pick. */
export function hitDistance(game: Game, hit: THREE.Intersection): number {
    return game.camera.position.distanceTo(hit.point);
}
