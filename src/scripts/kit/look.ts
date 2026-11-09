import * as THREE from 'three';

import { postPipeline, type PostPipeline } from '../fx/post';
import { psxPass, snapVertices, vhsPass, type PsxOptions, type VhsOptions } from '../fx/retro';
import { setupAtmosphere, type Atmosphere, type AtmosphereOptions } from '../fx/atmosphere';

//#region Retro look

export type RetroLookOptions = {
    /** Fraction of the screen resolution the scene renders at. 0.33 is a PS1. */
    resolutionScale?: number;
    /** Colour quantising and dither. `false` keeps full colour. */
    psx?: PsxOptions | false;
    /** Tape artefacts. `false` for a clean picture. */
    vhs?: VhsOptions | false;
    /** Vertex grid in screen cells, the PS1 wobble. `false` for steady geometry. */
    snap?: { x: number; y: number } | false;
};

export type RetroLookHandle = {
    readonly pipeline: PostPipeline;
    /** Change the render resolution, e.g. from a settings menu. */
    setResolutionScale: (scale: number) => void;
    /** Turn the tape effect on or off, e.g. stronger during a scare. */
    setVhs: (enabled: boolean) => void;
    vhsUniforms: Record<string, THREE.IUniform> | undefined;
    dispose: () => void;
};

/**
 * A PS1 era picture: low resolution, few colours with dithering, wobbling
 * vertices, and optionally a VHS tape on top. One call, every part optional.
 */
export function addRetroLook(game: Game, options: RetroLookOptions = {}): RetroLookHandle {
    const pipeline = postPipeline(game);
    pipeline.resolutionScale = options.resolutionScale ?? 0.33;
    pipeline.resize();
    if (options.psx !== false) pipeline.add(psxPass(options.psx ?? {}));
    const vhs = options.vhs === false ? undefined : pipeline.add(vhsPass(options.vhs ?? {}));
    const snap = options.snap === false ? undefined : snapVertices(game, new THREE.Vector2(options.snap?.x ?? 240, options.snap?.y ?? 180));

    return {
        pipeline,
        setResolutionScale: (scale) => {
            pipeline.resolutionScale = scale;
            pipeline.resize();
        },
        setVhs: (enabled) => {
            if (vhs) vhs.enabled = enabled;
        },
        vhsUniforms: vhs?.material.uniforms,
        dispose: () => {
            snap?.remove();
            pipeline.dispose();
        },
    };
}

//#endregion Retro look

//#region Atmosphere

/** Height fog with drifting banks of mist. See `fx/atmosphere.ts`. */
export function addAtmosphere(game: Game, options: AtmosphereOptions = {}): Atmosphere {
    return setupAtmosphere(game, options);
}

//#endregion Atmosphere
