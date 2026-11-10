import * as THREE from 'three';

import type { PostPassOptions } from './post';
import { addMaterialPatch, afterChunk } from './material-patch';

/**
 * The PS1 and VHS looks, as post passes and a material patch.
 *
 * - `psxPass`: few colours with an ordered dither, sampled on the low resolution
 *   pixel grid. Pair it with a low `resolutionScale` on the pipeline.
 * - `vhsPass`: tape wobble, a rolling tracking band, colour bleed, chroma offset,
 *   scanlines, grain and a vignette.
 * - `snapVertices`: vertices snap to a coarse screen grid, the PS1's signature
 *   wobble on moving geometry.
 */
export type PsxOptions = {
    /** Levels per colour channel. 32 is subtle, 12 is crunchy. */
    colorLevels?: number;
    /** Dither strength, 0..1. */
    dither?: number;
};

export function psxPass(options: PsxOptions = {}): PostPassOptions {
    return {
        name: 'psx',
        order: 10,
        uniforms: { uColorLevels: { value: options.colorLevels ?? 24 }, uDither: { value: options.dither ?? 0.8 } },
        fragmentShader: /* glsl */ `
            uniform sampler2D tDiffuse;
            uniform vec2 uSceneResolution;
            uniform float uColorLevels;
            uniform float uDither;
            varying vec2 vUv;

            float bayer4(vec2 pixel) {
                ivec2 p = ivec2(mod(pixel, 4.0));
                int index = p.x + p.y * 4;
                float matrix[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
                return matrix[index] / 16.0 - 0.5;
            }

            void main() {
                // Dither on the scene's own pixel grid, so the pattern is as chunky as the pixels.
                vec2 pixel = floor(vUv * uSceneResolution);
                vec3 color = texture2D(tDiffuse, (pixel + 0.5) / uSceneResolution).rgb;
                color += bayer4(pixel) * uDither / uColorLevels;
                color = floor(color * uColorLevels + 0.5) / uColorLevels;
                gl_FragColor = vec4(color, 1.0);
            }`,
    };
}

export type VhsOptions = {
    /** Sideways tape wobble and the rolling tracking band, 0..1. */
    wobble?: number;
    /** Red and blue fringes, 0..1. */
    chroma?: number;
    scanlines?: number;
    noise?: number;
    vignette?: number;
    /** 1 keeps colour, 0 is greyscale. Old tape sits around 0.75. */
    saturation?: number;
    tint?: THREE.ColorRepresentation;
};

export function vhsPass(options: VhsOptions = {}): PostPassOptions {
    return {
        name: 'vhs',
        order: 20,
        uniforms: {
            uWobble: { value: options.wobble ?? 0.6 },
            uChroma: { value: options.chroma ?? 0.6 },
            uScanlines: { value: options.scanlines ?? 0.12 },
            uNoise: { value: options.noise ?? 0.06 },
            uVignette: { value: options.vignette ?? 0.55 },
            uSaturation: { value: options.saturation ?? 0.78 },
            uTint: { value: new THREE.Color(options.tint ?? 0xf2ffe8) },
        },
        fragmentShader: /* glsl */ `
            uniform sampler2D tDiffuse;
            uniform vec2 uResolution;
            uniform float uTime;
            uniform float uWobble;
            uniform float uChroma;
            uniform float uScanlines;
            uniform float uNoise;
            uniform float uVignette;
            uniform float uSaturation;
            uniform vec3 uTint;
            varying vec2 vUv;

            float hash(vec2 p) {
                return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
            }

            void main() {
                vec2 uv = vUv;
                float line = floor(uv.y * uResolution.y * 0.5);
                // Slow tape stretch, plus a little per-line jitter that changes every frame.
                float wobble = sin(uv.y * 9.0 + uTime * 1.1) * 0.0007 + (hash(vec2(line, floor(uTime * 30.0))) - 0.5) * 0.0009;
                // The tracking band rolls down the screen and drags the picture sideways.
                float bandPosition = 1.0 - fract(uTime * 0.045);
                float band = 1.0 - smoothstep(0.0, 0.035, abs(uv.y - bandPosition));
                wobble += band * 0.007 * (0.5 + hash(vec2(line, uTime)));
                uv.x += wobble * uWobble;

                vec2 fringe = vec2(uChroma * 0.0028, 0.0);
                vec2 texel = vec2(1.6 / uResolution.x, 0.0);
                vec3 color = vec3(texture2D(tDiffuse, uv + fringe).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - fringe).b);
                // Colour bleeds sideways on tape: soften horizontally only.
                vec3 bleed = (texture2D(tDiffuse, uv + texel).rgb + texture2D(tDiffuse, uv - texel).rgb) * 0.5;
                color = mix(color, bleed, 0.35);

                float luma = dot(color, vec3(0.299, 0.587, 0.114));
                color = mix(vec3(luma), color, uSaturation) * uTint;
                color += band * 0.06;

                color *= 1.0 - uScanlines * (0.5 + 0.5 * sin(uv.y * uResolution.y * 3.14159));
                color += (hash(uv * uResolution + fract(uTime) * 100.0) - 0.5) * uNoise;

                vec2 centre = vUv - 0.5;
                color *= 1.0 - uVignette * dot(centre, centre) * 2.2;
                gl_FragColor = vec4(color, 1.0);
            }`,
    };
}

/**
 * Snap every vertex to a coarse screen grid. Returns a function that removes the
 * effect, and a uniform you can change at run time.
 * @param resolution Grid size in screen cells. 160 by 120 is roughly the PS1.
 */
export function snapVertices(game: Game, resolution = new THREE.Vector2(240, 180)): { remove: () => void; setEnabled: (enabled: boolean) => void; setStrength: (strength: number) => void; resolution: THREE.IUniform<THREE.Vector2> } {
    const uniform: THREE.IUniform<THREE.Vector2> = { value: resolution };
    const remove = addMaterialPatch(game, {
        key: 'psx-snap',
        // Sprites and points have no surface to wobble, and their shaders lack `project_vertex`.
        filter: (material) => !(material as THREE.SpriteMaterial).isSpriteMaterial && !(material as THREE.PointsMaterial).isPointsMaterial,
        apply: (shader) => {
            shader.uniforms.uSnapResolution = uniform;
            shader.vertexShader = `uniform vec2 uSnapResolution;\n${afterChunk(
                shader.vertexShader,
                'project_vertex',
                `{
                    vec4 snapped = gl_Position;
                    snapped.xy = floor(snapped.xy / snapped.w * uSnapResolution * 0.5) / (uSnapResolution * 0.5) * snapped.w;
                    gl_Position = snapped;
                }`,
            )}`;
        },
    });
    // A grid far finer than any screen snaps nothing, which turns the wobble off without recompiling a shader.
    const off = new THREE.Vector2(1e5, 1e5);
    const scaled = new THREE.Vector2();
    // A coarser grid wobbles more: strength 1 is the grid as given, 0.5 is twice as fine, 2 twice as coarse.
    const setStrength = (strength: number): void => {
        uniform.value = strength <= 0.01 ? off : scaled.copy(resolution).divideScalar(strength);
    };
    return { remove, setEnabled: (enabled) => setStrength(enabled ? 1 : 0), setStrength, resolution: uniform };
}
