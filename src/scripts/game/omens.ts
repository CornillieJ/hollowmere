import * as THREE from 'three';

import type { Terrain } from '../kit';

/**
 * What the valley leaves lying about as the days go by: blood on the road, a
 * boot, a dropped basket, drag marks into the trees. Nothing explains any of it.
 * Each sign appears on a set day and stays, so the plains get worse to cross
 * the longer the farmer lives here.
 */
export type OmenKind = 'blood' | 'trail' | 'boot' | 'basket' | 'lantern' | 'shawl' | 'wheel';

type Omen = { kind: OmenKind; x: number; z: number; fromDay: number; yaw?: number };

/** Mostly along the road and across the open ground between it and the pool. */
const OMENS: Omen[] = [
    { kind: 'blood', x: -30, z: 33, fromDay: 2 },
    { kind: 'boot', x: -29, z: 34.5, fromDay: 2, yaw: 0.8 },
    { kind: 'trail', x: -2, z: 9, fromDay: 3, yaw: 2.3 },
    { kind: 'basket', x: 14, z: -7, fromDay: 3 },
    { kind: 'blood', x: 15.5, z: -6, fromDay: 3 },
    { kind: 'lantern', x: 31, z: -22, fromDay: 4, yaw: 1 },
    { kind: 'blood', x: 40, z: 12, fromDay: 4 },
    { kind: 'trail', x: 42, z: 14, fromDay: 4, yaw: 0.6 },
    { kind: 'shawl', x: -40, z: 2, fromDay: 5 },
    { kind: 'wheel', x: -22, z: 52, fromDay: 5, yaw: 0.4 },
    { kind: 'blood', x: -38.5, z: 24, fromDay: 6 },
    { kind: 'trail', x: -37, z: 22.5, fromDay: 6, yaw: -0.4 },
    { kind: 'boot', x: 46, z: -8, fromDay: 7, yaw: 2 },
    { kind: 'blood', x: -55, z: 22, fromDay: 8 },
    { kind: 'basket', x: 60, z: 20, fromDay: 8 },
    { kind: 'blood', x: 36, z: -31, fromDay: 9 },
    { kind: 'trail', x: 34, z: -33, fromDay: 9, yaw: 1.2 },
    { kind: 'shawl', x: -8, z: 40, fromDay: 10 },
];

export const OMEN_THOUGHTS: Record<OmenKind, string[]> = {
    blood: ['Blood. A lot of it, and not old.', 'Nobody in the village said anyone was hurt.'],
    trail: ['Something heavy was dragged through here. Into the trees.'],
    boot: ['One boot. Laced. Whoever wore it did not take it off.'],
    basket: ['A market basket, tipped over. The eggs are still in it.'],
    lantern: ['A lantern, broken. The glass is on the inside. It was dropped while it was lit.'],
    shawl: ['One of Mother Hollis\'s shawls, lying in the grass. Finished. Folded.'],
    wheel: ['A cart wheel. No cart.'],
};

const BLOOD = new THREE.MeshBasicMaterial({ color: 0x3a0a08, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const WOOD = new THREE.MeshStandardMaterial({ color: 0x40342a, roughness: 1, flatShading: true });

function build(kind: OmenKind): THREE.Object3D {
    const group = new THREE.Group();
    const flat = (geometry: THREE.BufferGeometry, x = 0, z = 0): void => {
        const mesh = new THREE.Mesh(geometry, BLOOD);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(x, 0.05, z);
        group.add(mesh);
    };
    if (kind === 'blood') {
        flat(new THREE.CircleGeometry(0.9, 9));
        flat(new THREE.CircleGeometry(0.35, 7), 1.1, 0.4);
        flat(new THREE.CircleGeometry(0.22, 6), -0.9, 0.8);
    } else if (kind === 'trail') {
        for (let index = 0; index < 6; index += 1) flat(new THREE.PlaneGeometry(0.5 - index * 0.05, 1.3), Math.sin(index) * 0.15, index * 1.1);
    } else if (kind === 'boot') {
        const boot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.3, 0.34), new THREE.MeshStandardMaterial({ color: 0x1e1a16, roughness: 1 }));
        boot.position.y = 0.08;
        boot.rotation.z = 1.3;
        group.add(boot);
    } else if (kind === 'basket') {
        const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.22, 0.3, 7, 1, true), new THREE.MeshStandardMaterial({ color: 0x7a6238, roughness: 1, side: THREE.DoubleSide, flatShading: true }));
        basket.position.y = 0.2;
        basket.rotation.z = 1.2;
        group.add(basket);
        for (let index = 0; index < 3; index += 1) {
            const egg = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 4), new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.8 }));
            egg.position.set(0.3 + index * 0.14, 0.05, (index % 2) * 0.12);
            group.add(egg);
        }
    } else if (kind === 'lantern') {
        const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.2), new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.6, flatShading: true }));
        lantern.position.y = 0.1;
        lantern.rotation.z = 1.4;
        group.add(lantern);
    } else if (kind === 'shawl') {
        const shawl = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.45), new THREE.MeshStandardMaterial({ color: 0x5a4a52, roughness: 1 }));
        shawl.position.y = 0.05;
        group.add(shawl);
    } else {
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 4, 10), WOOD);
        wheel.rotation.x = Math.PI / 2 - 0.25;
        wheel.position.y = 0.14;
        group.add(wheel);
    }
    return group;
}

export type OmensHandle = {
    /** Show the signs due by this day. */
    setDay: (day: number) => void;
    /** The kind of sign within reach of a point, if any is showing there. */
    near: (position: THREE.Vector3, reach?: number) => OmenKind | undefined;
    /** How many are showing. */
    readonly showing: number;
};

export function setupOmens(game: Game, terrain: Terrain): OmensHandle {
    const root = new THREE.Group();
    root.name = 'omens';
    game.scene.add(root);
    const placed = OMENS.map((omen) => {
        const object = terrain.place(build(omen.kind), omen.x, omen.z);
        object.rotation.y = omen.yaw ?? 0;
        object.visible = false;
        root.add(object);
        return { omen, object };
    });
    return {
        setDay: (day) => {
            for (const entry of placed) entry.object.visible = day >= entry.omen.fromDay;
        },
        near: (position, reach = 4) => placed.find((entry) => entry.object.visible && Math.hypot(entry.omen.x - position.x, entry.omen.z - position.z) < reach)?.omen.kind,
        get showing() {
            return placed.filter((entry) => entry.object.visible).length;
        },
    };
}
