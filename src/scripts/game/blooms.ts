import * as THREE from 'three';

/**
 * Veilblooms: pale flowers that stand shut all day and open after dark, well
 * away from any lamp. One can be picked from each plant a night, and they are
 * worth a good deal, so the best pay in the valley is out where the Hollow are.
 *
 * By day there is a dull bud to walk past. At night the flower stands open and
 * its glow carries through the Veil, which is how it is found, and how the
 * farmer is tempted off the road.
 */
export type BloomsOptions = {
    spots: Array<{ x: number; z: number }>;
    ground: (x: number, z: number) => number;
    night: () => boolean;
    day: () => number;
    hour: () => number;
    /** Hand one over. False when there is no room for it. */
    give: () => boolean;
    onPicked?: (position: THREE.Vector3) => void;
};

export type BloomsHandle = {
    readonly blooms: Array<{ position: THREE.Vector3; open: boolean }>;
    /** How many have been picked in all. */
    readonly picked: number;
};

const PETAL = 0xbfe8e0;

function glowTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    if (context) {
        const fade = context.createRadialGradient(32, 32, 0, 32, 32, 32);
        fade.addColorStop(0, 'rgba(210, 255, 240, 0.9)');
        fade.addColorStop(0.3, 'rgba(160, 235, 220, 0.35)');
        fade.addColorStop(1, 'rgba(120, 220, 210, 0)');
        context.fillStyle = fade;
        context.fillRect(0, 0, 64, 64);
    }
    return new THREE.CanvasTexture(canvas);
}

export function setupBlooms(game: Game, options: BloomsOptions): BloomsHandle {
    const stemMaterial = new THREE.MeshStandardMaterial({ color: 0x3c4a3a, roughness: 1, flatShading: true });
    const budMaterial = new THREE.MeshStandardMaterial({ color: 0x59625a, roughness: 1, flatShading: true });
    const petalMaterial = new THREE.MeshStandardMaterial({ color: PETAL, roughness: 0.8, flatShading: true, emissive: PETAL, emissiveIntensity: 0.9, side: THREE.DoubleSide });
    const heartMaterial = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
    const glowMaterial = new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, opacity: 0 });
    const petalShape = new THREE.ConeGeometry(0.11, 0.42, 4);
    petalShape.translate(0, 0.21, 0);

    let picked = 0;
    const nightOfPick = (): number => (options.hour() >= 12 ? options.day() : options.day() - 1);
    const plants = options.spots.map((spot, index) => {
        const root = new THREE.Group();
        root.name = `veilbloom-${index}`;
        root.position.set(spot.x, options.ground(spot.x, spot.z), spot.z);
        root.rotation.y = index * 1.7;
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.7, 5), stemMaterial);
        stem.position.y = 0.35;
        const bud = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 5), budMaterial);
        bud.position.y = 0.82;
        const flower = new THREE.Group();
        flower.position.y = 0.72;
        for (let petal = 0; petal < 6; petal += 1) {
            const leaf = new THREE.Mesh(petalShape, petalMaterial);
            leaf.rotation.set(0.95, 0, 0);
            const turn = new THREE.Group();
            turn.rotation.y = (petal / 6) * Math.PI * 2;
            turn.add(leaf);
            flower.add(turn);
        }
        const heart = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), heartMaterial);
        heart.position.y = 0.06;
        flower.add(heart);
        const glow = new THREE.Sprite(glowMaterial.clone());
        glow.position.y = 0.9;
        glow.scale.setScalar(3.2);
        root.add(stem, bud, flower, glow);
        game.scene.add(root);
        const plant = { root, bud, flower, glow, pickedOn: -1, open: 0, position: root.position };
        game.interactions.add(root, {
            prompt: 'Pick the veilbloom',
            range: 2,
            enabled: false,
            onInteract: () => {
                if (!options.give()) return;
                plant.pickedOn = nightOfPick();
                picked += 1;
                options.onPicked?.(root.position.clone().setY(root.position.y + 0.9));
            },
        });
        return plant;
    });

    // A night runs over midnight: it is numbered by the day it began on.
    const nightIndex = nightOfPick;
    game.systems.add({
        name: 'veilblooms',
        update: (delta) => {
            const night = options.night();
            for (const plant of plants) {
                const blooming = night && plant.pickedOn !== nightIndex();
                plant.open = THREE.MathUtils.clamp(plant.open + (blooming ? delta : -delta) * 0.8, 0, 1);
                plant.flower.visible = plant.open > 0.02;
                plant.flower.scale.setScalar(0.2 + plant.open * 0.8);
                plant.bud.visible = plant.open < 0.5;
                (plant.glow.material as THREE.SpriteMaterial).opacity = plant.open * (0.55 + Math.sin(performance.now() / 700 + plant.root.rotation.y) * 0.12);
                game.interactions.setEnabled(plant.root, plant.open > 0.6);
            }
        },
    });

    game.save.register('veilblooms', {
        save: () => ({ picked, days: plants.map((plant) => plant.pickedOn) }),
        load: (data) => {
            const saved = data as { picked?: number; days?: number[] } | undefined;
            picked = saved?.picked ?? 0;
            plants.forEach((plant, index) => (plant.pickedOn = saved?.days?.[index] ?? -1));
        },
    });

    return {
        get blooms() {
            return plants.map((plant) => ({ position: plant.position, open: plant.open > 0.6 }));
        },
        get picked() {
            return picked;
        },
    };
}
