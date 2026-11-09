import * as THREE from 'three';

/**
 * What kind of machine is this, and how much should we ask of it?
 *
 * A phone has a small screen, a coarse pointer and a fraction of the fill rate
 * of a desktop, so the defaults that suit a desktop will render a phone at two
 * frames a second. This module answers the question once, so every game can start
 * from sensible numbers and still be overridden.
 */
export type DeviceKind = 'mobile' | 'tablet' | 'desktop';

export type DeviceProfile = {
    kind: DeviceKind;
    /** True for a coarse pointer, i.e. fingers rather than a mouse. */
    touch: boolean;
    /** Screen width in CSS pixels. */
    width: number;
    height: number;
    /** Device pixel ratio, before any cap is applied. */
    pixelRatio: number;
    /** Sensible `renderer.setPixelRatio` cap for this device. */
    maxPixelRatio: number;
    /** Whether shadows are worth it. */
    shadows: boolean;
    /** Suggested particle pool size. */
    particles: number;
    /** True when the browser reports few logical cores. */
    lowPower: boolean;
};

/** Work out what we are running on. Safe to call before the game exists. */
export function detectDevice(): DeviceProfile {
    const width = typeof window === 'undefined' ? 1280 : window.innerWidth;
    const height = typeof window === 'undefined' ? 800 : window.innerHeight;
    const pixelRatio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
    const coarse = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency ?? 4 : 4;
    const lowPower = cores <= 4;

    const shortSide = Math.min(width, height);
    const kind: DeviceKind = coarse ? (shortSide >= 700 ? 'tablet' : 'mobile') : 'desktop';
    const mobile = kind !== 'desktop';

    return {
        kind,
        touch: coarse,
        width,
        height,
        pixelRatio,
        // A phone at device pixel ratio 3 is nine times the pixels of a 1080p
        // screen. Capping this is the single biggest mobile win there is.
        maxPixelRatio: mobile ? 1.5 : 2,
        shadows: !mobile,
        particles: mobile ? 512 : 2048,
        lowPower,
    };
}

/** A short human readable summary, for a debug row or a settings screen. */
export function describeDevice(device: DeviceProfile): string {
    return `${device.kind} ${device.width}x${device.height} dpr${device.pixelRatio.toFixed(1)} -> cap ${device.maxPixelRatio} shadows ${device.shadows ? 'on' : 'off'}`;
}

/**
 * Quality levels a game can switch between, e.g. from a settings menu.
 * Applying one touches the renderer, the shadow map and the effect pools.
 */
export type QualityLevel = 'low' | 'medium' | 'high';

export type QualitySettings = {
    pixelRatio: number;
    shadows: boolean;
    particles: number;
};

/** Settings for a level, given the device. */
export function qualityFor(level: QualityLevel, device: DeviceProfile): QualitySettings {
    const base = { low: 1, medium: Math.min(1.5, device.maxPixelRatio), high: device.maxPixelRatio } as const;
    return {
        pixelRatio: base[level],
        // Shadows are the single most expensive thing a mobile GPU can be asked
        // to do, so only the top level pays for them.
        shadows: level === 'high',
        particles: level === 'low' ? 256 : level === 'medium' ? 1024 : 2048,
    };
}

/** The level that suits this device out of the box. */
export function defaultQuality(device: DeviceProfile): QualityLevel {
    if (device.kind === 'desktop') return 'high';
    return device.lowPower ? 'low' : 'medium';
}

/** Apply a quality level to a running game. */
export function applyQuality(game: Game, level: QualityLevel): QualitySettings {
    const device = game.device;
    const settings = qualityFor(level, device);
    // Stored on the options too, or the next resize (a phone rotating) would restore the old ratio.
    game.options.maxPixelRatio = settings.pixelRatio;
    game.renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.pixelRatio));
    game.renderer.shadowMap.enabled = settings.shadows;
    // Materials that already compiled with shadows need a rebuild to drop them.
    game.scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) material.needsUpdate = true;
    });
    game.quality = level;
    return settings;
}
