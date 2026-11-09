import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import * as CONSTANTS from '../Constants/Constants';
import { color as toColor } from '../helpers/color';
import type { Physics } from '../physics/physics';

/**
 * Ready made scene pieces: lighting, sky, fog, ground and environment.
 *
 * `setupSceneDefaults` wires up a scene that already looks like a game instead
 * of a grey void, and every individual step is exported so a template can
 * replace just one part.
 */

//#region Lighting

export type LightingOptions = {
    /** Directional (sun) colour. */
    sunColor?: THREE.ColorRepresentation;
    /** Directional light intensity. */
    sunIntensity?: number;
    /** Direction the sun comes from, pointing from the origin. */
    sunDirection?: THREE.Vector3 | Vec3;
    /** Sky versus ground colour of the ambient hemisphere light. */
    skyColor?: THREE.ColorRepresentation;
    groundColor?: THREE.ColorRepresentation;
    ambientIntensity?: number;
    /** Extra fill light from the camera side, useful indoors. */
    fillIntensity?: number;
    /** Cast shadows from the directional light. */
    shadows?: boolean;
    /** Size of the shadow camera, i.e. how far from the origin shadows exist. */
    shadowRange?: number;
    shadowMapSize?: number;
};

export type LightingRefs = {
    hemisphere: THREE.HemisphereLight;
    sun: THREE.DirectionalLight;
    fill: THREE.DirectionalLight;
};

/** Add a hemisphere light, a shadow casting sun and a soft fill light. */
export function setupLighting(scene: THREE.Scene, options: LightingOptions = {}): LightingRefs {
    const hemisphere = new THREE.HemisphereLight(toColor(options.skyColor ?? 0xbfd7ff), toColor(options.groundColor ?? 0x4a4038), options.ambientIntensity ?? 0.55);
    hemisphere.name = 'hemisphere-light';
    scene.add(hemisphere);

    const direction = options.sunDirection ?? { x: -0.6, y: 1, z: -0.4 };
    const sun = new THREE.DirectionalLight(toColor(options.sunColor ?? 0xfff2d5), options.sunIntensity ?? 2.2);
    sun.name = 'sun';
    sun.position.set(direction.x, direction.y, direction.z).normalize().multiplyScalar(30);
    if (options.shadows ?? true) {
        sun.castShadow = true;
        const range = options.shadowRange ?? 30;
        sun.shadow.camera.left = -range;
        sun.shadow.camera.right = range;
        sun.shadow.camera.top = range;
        sun.shadow.camera.bottom = -range;
        sun.shadow.camera.near = 0.5;
        sun.shadow.camera.far = range * 4;
        sun.shadow.mapSize.setScalar(options.shadowMapSize ?? 2048);
        sun.shadow.bias = -0.0006;
        sun.shadow.normalBias = 0.02;
    }
    scene.add(sun);
    scene.add(sun.target);

    const fill = new THREE.DirectionalLight(toColor(0xa8c8ff), options.fillIntensity ?? 0.35);
    fill.name = 'fill-light';
    fill.position.set(1, 0.6, 1).multiplyScalar(12);
    scene.add(fill);

    return { hemisphere, sun, fill };
}

/** Keep the sun's shadow frustum centred on a moving target, e.g. the player. */
export function followSunWithShadows(sun: THREE.DirectionalLight, target: THREE.Vector3, range: number): void {
    sun.position.copy(target).add(sun.position.clone().setLength(30));
    sun.target.position.copy(target);
    sun.target.updateMatrixWorld();
    sun.shadow.camera.left = -range;
    sun.shadow.camera.right = range;
    sun.shadow.camera.top = range;
    sun.shadow.camera.bottom = -range;
    sun.shadow.camera.updateProjectionMatrix();
}

//#endregion Lighting

//#region Sky and background

export type SkyOptions = {
    /** Turbidity: haze. 2 is a clear day, 20 is a sandstorm. */
    turbidity?: number;
    /** Rayleigh scattering: how blue the sky is. 0.5 is clear, 4 is hazy. */
    rayleigh?: number;
    /** Sun elevation in degrees. Negative values give dawn and dusk colours. */
    elevation?: number;
    /** Sun rotation in degrees. */
    azimuth?: number;
    /** Distance of the sky dome. */
    distance?: number;
};

export type SkyRefs = {
    sky: Sky;
    sun: THREE.Vector3;
};

/**
 * Physical sky dome from the three.js addons.
 * Also returns the sun direction, so `setupLighting` can point at it.
 */
export function setupPhysicalSky(scene: THREE.Scene, options: SkyOptions = {}): SkyRefs {
    const sky = new Sky();
    sky.scale.setScalar(options.distance ?? 4500);
    sky.name = 'sky';
    scene.add(sky);

    const uniforms = sky.material.uniforms;
    uniforms.turbidity!.value = options.turbidity ?? 4;
    uniforms.rayleigh!.value = options.rayleigh ?? 1.2;
    uniforms.mieCoefficient!.value = 0.005;
    uniforms.mieDirectionalG!.value = 0.8;

    const elevation = THREE.MathUtils.degToRad(options.elevation ?? 24);
    const azimuth = THREE.MathUtils.degToRad(options.azimuth ?? 145);
    const sun = new THREE.Vector3().setFromSphericalCoords(1, Math.PI / 2 - elevation, azimuth);
    uniforms.sunPosition!.value.copy(sun);
    return { sky, sun };
}

export type GroundOptions = {
    /** Width and depth of the ground plane in meters. */
    size?: number;
    color?: THREE.ColorRepresentation;
    /** Tiling texture. Repeat is set from `textureRepeat`. */
    texture?: THREE.Texture;
    textureRepeat?: number;
    roughness?: number;
    metalness?: number;
    /** Add a static physics box, on by default. */
    physics?: boolean;
    /** Height of the ground surface. */
    y?: number;
    /** Receive shadows, on by default. */
    receiveShadow?: boolean;
};

/** Add a ground plane, with physics by default. */
export function setupGround(scene: THREE.Scene, options: GroundOptions = {}): THREE.Mesh {
    const size = options.size ?? 200;
    const geometry = new THREE.PlaneGeometry(size, size, 1, 1);
    geometry.rotateX(-Math.PI / 2);

    if (options.texture) {
        const repeat = options.textureRepeat ?? size / 4;
        options.texture.wrapS = THREE.RepeatWrapping;
        options.texture.wrapT = THREE.RepeatWrapping;
        options.texture.repeat.set(repeat, repeat);
        options.texture.anisotropy = 8;
    }

    const material = new THREE.MeshStandardMaterial({
        color: toColor(options.color ?? 0x8a8f7a),
        map: options.texture ?? null,
        roughness: options.roughness ?? 0.95,
        metalness: options.metalness ?? 0,
    });

    const ground = new THREE.Mesh(geometry, material);
    ground.name = CONSTANTS.NAMES.GROUND;
    ground.position.y = options.y ?? 0;
    ground.receiveShadow = options.receiveShadow ?? true;
    ground.userData.tag = 'ground';
    scene.add(ground);
    return ground;
}

export type FogOptions = {
    color?: THREE.ColorRepresentation;
    /** Linear fog: distances where the fog starts and ends. */
    near?: number;
    far?: number;
    /** Exponential fog density. When set, `near` and `far` are ignored. */
    density?: number;
    /** Fog mode. 'none' removes any existing fog. */
    mode?: 'linear' | 'exponential' | 'none';
};

/** Add or replace scene fog. */
export function setupFog(scene: THREE.Scene, options: FogOptions = {}): THREE.Fog | THREE.FogExp2 | null {
    const color = toColor(options.color ?? 0xc8d6e5);
    if (options.mode === 'none') {
        scene.fog = null;
        return null;
    }
    if (options.mode === 'exponential' || (options.density !== undefined && options.mode !== 'linear')) {
        scene.fog = new THREE.FogExp2(color, options.density ?? 0.012);
    } else {
        scene.fog = new THREE.Fog(color, options.near ?? 40, options.far ?? 260);
    }
    if (scene.background instanceof THREE.Color) scene.background = color;
    return scene.fog;
}

/**
 * A soft vertical gradient behind everything, the backdrop of a product shot.
 * Reads far better than a flat colour for menus, board games and dioramas.
 * @param glow Optional colour for a radial highlight in the middle.
 */
export function setupGradientBackground(scene: THREE.Scene, top: THREE.ColorRepresentation, bottom: THREE.ColorRepresentation, glow?: THREE.ColorRepresentation): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 512;
    const context = canvas.getContext('2d');
    if (context) {
        const linear = context.createLinearGradient(0, 0, 0, canvas.height);
        linear.addColorStop(0, `#${toColor(top).getHexString()}`);
        linear.addColorStop(1, `#${toColor(bottom).getHexString()}`);
        context.fillStyle = linear;
        context.fillRect(0, 0, canvas.width, canvas.height);
        if (glow !== undefined) {
            const radial = context.createLinearGradient(0, canvas.height * 0.3, 0, canvas.height * 0.75);
            const tint = toColor(glow);
            radial.addColorStop(0, 'rgba(0,0,0,0)');
            radial.addColorStop(0.5, `rgba(${Math.round(tint.r * 255)},${Math.round(tint.g * 255)},${Math.round(tint.b * 255)},0.35)`);
            radial.addColorStop(1, 'rgba(0,0,0,0)');
            context.fillStyle = radial;
            context.fillRect(0, 0, canvas.width, canvas.height);
        }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    scene.background = texture;
    return texture;
}

//#endregion Sky and background

//#region Environment and renderer

export type EnvironmentOptions = {
    /** Indoor room probe, or a colour only background. */
    preset?: 'room' | 'none';
    /** Also use the environment as the visible background. */
    asBackground?: boolean;
    /** Background colour when `preset` is `'none'`. */
    background?: THREE.ColorRepresentation;
};

/** Prefiltered environment lighting, the cheap way to make PBR materials read well. */
export function setupEnvironment(renderer: THREE.WebGLRenderer, scene: THREE.Scene, options: EnvironmentOptions = {}): THREE.Texture | undefined {
    if (options.preset === 'none') {
        if (options.background !== undefined) scene.background = toColor(options.background);
        return undefined;
    }
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = new RoomEnvironment();
    const texture = pmrem.fromScene(environment, 0.04).texture;
    scene.environment = texture;
    if (options.asBackground) scene.background = texture;
    pmrem.dispose();
    return texture;
}

/** Enable shadow mapping with a sane type for the platform. */
export function setupShadows(renderer: THREE.WebGLRenderer, soft = true): void {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
}

//#endregion Environment and renderer

//#region One call scene setup

export type SceneDefaultsOptions = {
    /** Which lighting mood to start from. */
    preset?: 'outdoor-day' | 'outdoor-dusk' | 'indoor' | 'night' | 'neon';
    /** Ground size in meters. 0 skips the ground. */
    groundSize?: number;
    groundColor?: THREE.ColorRepresentation;
    groundTexture?: THREE.Texture;
    /** Adds fog matched to the preset. */
    fog?: boolean;
    /** Physical sky dome instead of a flat background colour. */
    sky?: boolean;
};

export type SceneDefaultsRefs = {
    lighting: LightingRefs;
    ground: THREE.Mesh | undefined;
    sky: Sky | undefined;
};

/**
 * The scene a game actually wants on frame one: environment, matched lighting,
 * optional fog, sky and a ground with physics.
 *
 * @param physics Pass the physics world to give the ground a collider.
 */
export function setupSceneDefaults(scene: THREE.Scene, renderer: THREE.WebGLRenderer, physics: Physics | undefined, options: SceneDefaultsOptions = {}): SceneDefaultsRefs {
    const preset = options.preset ?? 'outdoor-day';
    if (options.sky) {
        const { sky, sun } = setupPhysicalSky(scene, preset === 'outdoor-dusk' ? { elevation: 6, azimuth: 160, turbidity: 8 } : { elevation: 28 });
        const lighting = setupLighting(scene, { sunDirection: sun, shadows: true, sunIntensity: preset === 'outdoor-dusk' ? 1.6 : 2.4 });
        const ground = setupGroundWithPhysics(scene, physics, options);
        if (options.fog !== false) setupFog(scene, { color: preset === 'outdoor-dusk' ? 0xe8b98c : 0xc8d6e5, far: 320 });
        return { lighting, ground, sky };
    }

    setupEnvironment(renderer, scene, {
        preset: preset === 'indoor' || preset === 'neon' ? 'room' : 'room',
        asBackground: false,
        background: preset === 'night' ? 0x05070f : 0x0a0c14,
    });
    const lighting = setupLighting(scene, LIGHTING_FOR_PRESET[preset]);
    const ground = setupGroundWithPhysics(scene, physics, options);
    if (options.fog !== false) {
        setupFog(scene, preset === 'night' ? { mode: 'exponential', density: 0.02, color: 0x0a0e1a } : preset === 'neon' ? { mode: 'exponential', density: 0.018, color: 0x1b1030 } : { far: 300, color: 0x9fb2c8 });
    }
    return { lighting, ground, sky: undefined };
}

const LIGHTING_FOR_PRESET: Record<NonNullable<SceneDefaultsOptions['preset']>, LightingOptions> = {
    'outdoor-day': { sunIntensity: 2.4, ambientIntensity: 0.55, skyColor: 0xbfd7ff },
    'outdoor-dusk': { sunIntensity: 1.6, sunColor: 0xffbf80, ambientIntensity: 0.4, skyColor: 0x5a4a6a, groundColor: 0x2a1f1a },
    indoor: { sunIntensity: 0.9, ambientIntensity: 0.5, skyColor: 0xdfe7ff, groundColor: 0x3a3a42, fillIntensity: 0.6 },
    night: { sunIntensity: 0.35, sunColor: 0x8fa8ff, ambientIntensity: 0.22, skyColor: 0x16203a, groundColor: 0x05070f },
    neon: { sunIntensity: 0.6, sunColor: 0xff6ad5, ambientIntensity: 0.3, skyColor: 0x2a1b6a, groundColor: 0x120a24, fillIntensity: 0.8 },
};

function setupGroundWithPhysics(scene: THREE.Scene, physics: Physics | undefined, options: SceneDefaultsOptions): THREE.Mesh | undefined {
    if (options.groundSize === 0) return undefined;
    const size = options.groundSize ?? 200;
    const groundOptions: GroundOptions = { size };
    if (options.groundTexture) groundOptions.texture = options.groundTexture;
    if (options.groundColor !== undefined) groundOptions.color = options.groundColor;
    const ground = setupGround(scene, groundOptions);
    if (physics) {
        physics.add({
            kind: 'fixed',
            shape: { type: 'box', size: { x: size, y: 0.5, z: size } },
            position: { x: 0, y: -0.25, z: 0 },
            // Keep the mesh on the body so ground hits can be told apart from walls.
            object: ground,
            syncObject: false,
            friction: 0.9,
            tag: 'ground',
        });
    }
    return ground;
}

//#endregion One call scene setup
