import * as THREE from 'three';

/**
 * Colour helpers.
 *
 * Colours are handled as `THREE.Color` so they plug straight into materials.
 * The `*Hex` variants exist because CSS and canvas want strings, not objects.
 */

/** Parse anything three.js accepts into a `THREE.Color`. */
export function color(value: THREE.ColorRepresentation, out = new THREE.Color()): THREE.Color {
    return out.set(value);
}

/** Mix two colours in linear space, `t` clamped to 0..1. */
export function mix(a: THREE.ColorRepresentation, b: THREE.ColorRepresentation, t: number, out = new THREE.Color()): THREE.Color {
    return out.set(a).lerp(new THREE.Color(b), THREE.MathUtils.clamp(t, 0, 1));
}

/** Shift a colour towards white by `t`. */
export function lighten(value: THREE.ColorRepresentation, t: number, out = new THREE.Color()): THREE.Color {
    return mix(value, 0xffffff, t, out);
}

/** Shift a colour towards black by `t`. */
export function darken(value: THREE.ColorRepresentation, t: number, out = new THREE.Color()): THREE.Color {
    return mix(value, 0x000000, t, out);
}

/** Adjust the hue of a colour by `degrees`, keeping saturation and lightness. */
export function shiftHue(value: THREE.ColorRepresentation, degrees: number, out = new THREE.Color()): THREE.Color {
    const hsl = { h: 0, s: 0, l: 0 };
    out.set(value).getHSL(hsl);
    return out.setHSL((hsl.h + degrees / 360 + 1) % 1, hsl.s, hsl.l);
}

/** Adjust saturation and lightness by a relative amount, e.g. `+0.2` or `-0.3`. */
export function adjust(value: THREE.ColorRepresentation, saturationDelta: number, lightnessDelta: number, out = new THREE.Color()): THREE.Color {
    const hsl = { h: 0, s: 0, l: 0 };
    out.set(value).getHSL(hsl);
    return out.setHSL(hsl.h, THREE.MathUtils.clamp(hsl.s + saturationDelta, 0, 1), THREE.MathUtils.clamp(hsl.l + lightnessDelta, 0, 1));
}

/** `#rrggbb` string for a colour, ready for DOM or CSS. */
export function toHexString(value: THREE.ColorRepresentation): string {
    return `#${new THREE.Color(value).getHexString()}`;
}

/** `rgba(r, g, b, a)` string for a colour, where `a` is 0..1. */
export function toRgbaString(value: THREE.ColorRepresentation, alpha = 1): string {
    const parsed = new THREE.Color(value);
    return `rgba(${Math.round(parsed.r * 255)}, ${Math.round(parsed.g * 255)}, ${Math.round(parsed.b * 255)}, ${alpha})`;
}

/** A colour that looks good on both light and dark backgrounds: black or white. */
export function readableOn(background: THREE.ColorRepresentation): THREE.Color {
    const parsed = new THREE.Color(background);
    const luminance = 0.2126 * parsed.r + 0.7152 * parsed.g + 0.0722 * parsed.b;
    return new THREE.Color(luminance > 0.5 ? 0x000000 : 0xffffff);
}

/** Random pastel colour, pleasant for procedural placeholders. */
export function randomPastel(random: () => number = Math.random): THREE.Color {
    return new THREE.Color().setHSL(random(), 0.55, 0.72);
}

/** Random strong colour, useful for debug shapes that must stand out. */
export function randomVivid(random: () => number = Math.random): THREE.Color {
    return new THREE.Color().setHSL(random(), 0.95, 0.5);
}

/** A rainbow palette of `count` evenly spaced hues. */
export function palette(count: number, lightness = 0.6, saturation = 0.7): THREE.Color[] {
    const colors: THREE.Color[] = [];
    for (let index = 0; index < count; index += 1) {
        colors.push(new THREE.Color().setHSL(index / Math.max(count, 1), saturation, lightness));
    }
    return colors;
}
