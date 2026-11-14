import * as THREE from 'three';

import type { PlotState } from './farm';

/**
 * Now and then a crop comes up gold. It glows in the row, and picking it
 * gives 3 times the usual and a moment of fanfare. A small lottery in the
 * daily routine, so walking the rows is never only a chore.
 */
export const GOLDEN = { chance: 0.05, times: 3 };

export type GoldenHandle = {
    /** True if this ripe plot came up gold. */
    is: (plot: PlotState) => boolean;
    /** For tests and dev mode: make this plot gold. */
    make: (plot: PlotState) => void;
    chance: number;
};

export function setupGolden(game: Game, options: { plots: () => PlotState[]; allowed: () => boolean }): GoldenHandle {
    const rolled = new Map<PlotState, boolean>();
    const marks = new Map<PlotState, THREE.Object3D>();
    const gold = new THREE.MeshBasicMaterial({ color: 0xffd84a });
    const shape = new THREE.OctahedronGeometry(0.22, 0);
    const halo = new THREE.MeshBasicMaterial({ color: 0xffd84a, transparent: true, opacity: 0.35, depthWrite: false });
    const disc = new THREE.CircleGeometry(0.55, 12).rotateX(-Math.PI / 2);

    const show = (plot: PlotState, on: boolean): void => {
        let mark = marks.get(plot);
        if (on && !mark) {
            mark = new THREE.Group();
            mark.add(new THREE.Mesh(shape, gold));
            const light = new THREE.PointLight(0xffd060, 4, 4, 1.5);
            mark.add(light);
            const glow = new THREE.Mesh(disc, halo);
            glow.position.set(plot.position.x, plot.position.y + 0.06, plot.position.z);
            mark.userData.glow = glow;
            game.scene.add(mark, glow);
            marks.set(plot, mark);
        }
        if (!on && mark) {
            mark.removeFromParent();
            (mark.userData.glow as THREE.Object3D).removeFromParent();
            marks.delete(plot);
        }
    };

    const handle: GoldenHandle = {
        chance: GOLDEN.chance,
        is: (plot) => rolled.get(plot) === true,
        make: (plot) => {
            rolled.set(plot, true);
            show(plot, true);
        },
    };

    game.systems.add({
        name: 'golden-crops',
        update: () => {
            const now = performance.now() / 1000;
            for (const plot of options.plots()) {
                if (!plot.ripe || !plot.active) {
                    if (rolled.has(plot)) {
                        rolled.delete(plot);
                        show(plot, false);
                    }
                    continue;
                }
                if (!rolled.has(plot)) {
                    const lucky = options.allowed() && Math.random() < handle.chance;
                    rolled.set(plot, lucky);
                    show(plot, lucky);
                }
                const mark = marks.get(plot);
                if (!mark) continue;
                mark.position.set(plot.position.x, plot.position.y + 1.4 + Math.sin(now * 2 + plot.position.x) * 0.1, plot.position.z);
                mark.rotation.y = now * 1.6;
                if (Math.random() < 0.04) game.effects.particles.burst(mark.position, { count: 1, color: 0xffe08a, size: 0.05, speed: 0.6, lifetime: 0.8 });
            }
        },
    });
    return handle;
}
