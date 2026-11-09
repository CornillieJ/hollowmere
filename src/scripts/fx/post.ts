import * as THREE from 'three';

/**
 * A small post-processing chain: render the scene into a texture, run full
 * screen passes over it, draw the result.
 *
 * The scene can render at a fraction of the screen resolution (`pixelScale`),
 * which is the core of a PS1 look and also a big performance lever on phones.
 * Each pass is a fragment shader that reads the previous image as `tDiffuse`;
 * passes are kept in the order they were added.
 */
export type PostPassOptions = {
    /** Unique name, so a pass can be found, toggled or replaced. */
    name: string;
    fragmentShader: string;
    uniforms?: Record<string, THREE.IUniform>;
    /** Runs every frame before drawing, e.g. to advance a time uniform. */
    update?: (uniforms: Record<string, THREE.IUniform>, delta: number) => void;
    /** Lower runs first. Defaults to the order of adding. */
    order?: number;
};

export type PostPass = {
    readonly name: string;
    readonly material: THREE.ShaderMaterial;
    enabled: boolean;
    order: number;
    update: ((uniforms: Record<string, THREE.IUniform>, delta: number) => void) | undefined;
};

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const OUTPUT_FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uExposure;
uniform float uToneMap;
varying vec2 vUv;

// ACES filmic fit (Narkowicz), matching the look of three's ACESFilmicToneMapping.
vec3 aces(vec3 color) {
    color *= uExposure * 0.6;
    return clamp((color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14), 0.0, 1.0);
}

vec3 toSrgb(vec3 linear) {
    return mix(linear * 12.92, 1.055 * pow(linear, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), linear));
}

void main() {
    vec4 texel = texture2D(tDiffuse, vUv);
    vec3 color = uToneMap > 0.5 ? aces(texel.rgb) : clamp(texel.rgb, 0.0, 1.0);
    gl_FragColor = vec4(toSrgb(color), 1.0);
}`;

export class PostPipeline {
    /** Fraction of the screen the scene renders at. 1 is full resolution, 0.33 is chunky. */
    resolutionScale: number;

    private readonly game: Game;
    private readonly passes: PostPass[] = [];
    private readonly sceneTarget: THREE.WebGLRenderTarget;
    private readonly pingPong: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
    private readonly quad: THREE.Mesh;
    private readonly quadScene = new THREE.Scene();
    private readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    private readonly copy: THREE.ShaderMaterial;
    private readonly onResize: () => void;
    private nextOrder = 0;

    constructor(game: Game, options: { resolutionScale?: number } = {}) {
        this.game = game;
        this.resolutionScale = options.resolutionScale ?? 1;

        // Nearest filtering is what keeps low resolution pixels square instead of blurry.
        const targetOptions = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, type: THREE.HalfFloatType, colorSpace: THREE.LinearSRGBColorSpace };
        this.sceneTarget = new THREE.WebGLRenderTarget(1, 1, { ...targetOptions, depthBuffer: true });
        this.pingPong = [new THREE.WebGLRenderTarget(1, 1, targetOptions), new THREE.WebGLRenderTarget(1, 1, targetOptions)];

        // three.js only tone maps and converts to sRGB when drawing to the screen, and
        // the scene now draws into a texture. This pass does both by hand, so every
        // effect after it works on the image as it will be seen, which is what
        // dithering and colour quantising need.
        this.copy = new THREE.ShaderMaterial({
            vertexShader: VERTEX,
            fragmentShader: OUTPUT_FRAGMENT,
            uniforms: { tDiffuse: { value: null }, uExposure: { value: 1 }, uToneMap: { value: 1 } },
            depthTest: false,
            depthWrite: false,
        });
        this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.copy);
        this.quad.frustumCulled = false;
        this.quadScene.add(this.quad);

        this.onResize = () => this.resize();
        window.addEventListener('resize', this.onResize);
        this.resize();
        game.renderScene = () => this.render();
    }

    /** Add a pass, or replace the one with the same name. */
    add(options: PostPassOptions): PostPass {
        this.remove(options.name);
        const material = new THREE.ShaderMaterial({
            vertexShader: VERTEX,
            fragmentShader: options.fragmentShader,
            uniforms: {
                tDiffuse: { value: null },
                uResolution: { value: new THREE.Vector2() },
                uSceneResolution: { value: new THREE.Vector2() },
                uTime: { value: 0 },
                ...options.uniforms,
            },
            depthTest: false,
            depthWrite: false,
        });
        const pass: PostPass = { name: options.name, material, enabled: true, order: options.order ?? this.nextOrder++, update: options.update };
        this.passes.push(pass);
        this.passes.sort((a, b) => a.order - b.order);
        this.resize();
        return pass;
    }

    get(name: string): PostPass | undefined {
        return this.passes.find((pass) => pass.name === name);
    }

    remove(name: string): void {
        const index = this.passes.findIndex((pass) => pass.name === name);
        if (index < 0) return;
        this.passes[index]?.material.dispose();
        this.passes.splice(index, 1);
    }

    /** Re-read the screen size. Called on window resize; call it after changing `resolutionScale`. */
    resize(): void {
        const renderer = this.game.renderer;
        const size = renderer.getDrawingBufferSize(new THREE.Vector2());
        const sceneWidth = Math.max(1, Math.round(size.x * this.resolutionScale));
        const sceneHeight = Math.max(1, Math.round(size.y * this.resolutionScale));
        this.sceneTarget.setSize(sceneWidth, sceneHeight);
        for (const target of this.pingPong) target.setSize(size.x, size.y);
        for (const pass of this.passes) {
            (pass.material.uniforms.uResolution?.value as THREE.Vector2).set(size.x, size.y);
            (pass.material.uniforms.uSceneResolution?.value as THREE.Vector2).set(sceneWidth, sceneHeight);
        }
    }

    dispose(): void {
        window.removeEventListener('resize', this.onResize);
        if (this.game.renderScene) this.game.renderScene = undefined;
        for (const pass of this.passes) pass.material.dispose();
        this.copy.dispose();
        this.quad.geometry.dispose();
        this.sceneTarget.dispose();
        for (const target of this.pingPong) target.dispose();
    }

    private render(): void {
        const { renderer, scene, camera } = this.game;
        const delta = this.game.time.rawDelta;

        renderer.setRenderTarget(this.sceneTarget);
        renderer.render(scene, camera);

        (this.copy.uniforms.uExposure as THREE.IUniform).value = renderer.toneMappingExposure;
        (this.copy.uniforms.uToneMap as THREE.IUniform).value = renderer.toneMapping === THREE.NoToneMapping ? 0 : 1;
        const chain: Array<{ material: THREE.ShaderMaterial; pass?: PostPass }> = [{ material: this.copy }, ...this.passes.filter((pass) => pass.enabled).map((pass) => ({ material: pass.material, pass }))];

        let source: THREE.Texture = this.sceneTarget.texture;
        chain.forEach((step, index) => {
            const uniforms = step.material.uniforms;
            (uniforms.tDiffuse as THREE.IUniform).value = source;
            if (step.pass) {
                (uniforms.uTime as THREE.IUniform).value += delta;
                step.pass.update?.(uniforms, delta);
            }
            const target = index === chain.length - 1 ? null : (this.pingPong[index % 2] as THREE.WebGLRenderTarget);
            this.quad.material = step.material;
            renderer.setRenderTarget(target);
            renderer.render(this.quadScene, this.quadCamera);
            if (target) source = target.texture;
        });
        renderer.setRenderTarget(null);
    }
}

/** The pipeline of a game, created on first use. */
export function postPipeline(game: Game): PostPipeline {
    let pipeline = PIPELINES.get(game);
    if (!pipeline) {
        pipeline = new PostPipeline(game);
        PIPELINES.set(game, pipeline);
    }
    return pipeline;
}

const PIPELINES = new WeakMap<Game, PostPipeline>();
