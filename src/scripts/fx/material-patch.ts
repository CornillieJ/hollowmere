import * as THREE from 'three';

/**
 * Inject shader code into every material in the scene, including ones added later.
 *
 * Effects such as vertex snapping or a custom fog have to change the built-in
 * shaders. Doing that per material by hand is easy to forget for a model that
 * loads later, so a patch is registered once and a cheap system applies it to
 * any material it has not seen yet. Patches stack: a material gets every patch
 * that is registered, in registration order.
 */
export type MaterialPatch = {
    /** Unique id; it also separates the compiled programs from unpatched ones. */
    key: string;
    /** Edit the shader source and add uniforms. Runs when three compiles the material. */
    apply: (shader: THREE.WebGLProgramParametersWithUniforms, material: THREE.Material) => void;
    /** Leave some materials alone, e.g. UI or sprites. */
    filter?: (material: THREE.Material) => boolean;
};

type PatchState = { patches: MaterialPatch[]; signature: string };

const STATES = new WeakMap<Game, PatchState>();
/** How often new materials are looked for, in seconds. */
const SCAN_INTERVAL = 0.25;

/** Register a patch. Returns a function that unregisters it again. */
export function addMaterialPatch(game: Game, patch: MaterialPatch): () => void {
    let state = STATES.get(game);
    if (!state) {
        state = { patches: [], signature: '' };
        STATES.set(game, state);
        installScanner(game, state);
    }
    state.patches = [...state.patches.filter((existing) => existing.key !== patch.key), patch];
    state.signature = state.patches.map((entry) => entry.key).join('+');
    scan(game, state);
    return () => {
        if (!state) return;
        state.patches = state.patches.filter((existing) => existing !== patch);
        state.signature = state.patches.map((entry) => entry.key).join('+');
        scan(game, state);
    };
}

/** Insert `code` right after a `#include <chunk>` line. A no-op when the chunk is missing. */
export function afterChunk(source: string, chunk: string, code: string): string {
    return source.replace(`#include <${chunk}>`, `#include <${chunk}>\n${code}`);
}

function installScanner(game: Game, state: PatchState): void {
    let timer = 0;
    game.systems.add({
        name: 'material-patches',
        order: 990,
        // Models stream in during menus and loading too.
        always: true,
        update: (delta) => {
            timer -= delta;
            if (timer > 0) return;
            timer = SCAN_INTERVAL;
            scan(game, state);
        },
    });
}

function scan(game: Game, state: PatchState): void {
    game.scene.traverse((object) => {
        const materials = (object as THREE.Mesh).material;
        if (!materials) return;
        for (const material of Array.isArray(materials) ? materials : [materials]) patchMaterial(material, state);
    });
}

function patchMaterial(material: THREE.Material, state: PatchState): void {
    if (material.userData.patchSignature === state.signature) return;
    // A shader material owns its source; patching it would break the author's code.
    if ((material as THREE.ShaderMaterial).isShaderMaterial) return;

    const patches = state.patches.filter((patch) => patch.filter?.(material) ?? true);
    const key = patches.map((patch) => patch.key).join('+');
    material.userData.patchSignature = state.signature;
    material.onBeforeCompile = (shader) => {
        for (const patch of patches) patch.apply(shader, material);
    };
    material.customProgramCacheKey = () => key;
    material.needsUpdate = true;
}
