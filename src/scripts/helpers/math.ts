/**
 * Scalar maths. Frame-rate independent helpers are marked as such.
 */

/** Constrain `value` to the range `min..max`. */
export function clamp(value: number, min: number, max: number): number {
    return value < min ? min : value > max ? max : value;
}

/** Constrain `value` to `0..1`. */
export function clamp01(value: number): number {
    return clamp(value, 0, 1);
}

/** Linear interpolation, `t` is not clamped so overshoot is allowed. */
export function lerp(from: number, to: number, t: number): number {
    return from + (to - from) * t;
}

/**
 * Frame-rate independent smoothing, the "exponential damp" used by every engine.
 * `smoothing` is the fraction of the remaining distance left after one second,
 * so 0.1 is fast and 0.9 is slow. Never overshoots, unlike `lerp(a, b, 0.1)`.
 */
export function damp(from: number, to: number, smoothing: number, delta: number): number {
    return lerp(from, to, 1 - Math.pow(smoothing, delta));
}

/** `damp` for angles in radians: always turns the short way round, never through a full circle. */
export function dampAngle(from: number, to: number, smoothing: number, delta: number): number {
    const difference = Math.atan2(Math.sin(to - from), Math.cos(to - from));
    return from + difference * (1 - Math.pow(smoothing, delta));
}

/** Move `from` towards `to` by at most `maxDelta`, without overshooting. */
export function moveTowards(from: number, to: number, maxDelta: number): number {
    const difference = to - from;
    if (Math.abs(difference) <= maxDelta) return to;
    return from + Math.sign(difference) * maxDelta;
}

/** Move `value` from one range to another, e.g. `remap(x, 0, 1, -1, 1)`. */
export function remap(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
    if (inMax === inMin) return outMin;
    return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
}

/** Hermite smoothing of `t` in `0..1`, zero slope at both ends. */
export function smoothstep(t: number): number {
    const x = clamp01(t);
    return x * x * (3 - 2 * x);
}

/** Smoother variant of `smoothstep` using a quintic curve. */
export function smootherstep(t: number): number {
    const x = clamp01(t);
    return x * x * x * (x * (x * 6 - 15) + 10);
}

/** Wrap an angle in radians into `-PI..PI`. */
export function wrapAngle(angle: number): number {
    return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/** Shortest signed difference from `from` to `to`, in `-PI..PI`. */
export function angleDifference(from: number, to: number): number {
    return wrapAngle(to - from);
}

/** Step an angle towards a target along the shortest path. */
export function moveTowardsAngle(from: number, to: number, maxDelta: number): number {
    return wrapAngle(from + clamp(angleDifference(from, to), -maxDelta, maxDelta));
}

/** True when two numbers are within `epsilon` of each other. */
export function approximately(a: number, b: number, epsilon = 1e-4): boolean {
    return Math.abs(a - b) <= epsilon;
}

/** Round to a number of decimals, useful before writing values into a save file. */
export function roundTo(value: number, decimals = 2): number {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}

/** The value of a spring easing at `t`, overshooting slightly before settling. */
export function easeOutBack(t: number, overshoot = 1.70158): number {
    const x = t - 1;
    return 1 + (overshoot + 1) * x * x * x + overshoot * x * x;
}

/** Decay a shake or impulse value towards zero. */
export function decay(value: number, decayPerSecond: number, delta: number): number {
    const next = value - decayPerSecond * delta * Math.max(value, 0.15);
    return next <= 0.001 ? 0 : next;
}
