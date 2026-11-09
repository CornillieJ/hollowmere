import * as THREE from 'three';

import { SYSTEM_ORDER } from '../core/systems';
import { Synth, type LoopHandle } from '../audio/synth';
import type { DayCycle } from '../game/daycycle';
import type { EnemyManager } from '../game/enemies';
import type { RetroLookHandle } from '../kit';

/**
 * How the Hollow make themselves felt before they are seen.
 *
 * The closer the nearest one, the worse the tape: the picture wobbles and
 * fringes, the static rises, and the drone under everything swells. A low moan
 * marks the moment one starts following you. Nothing on screen says "danger";
 * the picture just gets harder to trust.
 */
export function setupDread(game: Game, options: { enemies: EnemyManager; look: RetroLookHandle; dayCycle: DayCycle; isRiding: () => boolean }): void {
    const synth = new Synth(game);
    let drone: LoopHandle | undefined;
    let wind: LoopHandle | undefined;
    const base = { wobble: 0.5, chroma: 0.6, noise: 0.07 };
    const chasing = new Set<number>();
    let stepTimer = 0;
    let dread = 0;

    // The carried lantern: a small warm circle that is the only colour at night.
    const lantern = new THREE.PointLight(0xffb06a, 0, 9, 1.4);
    lantern.position.set(0.25, 1.1, 0.25);
    game.player?.root.add(lantern);

    // Audio can only start after a gesture; the first key or click starts the beds.
    const start = (): void => {
        void game.audio.unlock().then(() => {
            drone ??= synth.drone({ level: 0.1 });
            wind ??= synth.wind({ level: 0.14 });
        });
    };
    window.addEventListener('pointerdown', start, { once: true });
    window.addEventListener('keydown', start, { once: true });

    game.systems.add({
        name: 'dread',
        order: SYSTEM_ORDER.EFFECTS - 2,
        update: (delta) => {
            const player = game.player;
            if (!player) return;
            const nearest = options.enemies.nearest(player.position);
            const distance = nearest ? nearest.root.position.distanceTo(player.position) : Infinity;
            const target = THREE.MathUtils.clamp(1 - (distance - 3) / 22, 0, 1);
            dread += (target - dread) * Math.min(1, delta * 1.5);

            const uniforms = options.look.vhsUniforms;
            if (uniforms) {
                (uniforms.uWobble as THREE.IUniform).value = base.wobble + dread * 1.5;
                (uniforms.uChroma as THREE.IUniform).value = base.chroma + dread * 1.3;
                (uniforms.uNoise as THREE.IUniform).value = base.noise + dread * 0.1;
            }
            drone?.setLevel(0.08 + dread * 0.22, 0.5);

            // A moan when one of them first turns towards you.
            for (const enemy of options.enemies.all) {
                const following = enemy.state.is('chase', 'attack');
                if (following && !chasing.has(enemy.id)) {
                    chasing.add(enemy.id);
                    synth.tone({ frequency: 70 + Math.random() * 25, duration: 1.6, type: 'sawtooth', gain: 0.18, sweep: 0.6, bus: 'sfx' });
                    synth.noise({ duration: 1.2, gain: 0.08, filter: 300 });
                } else if (!following) {
                    chasing.delete(enemy.id);
                }
            }

            // Footsteps on soft ground, or the tick of a freewheel on the bike.
            const speed = player.body.speed;
            stepTimer -= delta * speed;
            if (speed > 0.5 && stepTimer <= 0) {
                stepTimer = options.isRiding() ? 3 : 1.6;
                if (options.isRiding()) synth.tone({ frequency: 2400, duration: 0.02, type: 'square', gain: 0.02 });
                else synth.noise({ duration: 0.07, gain: 0.07, filter: 500 + Math.random() * 300 });
            }

            const hour = options.dayCycle.hour;
            const night = 1 - THREE.MathUtils.smoothstep(hour, 6, 8) * (1 - THREE.MathUtils.smoothstep(hour, 17, 19.5));
            lantern.intensity = 1.5 + night * 6;
        },
    });
}
