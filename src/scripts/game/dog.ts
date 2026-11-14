import * as THREE from 'three';

/**
 * A stray that turns up on the porch after the first night and stays.
 *
 * It trots after the farmer, runs beside the bicycle, and can be petted. Its
 * use is its nose: it knows a Hollow is near before the farmer can see one in
 * the Veil, and stands stiff and growling towards it. Nothing out there has
 * any interest in a dog.
 */
export type DogOptions = {
    ground: (x: number, z: number) => number;
    /** The nearest Hollow to a spot, if any is within reach of its nose. */
    threat: (position: THREE.Vector3, within: number) => THREE.Vector3 | undefined;
    /** False while the farmer is somewhere nothing can come. */
    wary: () => boolean;
    /** True from the day it arrives. */
    here: () => boolean;
    growl: () => void;
    /** `gift` is true the first time it is petted on a day: it has brought something. */
    onPet: (position: THREE.Vector3, first: boolean, gift: boolean) => void;
    day: () => number;
    onArrive: () => void;
};

export type DogHandle = {
    readonly object: THREE.Group;
    readonly alert: boolean;
    readonly pets: number;
};

const NOSE = 24;

function build(): { root: THREE.Group; legs: THREE.Object3D[]; tail: THREE.Object3D; head: THREE.Object3D; mark: THREE.Object3D } {
    const coat = new THREE.MeshStandardMaterial({ color: 0x8a7a66, roughness: 1, flatShading: true });
    const dark = new THREE.MeshStandardMaterial({ color: 0x3a3028, roughness: 1, flatShading: true });
    const root = new THREE.Group();
    root.name = 'dog';
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.72), coat);
    body.position.y = 0.46;
    const head = new THREE.Group();
    head.position.set(0, 0.66, 0.4);
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.26, 0.28), coat);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.13, 0.2), dark);
    snout.position.set(0, -0.05, 0.2);
    head.add(skull, snout);
    for (const x of [-0.1, 0.1]) {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 4), dark);
        ear.position.set(x, 0.19, -0.04);
        head.add(ear);
        const eye = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.02), new THREE.MeshBasicMaterial({ color: 0x0a0806 }));
        eye.position.set(x * 0.8, 0.03, 0.145);
        head.add(eye);
    }
    const legs = [
        [-0.1, 0.26],
        [0.1, 0.26],
        [-0.1, -0.26],
        [0.1, -0.26],
    ].map(([x, z]) => {
        const hip = new THREE.Group();
        hip.position.set(x as number, 0.34, z as number);
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.34, 0.09), dark);
        leg.position.y = -0.17;
        hip.add(leg);
        return hip;
    });
    const tail = new THREE.Group();
    tail.position.set(0, 0.58, -0.36);
    const tailBone = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.3), coat);
    tailBone.position.set(0, 0.08, -0.12);
    tailBone.rotation.x = 0.7;
    tail.add(tailBone);
    // What it shows when it has smelled one of them.
    const mark = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 4), new THREE.MeshBasicMaterial({ color: 0xff5a48 }));
    mark.rotation.x = Math.PI;
    mark.position.y = 1.25;
    mark.visible = false;
    root.add(body, head, tail, mark, ...legs);
    return { root, legs, tail, head, mark };
}

export function setupDog(game: Game, options: DogOptions): DogHandle {
    const dog = build();
    dog.root.visible = false;
    game.scene.add(dog.root);
    let arrived = false;
    let pets = 0;
    let giftDay = 0;
    let alert = false;
    let stride = 0;
    let growlIn = 0;
    const to = new THREE.Vector3();
    const want = new THREE.Vector3();

    game.interactions.add(dog.root, {
        prompt: 'Pet the dog',
        range: 1.8,
        enabled: false,
        onInteract: () => {
            pets += 1;
            const gift = giftDay !== options.day();
            giftDay = options.day();
            options.onPet(dog.root.position.clone().setY(dog.root.position.y + 0.9), pets === 1, gift);
        },
    });

    game.systems.add({
        name: 'dog',
        update: (delta) => {
            const player = game.player;
            if (!player) return;
            if (!options.here()) {
                // A new game on the same page: it has not turned up yet.
                arrived = false;
                dog.root.visible = false;
                game.interactions.setEnabled(dog.root, false);
                return;
            }
            const position = dog.root.position;
            if (!arrived) {
                arrived = true;
                dog.root.visible = true;
                position.set(player.position.x + 1.6, player.position.y, player.position.z + 1.2);
                game.interactions.setEnabled(dog.root, true);
                if (pets === 0) options.onArrive();
            }
            // A step behind and to one side of wherever the farmer is going.
            const facing = player.root.rotation.y;
            want.set(player.position.x - Math.sin(facing) * 1.5 + Math.cos(facing) * 1.1, 0, player.position.z - Math.cos(facing) * 1.5 - Math.sin(facing) * 1.1);
            to.set(want.x - position.x, 0, want.z - position.z);
            const gap = to.length();
            // Left behind by a fall, a door or a fast bicycle: it is simply there again.
            if (gap > 22 || Math.abs(player.position.y - position.y) > 6) {
                position.set(want.x, player.position.y, want.z);
                return;
            }
            const foe = options.wary() ? options.threat(position, NOSE) : undefined;
            alert = foe !== undefined;
            dog.mark.visible = alert && Math.floor(performance.now() / 350) % 2 === 0;
            let speed = 0;
            if (gap > (alert ? 3.2 : 0.7)) {
                speed = Math.min(13, 2 + gap * 2.2);
                position.addScaledVector(to.normalize(), Math.min(gap, speed * delta));
            }
            const floor = options.ground(position.x, position.z);
            // Indoors the ground under the map is not the floor: stay level with the farmer.
            position.y = Math.abs(floor - player.position.y) > 3 ? player.position.y : floor;
            const look = foe ? Math.atan2(foe.x - position.x, foe.z - position.z) : speed > 0.2 ? Math.atan2(to.x, to.z) : Math.atan2(player.position.x - position.x, player.position.z - position.z);
            let turn = look - dog.root.rotation.y;
            turn = Math.atan2(Math.sin(turn), Math.cos(turn));
            dog.root.rotation.y += turn * Math.min(1, delta * 9);
            stride += delta * (4 + speed * 2.4);
            const swing = speed > 0.2 ? Math.sin(stride) * Math.min(0.9, 0.3 + speed * 0.08) : 0;
            dog.legs.forEach((leg, index) => (leg.rotation.x = index % 3 === 0 ? swing : -swing));
            // Stiff when it smells one; otherwise the tail says how it feels about you.
            dog.tail.rotation.y = alert ? 0 : Math.sin(performance.now() / (speed > 0.2 ? 90 : 160)) * 0.7;
            dog.head.rotation.x = alert ? 0.2 : speed > 0.2 ? 0 : -0.15;
            growlIn -= delta;
            if (alert && growlIn <= 0) {
                growlIn = 3.5;
                options.growl();
            }
        },
    });

    game.save.register('dog', {
        save: () => ({ pets, giftDay }),
        load: (data) => {
            const saved = (typeof data === 'object' && data ? data : {}) as { pets?: number; giftDay?: number };
            pets = saved.pets ?? 0;
            giftDay = saved.giftDay ?? 0;
        },
    });

    return {
        object: dog.root,
        get alert() {
            return alert;
        },
        get pets() {
            return pets;
        },
    };
}
