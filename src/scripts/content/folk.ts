import * as THREE from 'three';

/**
 * The people of Hollowmere, built from primitives.
 *
 * Every character is the same small rig: torso, head, two arms, two legs, and
 * whatever the species adds (ears, snout, horns, tail). Low poly with flat
 * shading, which is what the PS1 picture wants anyway. The rig's parts are named
 * so `FolkAnimator` can swing them; a missing arm is simply not built.
 */
export type Species = 'cat' | 'goat' | 'rabbit' | 'fox' | 'dog' | 'sheep';

export type FolkSpec = {
    species: Species;
    fur: THREE.ColorRepresentation;
    /** Inner ears, snout tip, belly. */
    accent?: THREE.ColorRepresentation;
    clothes: THREE.ColorRepresentation;
    /** Total height in meters. */
    height?: number;
    /** The wrongness. Nobody in the village mentions it. */
    missingArm?: 'left' | 'right';
    eyes?: 'normal' | 'stitched' | 'extra' | 'hollow';
    /** Stretches the neck, 1 is normal. */
    neck?: number;
    /** Leans the head over, in radians. */
    headTilt?: number;
};

export type FolkRig = {
    root: THREE.Group;
    torso: THREE.Object3D;
    head: THREE.Object3D;
    arms: THREE.Object3D[];
    legs: THREE.Object3D[];
    tail: THREE.Object3D | undefined;
};

const materials = new Map<string, THREE.MeshStandardMaterial>();

function material(color: THREE.ColorRepresentation, emissive = 0x000000): THREE.MeshStandardMaterial {
    const key = `${new THREE.Color(color).getHexString()}:${emissive}`;
    let found = materials.get(key);
    if (!found) {
        found = new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, flatShading: true, emissive });
        materials.set(key, found);
    }
    return found;
}

function part(geometry: THREE.BufferGeometry, color: THREE.ColorRepresentation, parent: THREE.Object3D, position: Vec3, emissive?: number): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material(color, emissive));
    mesh.position.set(position.x, position.y, position.z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
}

/** A limb that swings from its top: the pivot sits at the shoulder or hip. */
function limb(parent: THREE.Object3D, at: Vec3, length: number, width: number, color: THREE.ColorRepresentation, name: string): THREE.Object3D {
    const pivot = new THREE.Group();
    pivot.name = name;
    pivot.position.set(at.x, at.y, at.z);
    parent.add(pivot);
    const mesh = part(new THREE.CylinderGeometry(width * 0.9, width, length, 5), color, pivot, { x: 0, y: -length / 2, z: 0 });
    mesh.name = `${name}-mesh`;
    return pivot;
}

export function createFolk(spec: FolkSpec): FolkRig {
    const scale = (spec.height ?? 1.6) / 1.6;
    const root = new THREE.Group();
    root.name = `folk-${spec.species}`;
    const body = new THREE.Group();
    body.scale.setScalar(scale);
    root.add(body);

    const fur = spec.fur;
    const accent = spec.accent ?? new THREE.Color(fur).offsetHSL(0, -0.1, 0.15);
    const legs = [limb(body, { x: -0.11, y: 0.62, z: 0 }, 0.62, 0.08, spec.clothes, 'leg-left'), limb(body, { x: 0.11, y: 0.62, z: 0 }, 0.62, 0.08, spec.clothes, 'leg-right')];

    const torso = new THREE.Group();
    torso.name = 'torso';
    torso.position.y = 0.62;
    body.add(torso);
    part(new THREE.CylinderGeometry(0.17, 0.21, 0.5, 6), spec.clothes, torso, { x: 0, y: 0.25, z: 0 });

    const arms: THREE.Object3D[] = [];
    if (spec.missingArm !== 'left') arms.push(limb(torso, { x: -0.25, y: 0.46, z: 0 }, 0.5, 0.06, fur, 'arm-left'));
    else part(new THREE.CylinderGeometry(0.07, 0.06, 0.09, 5), fur, torso, { x: -0.23, y: 0.42, z: 0 });
    if (spec.missingArm !== 'right') arms.push(limb(torso, { x: 0.25, y: 0.46, z: 0 }, 0.5, 0.06, fur, 'arm-right'));
    else part(new THREE.CylinderGeometry(0.07, 0.06, 0.09, 5), fur, torso, { x: 0.23, y: 0.42, z: 0 });

    const neckLength = 0.08 * (spec.neck ?? 1);
    part(new THREE.CylinderGeometry(0.06, 0.07, neckLength + 0.04, 5), fur, torso, { x: 0, y: 0.5 + neckLength / 2, z: 0 });
    const head = new THREE.Group();
    head.name = 'head';
    head.position.y = 0.52 + neckLength + 0.14;
    head.rotation.z = spec.headTilt ?? 0;
    torso.add(head);
    part(new THREE.IcosahedronGeometry(0.17, 1), fur, head, { x: 0, y: 0, z: 0 });

    addSpeciesFeatures(spec.species, head, fur, accent);
    addEyes(spec.eyes ?? 'normal', head);

    const tail = addTail(spec.species, body, fur, accent);
    return { root, torso, head, arms, legs, tail };
}

function addSpeciesFeatures(species: Species, head: THREE.Object3D, fur: THREE.ColorRepresentation, accent: THREE.ColorRepresentation): void {
    const ear = (x: number, height: number, width: number, lean: number): void => {
        const mesh = part(new THREE.ConeGeometry(width, height, 4), fur, head, { x, y: 0.14 + height / 2, z: -0.02 });
        mesh.rotation.z = -Math.sign(x) * lean;
        const inner = part(new THREE.ConeGeometry(width * 0.5, height * 0.7, 4), accent, mesh, { x: 0, y: -height * 0.05, z: 0.025 });
        inner.castShadow = false;
    };
    const snout = (length: number, width: number): void => {
        const mesh = part(new THREE.ConeGeometry(width, length, 5), accent, head, { x: 0, y: -0.04, z: 0.15 + length / 2 });
        mesh.rotation.x = Math.PI / 2;
        part(new THREE.IcosahedronGeometry(0.022, 0), 0x1a1414, head, { x: 0, y: -0.03, z: 0.16 + length });
    };

    switch (species) {
        case 'cat':
            ear(-0.1, 0.13, 0.06, 0.25);
            ear(0.1, 0.13, 0.06, 0.25);
            snout(0.05, 0.06);
            break;
        case 'rabbit':
            ear(-0.06, 0.34, 0.045, 0.12);
            ear(0.07, 0.3, 0.045, 0.5);
            snout(0.04, 0.06);
            break;
        case 'fox':
            ear(-0.1, 0.16, 0.065, 0.3);
            ear(0.1, 0.16, 0.065, 0.3);
            snout(0.17, 0.065);
            break;
        case 'dog':
            for (const x of [-0.16, 0.16]) {
                const flop = part(new THREE.BoxGeometry(0.06, 0.18, 0.1), accent, head, { x, y: -0.02, z: 0 });
                flop.rotation.z = Math.sign(x) * 0.25;
            }
            snout(0.12, 0.08);
            break;
        case 'goat':
            for (const x of [-0.08, 0.08]) {
                const horn = part(new THREE.ConeGeometry(0.035, 0.24, 4), 0x9a8f7a, head, { x, y: 0.2, z: -0.06 });
                horn.rotation.x = -0.6;
            }
            ear(-0.18, 0.08, 0.04, 1.3);
            ear(0.18, 0.08, 0.04, 1.3);
            snout(0.14, 0.07);
            part(new THREE.ConeGeometry(0.03, 0.12, 4), 0xd8d0c0, head, { x: 0, y: -0.2, z: 0.16 }).rotation.x = Math.PI;
            break;
        case 'sheep':
            for (let index = 0; index < 7; index += 1) {
                const angle = (index / 7) * Math.PI * 2;
                part(new THREE.IcosahedronGeometry(0.08, 0), 0xe8e2d6, head, { x: Math.cos(angle) * 0.14, y: 0.12 + Math.sin(index) * 0.02, z: Math.sin(angle) * 0.1 - 0.02 });
            }
            snout(0.07, 0.07);
            break;
    }
}

function addEyes(kind: NonNullable<FolkSpec['eyes']>, head: THREE.Object3D): void {
    const eye = (x: number, y: number, size: number): void => {
        if (kind === 'hollow') {
            part(new THREE.IcosahedronGeometry(size * 1.2, 0), 0x050404, head, { x, y, z: 0.14 });
            return;
        }
        part(new THREE.IcosahedronGeometry(size, 0), 0xf2ead0, head, { x, y, z: 0.145 });
        part(new THREE.IcosahedronGeometry(size * 0.55, 0), 0x0d0a08, head, { x, y, z: 0.16 + size * 0.5 });
    };
    if (kind === 'stitched') {
        eye(-0.06, 0.03, 0.03);
        // The right eye is sewn shut with three dark stitches.
        for (let index = 0; index < 3; index += 1) {
            const stitch = part(new THREE.BoxGeometry(0.008, 0.06, 0.01), 0x1a0f0a, head, { x: 0.035 + index * 0.025, y: 0.03, z: 0.16 });
            stitch.rotation.z = 0.3;
        }
        return;
    }
    eye(-0.06, 0.03, 0.03);
    eye(0.06, 0.03, 0.03);
    if (kind === 'extra') {
        eye(0, 0.1, 0.022);
        eye(-0.1, 0.09, 0.016);
        eye(0.03, -0.07, 0.014);
    }
}

function addTail(species: Species, body: THREE.Object3D, fur: THREE.ColorRepresentation, accent: THREE.ColorRepresentation): THREE.Object3D | undefined {
    if (species === 'goat' || species === 'sheep') return undefined;
    const pivot = new THREE.Group();
    pivot.name = 'tail';
    pivot.position.set(0, 0.68, -0.18);
    body.add(pivot);
    if (species === 'rabbit') {
        part(new THREE.IcosahedronGeometry(0.06, 0), accent, pivot, { x: 0, y: 0, z: -0.02 });
        return pivot;
    }
    const long = species === 'cat' || species === 'fox';
    const length = long ? 0.5 : 0.22;
    const tail = part(new THREE.CylinderGeometry(0.025, species === 'fox' ? 0.07 : 0.035, length, 5), fur, pivot, { x: 0, y: length / 2, z: -0.02 });
    tail.rotation.x = -0.9;
    tail.position.set(0, length * 0.35, -length * 0.4);
    if (species === 'fox') part(new THREE.IcosahedronGeometry(0.05, 0), 0xf2ead8, tail, { x: 0, y: length / 2, z: 0 });
    return pivot;
}

/**
 * The Hollow: tall, thin, grey, faceless, with arms that hang too long. Same
 * rig as the folk, so the same animator walks it, only slower and wrong.
 */
export function createHollow(seed = 0): FolkRig {
    const height = 2.1 + (seed % 3) * 0.12;
    const skin = new THREE.Color(0x8d8c86).offsetHSL(0, 0, ((seed % 5) - 2) * 0.02);
    const root = new THREE.Group();
    root.name = 'hollow';
    const body = new THREE.Group();
    body.scale.setScalar(height / 2.1);
    root.add(body);

    const legs = [limb(body, { x: -0.1, y: 0.95, z: 0 }, 0.95, 0.06, skin, 'leg-left'), limb(body, { x: 0.1, y: 0.95, z: 0 }, 0.95, 0.06, skin, 'leg-right')];
    const torso = new THREE.Group();
    torso.name = 'torso';
    torso.position.y = 0.95;
    // Hunched forward, which is most of what makes the outline read as wrong.
    torso.rotation.x = 0.35;
    body.add(torso);
    part(new THREE.CylinderGeometry(0.13, 0.1, 0.72, 5), skin, torso, { x: 0, y: 0.36, z: 0 });
    // Ribs, so the torso reads as starved and not as a tube.
    for (let index = 0; index < 4; index += 1) part(new THREE.BoxGeometry(0.26, 0.018, 0.06), skin.clone().offsetHSL(0, 0, -0.08), torso, { x: 0, y: 0.3 + index * 0.07, z: 0.1 });
    const arms = [limb(torso, { x: -0.2, y: 0.66, z: 0 }, 1.05, 0.045, skin, 'arm-left'), limb(torso, { x: 0.2, y: 0.66, z: 0 }, 1.05, 0.045, skin, 'arm-right')];

    const head = new THREE.Group();
    head.name = 'head';
    head.position.set(0, 0.86, 0.06);
    torso.add(head);
    const skull = part(new THREE.IcosahedronGeometry(0.15, 1), skin, head, { x: 0, y: 0, z: 0 });
    skull.scale.set(0.9, 1.25, 1);
    // No face: one dark hollow where it should be.
    const hollow = part(new THREE.IcosahedronGeometry(0.075, 0), 0x050404, head, { x: 0, y: -0.02, z: 0.12 });
    hollow.scale.set(1, 1.6, 0.4);
    return { root, torso, head, arms, legs, tail: undefined };
}

/** One-off motions layered over the walk: chopping, pouring, bending to the ground. */
export type FolkAction = 'swing' | 'pour' | 'reach';

const ACTION_SECONDS: Record<FolkAction, number> = { swing: 0.5, pour: 0.9, reach: 0.45 };

/**
 * Walk, idle, ride and work cycles for a folk rig, from speed alone.
 * `stutter` quantises time, so the Hollow move in jerks like a missing frame.
 */
export class FolkAnimator {
    /** Seated and pedalling instead of walking. */
    riding = false;
    /** 0..1 through an attack, set every frame by whoever drives the rig; 0 for none. */
    strike = 0;

    private phase = Math.random() * 10;
    private idle = Math.random() * 10;
    private action: { kind: FolkAction; elapsed: number } | undefined;
    private readonly baseLean: number;

    constructor(
        private readonly rig: FolkRig,
        private readonly options: { stride?: number; stutter?: number; armSwing?: number } = {},
    ) {
        this.baseLean = rig.torso.rotation.x;
    }

    /** Start a one-off motion. A new one replaces whatever was playing. */
    play(kind: FolkAction): void {
        this.action = { kind, elapsed: 0 };
    }

    /** The arm that holds things: the right one, or the only one. */
    get hand(): THREE.Object3D | undefined {
        return this.rig.arms[this.rig.arms.length - 1];
    }

    update(speed: number, delta: number): void {
        const { rig } = this;
        const stride = this.options.stride ?? 1;
        this.phase += delta * speed * (this.riding ? 1.1 : 3.2 * stride);
        this.idle += delta;
        const step = this.options.stutter ? Math.floor(this.phase * this.options.stutter) / this.options.stutter : this.phase;
        const amount = Math.min(1, speed / 2.5);
        const [left, right] = rig.legs;
        let lean = this.baseLean;

        if (this.riding) {
            // Sitting: thighs forward, feet going round, hands out on the bars, back bent to them.
            const turn = Math.sin(step) * 0.5;
            if (left) left.rotation.x = -0.95 + turn;
            if (right) right.rotation.x = -0.95 - turn;
            for (const arm of rig.arms) arm.rotation.set(-0.95, 0, 0);
            lean += 0.32;
        } else {
            const swing = Math.sin(step) * 0.7 * amount;
            if (left) left.rotation.x = swing;
            if (right) right.rotation.x = -swing;
            const armSwing = this.options.armSwing ?? 0.6;
            rig.arms.forEach((arm, index) => {
                arm.rotation.set((index === 0 ? -swing : swing) * armSwing + (this.options.stutter ? -0.25 : 0), 0, 0);
            });
        }

        // An attack: both arms come up over the head through the wind-up, then down hard.
        if (this.strike > 0) {
            const raised = this.strike < 0.6 ? this.strike / 0.6 : 1 - (this.strike - 0.6) / 0.4;
            for (const arm of rig.arms) arm.rotation.x = -0.25 - raised * 2.5;
            lean += this.strike < 0.6 ? -0.25 * raised : 0.35 * (1 - raised);
        }

        const hand = this.hand;
        if (this.action && hand) {
            this.action.elapsed += delta;
            const t = Math.min(1, this.action.elapsed / ACTION_SECONDS[this.action.kind]);
            if (this.action.kind === 'swing') {
                // Up and back for the first 40%, then down through the trunk.
                const lift = t < 0.4 ? t / 0.4 : 1 - (t - 0.4) / 0.6;
                hand.rotation.x = -0.5 - lift * 2.3;
                rig.torso.rotation.y = (t < 0.4 ? -0.5 : 0.35) * Math.sin(t * Math.PI);
                lean += t >= 0.4 ? 0.3 * Math.sin(((t - 0.4) / 0.6) * Math.PI) : -0.1;
            } else if (this.action.kind === 'pour') {
                // Arm out, wrist tipped, a small rock while the water runs.
                const hold = Math.sin(Math.min(1, t * 4) * (Math.PI / 2)) * (t > 0.85 ? (1 - t) / 0.15 : 1);
                hand.rotation.x = -1.25 * hold;
                hand.rotation.z = (-0.5 + Math.sin(t * 14) * 0.08) * hold;
                lean += 0.18 * hold;
            } else {
                // Bend and reach to the ground with whatever arms there are.
                const bend = Math.sin(t * Math.PI);
                for (const arm of rig.arms) arm.rotation.x = -1 * bend;
                lean += 0.55 * bend;
            }
            if (t >= 1) {
                this.action = undefined;
                rig.torso.rotation.y = 0;
            }
        }

        rig.torso.rotation.x = lean;
        // Breathing when still, a bob when walking.
        rig.torso.position.y = (rig.torso.userData.baseY ??= rig.torso.position.y) + (this.riding ? 0 : Math.abs(Math.sin(step)) * 0.03 * amount) + Math.sin(this.idle * 1.8) * 0.006;
        if (rig.tail) rig.tail.rotation.y = Math.sin(this.idle * 1.3) * 0.35;
        if (this.options.stutter) rig.head.rotation.z = Math.sin(this.idle * 0.7) * 0.25 + (Math.sin(this.idle * 5.3) > 0.97 ? 0.4 : 0);
    }
}

/** The things the farmer can be seen holding. Each hangs from the end of the arm. */
export function createHeldTool(kind: 'axe' | 'watering-can' | 'candle'): THREE.Object3D {
    const group = new THREE.Group();
    group.position.set(0, -0.5, 0.04);
    if (kind === 'axe') {
        const handle = part(new THREE.CylinderGeometry(0.018, 0.018, 0.6, 5), 0x5a4632, group, { x: 0, y: 0, z: 0.26 });
        handle.rotation.x = Math.PI / 2;
        part(new THREE.BoxGeometry(0.03, 0.18, 0.14), 0x8a8e90, group, { x: 0, y: -0.05, z: 0.52 });
    } else if (kind === 'watering-can') {
        part(new THREE.CylinderGeometry(0.09, 0.09, 0.17, 7), 0x6a7a78, group, { x: 0, y: -0.1, z: 0.05 });
        const spout = part(new THREE.CylinderGeometry(0.015, 0.025, 0.26, 5), 0x6a7a78, group, { x: 0, y: -0.06, z: 0.22 });
        spout.rotation.x = 1.1;
    } else {
        part(new THREE.BoxGeometry(0.05, 0.16, 0.05), 0xfff2d0, group, { x: 0, y: -0.06, z: 0.04 }, 0xffc070);
    }
    return group;
}
