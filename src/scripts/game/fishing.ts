import * as THREE from 'three';

/**
 * Fishing off the jetty at the black pool, by day.
 *
 * A rod leans on the last post. Casting puts a float on the water; after a
 * wait it goes under, and there is under a second to pull. Too soon or too
 * late and the hook comes back bare. The pool gives a handful of bites a day
 * and then goes still, so it is a trip worth planning, not a place to stand
 * all afternoon.
 */
export type FishingOptions = {
    /** Where the rod stands, and where the float lands. */
    rod: THREE.Vector3;
    water: THREE.Vector3;
    yaw: number;
    night: () => boolean;
    day: () => number;
    say: (line: string) => void;
    /** Something took the hook and was landed. */
    onCatch: (position: THREE.Vector3) => void;
    onCast?: () => void;
    onBite?: () => void;
};

export type FishingHandle = {
    readonly state: 'idle' | 'waiting' | 'bite';
    readonly bitesLeft: number;
    readonly rod: THREE.Object3D;
    /** For tests: make the fish bite now. */
    hurry: () => void;
};

/** Bites a day before the water goes still. */
export const BITES = 5;
const WINDOW = 0.85;

export function setupFishing(game: Game, options: FishingOptions): FishingHandle {
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a4a36, roughness: 1, flatShading: true });
    const rod = new THREE.Group();
    rod.name = 'fishing-rod';
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.035, 2.6, 5), wood);
    pole.position.y = 1.25;
    pole.rotation.x = 0.5;
    pole.position.z = 0.6;
    rod.add(pole);
    rod.position.copy(options.rod);
    rod.rotation.y = options.yaw;
    game.scene.add(rod);

    const float = new THREE.Group();
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 5), new THREE.MeshBasicMaterial({ color: 0xd84a3a }));
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.26, 4), new THREE.MeshBasicMaterial({ color: 0xf2f2e8 }));
    tip.position.y = 0.2;
    float.add(top, tip);
    float.position.copy(options.water);
    float.visible = false;
    game.scene.add(float);

    const sign = document.createElement('div');
    sign.className = 'fishing-sign is-hidden';
    game.hud.root.appendChild(sign);
    sign.addEventListener('pointerdown', () => (pressed = true));
    const show = (text: string, urgent = false): void => {
        sign.textContent = text;
        sign.classList.remove('is-hidden');
        sign.classList.toggle('is-urgent', urgent);
    };

    let state: FishingHandle['state'] = 'idle';
    let timer = 0;
    let grace = 0;
    let pressed = false;
    // The key is read here, not through the world's prompts: those are switched off while the line is out.
    window.addEventListener(
        'keydown',
        (event) => {
            if (state === 'idle' || event.repeat || (event.code !== 'KeyE' && event.code !== 'Space' && event.code !== 'Enter')) return;
            event.preventDefault();
            event.stopPropagation();
            pressed = true;
        },
        true,
    );
    let bites = { day: 0, left: BITES };
    const left = (): number => {
        if (bites.day !== options.day()) bites = { day: options.day(), left: BITES };
        return bites.left;
    };
    const stop = (): void => {
        state = 'idle';
        float.visible = false;
        sign.classList.add('is-hidden');
        if (game.player) game.player.frozen = false;
        // A moment later, or the press that pulled would cast again.
        window.setTimeout(() => (game.interactions.enabled = true), 400);
    };

    game.interactions.add(rod, {
        prompt: 'Fish from the jetty',
        range: 2.4,
        onInteract: () => {
            if (options.night()) return options.say('Not after dark. Something else has the use of the water then.');
            if (left() <= 0) return options.say('The water has gone still. Nothing more will bite today.');
            state = 'waiting';
            timer = 2 + Math.random() * 3.5;
            grace = 0.35;
            float.visible = true;
            if (game.player) game.player.frozen = true;
            game.interactions.enabled = false;
            pressed = false;
            show('Wait for the float to go under...');
            options.onCast?.();
        },
    });

    game.systems.add({
        name: 'fishing',
        update: (delta) => {
            if (state === 'idle') return;
            grace -= delta;
            // The press that cast the line is not also a pull.
            const pulled = grace <= 0 && (pressed || game.input.wasPressed('interact'));
            pressed = false;
            timer -= delta;
            const now = performance.now() / 1000;
            if (state === 'waiting') {
                float.position.y = options.water.y + Math.sin(now * 2.2) * 0.03;
                if (pulled) {
                    options.say('Too soon. The hook comes back bare.');
                    return stop();
                }
                if (timer <= 0) {
                    state = 'bite';
                    timer = WINDOW;
                    show('PULL!', true);
                    options.onBite?.();
                }
                return;
            }
            float.position.y = options.water.y - 0.2 + Math.sin(now * 30) * 0.02;
            if (pulled) {
                bites.left -= 1;
                options.onCatch(float.position.clone().setY(options.water.y + 0.6));
                return stop();
            }
            if (timer <= 0) {
                bites.left -= 1;
                options.say('It got away. The float comes back up, slowly.');
                stop();
            }
        },
    });

    game.save.register('fishing', {
        save: () => bites,
        load: (data) => {
            const saved = data as { day?: number; left?: number } | undefined;
            bites = { day: saved?.day ?? 0, left: saved?.left ?? BITES };
        },
    });

    return {
        get state() {
            return state;
        },
        get bitesLeft() {
            return left();
        },
        rod,
        hurry: () => {
            if (state === 'waiting') timer = 0;
        },
    };
}
