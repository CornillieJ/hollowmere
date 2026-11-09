import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { SkeletonUtils } from 'three-stdlib';

/**
 * Asset loading with caching and progress.
 *
 * Every loader returns a promise and every url is cached, so calling
 * `loadModel(url)` twice in two places costs one download. Progress listeners
 * drive the loading screen.
 */
export type LoadProgress = {
    /** Requests started. */
    total: number;
    /** Requests finished, successfully or not. */
    loaded: number;
    /** Requests that failed. */
    failed: number;
    /** Url of the most recently started request. */
    current: string;
    /** Fraction in 0..1, `1` when nothing is pending. */
    ratio: number;
};

export type AssetsOptions = {
    /** Where the Draco decoder files live, relative to the app root. */
    dracoPath?: string;
};

export type TextureOptions = {
    /** Horizontal and vertical repeat, e.g. `[4, 4]` to tile a floor. */
    repeat?: [number, number];
    /** How the texture behaves outside 0..1, defaults to repeating. */
    wrap?: THREE.Wrapping;
    /** Treat the image as colour data rather than linear data. True by default. */
    srgb?: boolean;
    anisotropy?: number;
};

export class Assets {
    /** Shared three.js loading manager, also used by loaders created elsewhere. */
    readonly manager: THREE.LoadingManager;

    private readonly gltfLoader: GLTFLoader;
    private readonly textureLoader: THREE.TextureLoader;
    private readonly cubeLoader: THREE.CubeTextureLoader;
    private readonly fileLoader: THREE.FileLoader;
    private readonly modelCache = new Map<string, Promise<THREE.Group>>();
    private readonly textureCache = new Map<string, Promise<THREE.Texture>>();
    private readonly cubeCache = new Map<string, Promise<THREE.CubeTexture>>();
    private readonly jsonCache = new Map<string, Promise<unknown>>();
    private readonly dracoLoader: DRACOLoader;
    private readonly dracoPath: string;
    private readonly clips = new Map<string, THREE.AnimationClip[]>();
    private readonly listeners = new Set<(progress: LoadProgress) => void>();
    private started = 0;
    private finished = 0;
    private failures = 0;
    private current = '';

    /**
     * @param manager Shared loading manager.
     * @param options `dracoPath` points at the Draco decoder files, which
     *        `tools/fetch-assets.mjs` copies into `static/draco/`. Many published
     *        models are Draco or Meshopt compressed, and without a decoder
     *        GLTFLoader refuses them with a clear but unhelpful error.
     */
    constructor(manager = new THREE.LoadingManager(), options: AssetsOptions = {}) {
        this.manager = manager;
        this.gltfLoader = new GLTFLoader(manager);

        this.dracoPath = options.dracoPath ?? 'draco/';
        this.dracoLoader = new DRACOLoader(manager);
        this.dracoLoader.setDecoderPath(this.dracoPath);
        // Keep one worker alive between models, which is where the cost is.
        this.dracoLoader.setDecoderConfig({ type: 'js' });
        this.gltfLoader.setDRACOLoader(this.dracoLoader);
        this.textureLoader = new THREE.TextureLoader(manager);
        this.cubeLoader = new THREE.CubeTextureLoader(manager);
        this.fileLoader = new THREE.FileLoader(manager);
    }

    /** Current progress snapshot. */
    get progress(): LoadProgress {
        const pending = this.started - this.finished;
        return {
            total: this.started,
            loaded: this.finished,
            failed: this.failures,
            current: this.current,
            ratio: pending <= 0 ? 1 : this.finished / this.started,
        };
    }

    /** Subscribe to progress updates. Returns an unsubscribe function. */
    onProgress(listener: (progress: LoadProgress) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /** Reset the counters, e.g. before a new level starts loading. */
    resetProgress(): void {
        this.started = 0;
        this.finished = 0;
        this.failures = 0;
        this.current = '';
    }

    /**
     * Load a glTF or GLB model.
     * @param url Path relative to the site root, e.g. 'models/crate.glb'.
     * Downloads once per url. Every call gets its own copy by default, because one
     * object can only have one parent: adding the shared original twice would
     * silently move it.
     * @param clone Pass false to get the cached original, e.g. to read it only.
     */
    async loadModel(url: string, clone = true): Promise<THREE.Group> {
        let pending = this.modelCache.get(url);
        if (!pending) {
            pending = this.request(url, () => this.loadGLTF(url));
            this.modelCache.set(url, pending);
            // A failed download must be retryable, not cached as a failure forever.
            pending.catch(() => this.modelCache.delete(url));
        }
        const model = await pending;
        return clone ? cloneModel(model) : model;
    }

    /** Load a model and always return an independent copy, including skinned meshes. */
    async cloneModel(url: string): Promise<THREE.Group> {
        return this.loadModel(url, true);
    }

    /** Load the full glTF result, e.g. when you also want its animations or cameras. */
    async loadGLTFResult(url: string): Promise<GLTF> {
        return new Promise((resolve, reject) => {
            this.gltfLoader.load(url, resolve, undefined, (error) => reject(error));
        });
    }

    private async loadGLTF(url: string): Promise<THREE.Group> {
        const gltf = await this.loadGLTFResult(url);
        // Keep the clips both in a registry and on the scene, so an animated model
        // stays animatable after `cloneModel` has copied it.
        this.clips.set(url, gltf.animations);
        gltf.scene.userData.animations = gltf.animations;
        return gltf.scene;
    }

    /** Animation clips that came with a model, in load order. */
    animationsOf(url: string): THREE.AnimationClip[] {
        return this.clips.get(url) ?? [];
    }

    /** Load a texture with sensible colour space and tiling defaults. */
    async loadTexture(url: string, options: TextureOptions = {}): Promise<THREE.Texture> {
        const key = `${url}|${options.repeat?.join('x') ?? ''}|${options.wrap ?? ''}|${options.srgb ?? ''}|${options.anisotropy ?? ''}`;
        const cached = this.textureCache.get(key);
        if (cached) return cached;
        const promise = this.request(url, async () => {
            const texture = await this.textureLoader.loadAsync(url);
            texture.colorSpace = options.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
            if (options.repeat) {
                texture.wrapS = options.wrap ?? THREE.RepeatWrapping;
                texture.wrapT = options.wrap ?? THREE.RepeatWrapping;
                texture.repeat.set(options.repeat[0], options.repeat[1]);
            } else if (options.wrap !== undefined) {
                texture.wrapS = options.wrap;
                texture.wrapT = options.wrap;
            }
            if (options.anisotropy !== undefined) texture.anisotropy = options.anisotropy;
            texture.needsUpdate = true;
            return texture;
        });
        this.textureCache.set(key, promise);
        return promise;
    }

    /** Load a six faced skybox cube texture. */
    async loadCubeTexture(urls: [string, string, string, string, string, string]): Promise<THREE.CubeTexture> {
        const key = urls.join('|');
        const cached = this.cubeCache.get(key);
        if (cached) return cached;
        const promise = this.request(key, async () => {
            const texture = await this.cubeLoader.loadAsync(urls);
            texture.colorSpace = THREE.SRGBColorSpace;
            return texture;
        });
        this.cubeCache.set(key, promise);
        return promise;
    }

    /** Load and parse a JSON file. */
    async loadJSON<T = unknown>(url: string): Promise<T> {
        const cached = this.jsonCache.get(url);
        if (cached) return cached as Promise<T>;
        const promise = this.request(url, async () => {
            const text = await this.fileLoader.loadAsync(url);
            return JSON.parse(text as string) as unknown;
        });
        this.jsonCache.set(url, promise);
        return promise as Promise<T>;
    }

    /** Decode an audio file into a buffer the audio manager can play. */
    async loadAudioBuffer(url: string, context: BaseAudioContext): Promise<AudioBuffer> {
        const response = await this.request(url, () => fetch(url));
        const bytes = await response.arrayBuffer();
        return context.decodeAudioData(bytes);
    }

    /** Load every url at once, resolving when all of them are in. */
    async loadAll(urls: string[]): Promise<void> {
        await Promise.all(urls.map((url) => this.loadTexture(url)));
    }

    /** True when the Draco decoder files are reachable, for a settings or debug row. */
    async checkDraco(): Promise<boolean> {
        try {
            const response = await fetch(`${this.dracoPath}draco_decoder.js`, { method: 'HEAD' });
            return response.ok;
        } catch {
            return false;
        }
    }

    /** Drop the caches and release every texture. Models are disposed too. */
    dispose(): void {
        this.dracoLoader.dispose();
        for (const promise of this.textureCache.values()) promise.then((texture) => texture.dispose()).catch(() => undefined);
        for (const promise of this.cubeCache.values()) promise.then((texture) => texture.dispose()).catch(() => undefined);
        this.modelCache.clear();
        this.textureCache.clear();
        this.cubeCache.clear();
        this.jsonCache.clear();
        this.listeners.clear();
    }

    /** Wrap one request so progress listeners see it. */
    private async request<T>(url: string, run: () => Promise<T>): Promise<T> {
        this.started += 1;
        this.current = url;
        this.notify();
        try {
            const result = await run();
            this.finished += 1;
            this.notify();
            return result;
        } catch (error) {
            this.failures += 1;
            this.finished += 1;
            this.notify();
            throw new Error(`[assets] failed to load "${url}": ${String(error)}`);
        }
    }

    private notify(): void {
        const progress = this.progress;
        for (const listener of [...this.listeners]) listener(progress);
    }
}

/**
 * Deep copy of a model that also handles skinned meshes and bones.
 *
 * `Object3D.clone()` breaks a skinned mesh's skeleton; `SkeletonUtils.clone`
 * keeps it. Two more things are needed for a clone to actually draw:
 *
 * - A skinned mesh's bounding sphere is computed from the rest pose, so once the
 *   skeleton moves the mesh can be culled while it is on screen. Frustum culling
 *   is turned off on skinned meshes for that reason.
 * - Morph targets can push geometry outside its bounding box, so the sphere on
 *   any mesh with morphs is grown by a margin.
 */
export function cloneModel(model: THREE.Object3D): THREE.Group {
    const clips = model.userData.animations as THREE.AnimationClip[] | undefined;
    const clone = SkeletonUtils.clone(model) as THREE.Group;

    // `Object3D.copy` deep copies `userData` through JSON, which turns
    // `AnimationClip` objects into plain ones with no `createInterpolant`, and a
    // mixer handed one of those throws inside a frame. Put the real clips back.
    if (clips !== undefined) clone.userData.animations = clips;

    clone.traverse((child) => {
        const mesh = child as THREE.SkinnedMesh;
        if (mesh.isSkinnedMesh === true) {
            mesh.frustumCulled = false;
            return;
        }
        const plain = child as THREE.Mesh;
        if (plain.isMesh !== true) return;
        if (!plain.geometry.morphAttributes || Object.keys(plain.geometry.morphAttributes).length === 0) return;
        // Morph targets move vertices outside the rest pose's bounds. The geometry is
        // shared by every clone, so it is padded once, not once per clone.
        if (plain.geometry.userData.morphPadded) return;
        if (!plain.geometry.boundingSphere) plain.geometry.computeBoundingSphere();
        if (plain.geometry.boundingSphere) plain.geometry.boundingSphere.radius *= 1.35;
        plain.geometry.userData.morphPadded = true;
    });

    return clone;
}
