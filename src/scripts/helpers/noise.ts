/**
 * Seeded 2D noise for terrain, scatter density and anything that should look
 * natural yet come out the same on every visit.
 *
 * `createNoise2D(seed)` returns smooth value noise in -1..1. `fbm` stacks
 * octaves of it into the rolling shape hills have.
 */
export type Noise2D = (x: number, y: number) => number;

/** Smooth noise in -1..1. The same seed always gives the same field. */
export function createNoise2D(seed = 1): Noise2D {
    const hash = (x: number, y: number): number => {
        let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)) | 0;
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
    };
    const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
    return (x, y) => {
        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const tx = fade(x - x0);
        const ty = fade(y - y0);
        const top = hash(x0, y0) + (hash(x0 + 1, y0) - hash(x0, y0)) * tx;
        const bottom = hash(x0, y0 + 1) + (hash(x0 + 1, y0 + 1) - hash(x0, y0 + 1)) * tx;
        return (top + (bottom - top) * ty) * 2 - 1;
    };
}

export type FbmOptions = {
    /** Layers of detail. Each one is finer and fainter than the last. */
    octaves?: number;
    /** How much finer each octave is. */
    lacunarity?: number;
    /** How much fainter each octave is. */
    gain?: number;
};

/** Layered noise in roughly -1..1: broad shapes with smaller bumps on top. */
export function fbm(noise: Noise2D, x: number, y: number, options: FbmOptions = {}): number {
    const octaves = options.octaves ?? 4;
    const lacunarity = options.lacunarity ?? 2;
    const gain = options.gain ?? 0.5;
    let amplitude = 1;
    let frequency = 1;
    let total = 0;
    let range = 0;
    for (let octave = 0; octave < octaves; octave += 1) {
        total += noise(x * frequency, y * frequency) * amplitude;
        range += amplitude;
        amplitude *= gain;
        frequency *= lacunarity;
    }
    return total / range;
}
