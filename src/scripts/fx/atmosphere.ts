import * as THREE from 'three';

import { addMaterialPatch, afterChunk } from './material-patch';

/**
 * Fog that behaves like air instead of a flat curtain.
 *
 * Three things a plain `FogExp2` lacks:
 * - it pools: density falls off with height, so valleys and fields fill with
 *   mist while the tops of trees and roofs poke out of it;
 * - it moves: a drifting 3D noise field thins and thickens the mist, so it reads
 *   as banks rolling past rather than a gradient glued to the camera;
 * - it is integrated along the view ray, so looking down into a misty hollow
 *   and looking across it give different, physically plausible answers.
 *
 * It replaces three's fog chunk on every material through a material patch, and
 * uses the scene's `FogExp2` for colour and base density, so existing fog
 * settings and `setupFog` keep working.
 */
export type AtmosphereOptions = {
    color?: THREE.ColorRepresentation;
    /** Base density at ground level. 0.04 is a heavy mist, 0.015 a light haze. */
    density?: number;
    /** Height where the mist is thickest. */
    baseHeight?: number;
    /** How quickly the mist thins with height. 0 for uniform fog. */
    heightFalloff?: number;
    /** Size of the drifting banks: smaller numbers mean bigger banks. */
    noiseScale?: number;
    /** How much the banks vary the density, 0..1. */
    noiseAmount?: number;
    /** Drift direction and speed in meters per second, on x and z. */
    wind?: { x: number; z: number };
    /** Never fully hide anything; 1 allows fog to swallow the far distance completely. */
    maxOpacity?: number;
    /** Also paint the background in the fog colour, so the horizon melts away. Defaults to true. */
    background?: boolean;
};

export type Atmosphere = {
    readonly fog: THREE.FogExp2;
    readonly uniforms: Record<string, THREE.IUniform>;
    setDensity: (density: number) => void;
    setColor: (color: THREE.ColorRepresentation) => void;
    /** How strongly the mist drifts in banks, 0 for an even, still fog. */
    setNoise: (amount: number) => void;
    remove: () => void;
};

const FRAGMENT_HEADER = /* glsl */ `
uniform float uFogTime;
uniform float uFogBase;
uniform float uFogFalloff;
uniform float uFogNoiseScale;
uniform float uFogNoiseAmount;
uniform vec2 uFogWind;
uniform float uFogMax;
varying vec3 vFogWorld;

float fogHash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float fogNoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(fogHash(i), fogHash(i + vec3(1, 0, 0)), f.x), mix(fogHash(i + vec3(0, 1, 0)), fogHash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(fogHash(i + vec3(0, 0, 1)), fogHash(i + vec3(1, 0, 1)), f.x), mix(fogHash(i + vec3(0, 1, 1)), fogHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}

float fogBanks(vec3 p) {
    return fogNoise(p) * 0.55 + fogNoise(p * 2.03 + 11.7) * 0.3 + fogNoise(p * 4.1 + 3.1) * 0.15;
}
`;

const FRAGMENT_FOG = /* glsl */ `
#ifdef USE_FOG
    vec3 fogRay = vFogWorld - cameraPosition;
    float fogDistance = length(fogRay);
    // Exponential height fog, integrated along the ray from the eye to the surface.
    float fogK = max(uFogFalloff, 0.0001);
    float fogDy = fogRay.y;
    float fogHeight = exp(-fogK * (cameraPosition.y - uFogBase));
    float fogAlong = abs(fogK * fogDy) > 0.0001 ? (1.0 - exp(-fogK * fogDy)) / (fogK * fogDy) : 1.0;
    // Sample the drifting banks halfway along the ray, so near and far mist move differently.
    vec3 fogSample = (cameraPosition + fogRay * 0.5) * uFogNoiseScale + vec3(uFogWind.x, 0.0, uFogWind.y) * uFogTime * uFogNoiseScale;
    fogSample.y += uFogTime * 0.02;
    float fogVariation = 1.0 + uFogNoiseAmount * (fogBanks(fogSample) - 0.5) * 2.0;
    float fogOptical = fogDensity * fogVariation * fogDistance * fogHeight * fogAlong;
    float fogFactor = clamp(1.0 - exp(-fogOptical), 0.0, uFogMax);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
#endif
`;

const VERTEX_WORLD = /* glsl */ `
#ifdef USE_FOG
    vec4 fogLocal = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
        fogLocal = instanceMatrix * fogLocal;
    #endif
    vFogWorld = (modelMatrix * fogLocal).xyz;
#endif
`;

/** Install the mist. Calling it again replaces the settings. */
export function setupAtmosphere(game: Game, options: AtmosphereOptions = {}): Atmosphere {
    const color = new THREE.Color(options.color ?? 0x9aa39a);
    const fog = new THREE.FogExp2(color, options.density ?? 0.035);
    game.scene.fog = fog;
    if (options.background !== false) game.scene.background = color.clone();

    const uniforms: Record<string, THREE.IUniform> = {
        uFogTime: { value: 0 },
        uFogBase: { value: options.baseHeight ?? 0 },
        uFogFalloff: { value: options.heightFalloff ?? 0.12 },
        uFogNoiseScale: { value: options.noiseScale ?? 0.06 },
        uFogNoiseAmount: { value: options.noiseAmount ?? 0.6 },
        uFogWind: { value: new THREE.Vector2(options.wind?.x ?? 0.6, options.wind?.z ?? 0.25) },
        uFogMax: { value: options.maxOpacity ?? 1 },
    };

    const removePatch = addMaterialPatch(game, {
        key: 'atmosphere',
        // Sprites have no `transformed` position in their vertex shader.
        filter: (material) => !(material as THREE.SpriteMaterial).isSpriteMaterial && (material as THREE.MeshStandardMaterial).fog !== false,
        apply: (shader) => {
            Object.assign(shader.uniforms, uniforms);
            shader.vertexShader = `varying vec3 vFogWorld;\n${afterChunk(shader.vertexShader, 'fog_vertex', VERTEX_WORLD)}`;
            shader.fragmentShader = `${FRAGMENT_HEADER}\n${shader.fragmentShader.replace('#include <fog_fragment>', FRAGMENT_FOG)}`;
        },
    });

    const unregister = game.systems.add({
        name: 'atmosphere',
        order: 980,
        always: true,
        update: (delta) => {
            (uniforms.uFogTime as THREE.IUniform).value += delta;
        },
    });

    return {
        fog,
        uniforms,
        setDensity: (density) => {
            fog.density = density;
        },
        setNoise: (amount) => {
            (uniforms.uFogNoiseAmount as THREE.IUniform<number>).value = amount;
        },
        setColor: (next) => {
            fog.color.set(next);
            if (game.scene.background instanceof THREE.Color) game.scene.background.set(next);
        },
        remove: () => {
            removePatch();
            unregister();
        },
    };
}
