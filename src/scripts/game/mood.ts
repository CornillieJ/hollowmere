import * as THREE from 'three';

import { SYSTEM_ORDER } from '../core/systems';
import type { DayCycle } from '../game/daycycle';
import type { Atmosphere } from '../fx/atmosphere';
import type { LightingRefs } from '../setup/setup-scene';

/**
 * The light of Hollowmere. Never bright: a sick green-grey overcast by day,
 * bruise-violet at dusk, near black at night with the lamps the only warmth.
 * Fog, sky and lights all follow the clock together, so the mist is always the
 * same colour as the light it is lit by.
 */
const DAY = new THREE.Color(0x8b9488);
const DUSK = new THREE.Color(0x5a4a5a);
const NIGHT = new THREE.Color(0x0c0e12);

export function setupMood(game: Game, options: { dayCycle: DayCycle; atmosphere: Atmosphere; lighting: LightingRefs; lamps: THREE.PointLight[] }): void {
    const { dayCycle, atmosphere, lighting, lamps } = options;
    const color = new THREE.Color();
    lighting.sun.color.set(0xc8d0c0);
    lighting.hemisphere.groundColor.set(0x2a2620);

    game.systems.add({
        name: 'mood',
        order: SYSTEM_ORDER.EFFECTS - 1,
        always: true,
        update: () => {
            // Full (dim) day from 8 to 17, a long dusk, and real night from 21.
            const hour = dayCycle.hour;
            const day = THREE.MathUtils.smoothstep(hour, 5.5, 8) * (1 - THREE.MathUtils.smoothstep(hour, 17, 20.5));
            const dusk = 1 - Math.abs(hour - 19) / 1.8;
            color.copy(NIGHT).lerp(DAY, day);
            if (dusk > 0) color.lerp(DUSK, Math.min(1, dusk) * 0.6);
            atmosphere.setColor(color);
            // Night closes in: the mist is thicker and the world ends sooner.
            atmosphere.setDensity(THREE.MathUtils.lerp(0.075, 0.042, day));

            lighting.sun.intensity = 0.15 + day * 0.9;
            lighting.hemisphere.intensity = 0.12 + day * 0.55;
            lighting.hemisphere.color.copy(color).lerp(new THREE.Color(0xffffff), 0.3);
            lighting.fill.intensity = 0.05 + day * 0.15;
            for (const lamp of lamps) lamp.intensity = THREE.MathUtils.lerp(9, 2.5, day);
        },
    });
}
