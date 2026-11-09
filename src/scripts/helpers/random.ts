import * as THREE from 'three';

/**
 * Random helpers with a seedable generator.
 *
 * `Random` is a small xorshift generator, so a level built from it can be
 * rebuilt exactly by saving the seed. The free functions use `Math.random` and
 * are meant for non-critical variety.
 */

export class Random {
    private state: number;

    /** @param seed Any integer. The same seed always produces the same sequence. */
    constructor(seed = Date.now()) {
        this.state = seed | 0 || 1;
    }

    /** Uniform float in `0..1`. */
    next(): number {
        let x = this.state;
        x ^= x << 13;
        x ^= x >>> 17;
        x ^= x << 5;
        this.state = x | 0;
        return (x >>> 0) / 0x100000000;
    }

    /** Uniform float in `min..max`. */
    range(min: number, max: number): number {
        return min + this.next() * (max - min);
    }

    /** Uniform integer in `min..max`, both included. */
    int(min: number, max: number): number {
        return Math.floor(this.range(min, max + 1));
    }

    /** True with the given probability in `0..1`. */
    chance(probability: number): boolean {
        return this.next() < probability;
    }

    /** Random element, `undefined` for an empty list. */
    pick<T>(items: readonly T[]): T | undefined {
        if (items.length === 0) return undefined;
        return items[this.int(0, items.length - 1)];
    }

    /** A new array with the items shuffled, the input is not modified. */
    shuffle<T>(items: readonly T[]): T[] {
        const copy = [...items];
        for (let index = copy.length - 1; index > 0; index -= 1) {
            const swap = this.int(0, index);
            const a = copy[index] as T;
            copy[index] = copy[swap] as T;
            copy[swap] = a;
        }
        return copy;
    }

    /** A random unit vector on the sphere surface, written into `out`. */
    direction(out = new THREE.Vector3()): THREE.Vector3 {
        const z = this.range(-1, 1);
        const angle = this.range(0, Math.PI * 2);
        const radius = Math.sqrt(Math.max(0, 1 - z * z));
        return out.set(Math.cos(angle) * radius, z, Math.sin(angle) * radius);
    }

    /** A random point inside a sphere, written into `out`. */
    pointInSphere(radius: number, out = new THREE.Vector3()): THREE.Vector3 {
        return this.direction(out).multiplyScalar(radius * Math.cbrt(this.next()));
    }
}

/** Uniform float in `min..max` from `Math.random`. */
export function randomFloat(min = 0, max = 1): number {
    return min + Math.random() * (max - min);
}

/** Uniform integer in `min..max`, both included. */
export function randomInt(min: number, max: number): number {
    return Math.floor(randomFloat(min, max + 1));
}

/** True with the given probability. */
export function randomChance(probability: number): boolean {
    return Math.random() < probability;
}

/** A random element, `undefined` for an empty list. */
export function randomPick<T>(items: readonly T[]): T | undefined {
    if (items.length === 0) return undefined;
    return items[randomInt(0, items.length - 1)];
}
