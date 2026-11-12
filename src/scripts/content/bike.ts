import * as THREE from 'three';

/**
 * A rusty bicycle, built from primitives. Origin on the ground, front wheel
 * towards +z. Spoked wheels read well even at PS1 resolution.
 */
export function createBike(): THREE.Group {
    const bike = new THREE.Group();
    bike.name = 'bike';
    const frame = new THREE.MeshStandardMaterial({ color: 0x6a2a24, roughness: 0.8, metalness: 0.3, flatShading: true });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 1 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x8a8580, roughness: 0.5, metalness: 0.6 });

    const wheelRadius = 0.34;
    for (const z of [-0.52, 0.52]) {
        const wheel = new THREE.Group();
        wheel.position.set(0, wheelRadius, z);
        wheel.name = z > 0 ? 'front-wheel' : 'rear-wheel';
        const tyre = new THREE.Mesh(new THREE.TorusGeometry(wheelRadius, 0.035, 5, 14), rubber);
        tyre.rotation.y = Math.PI / 2;
        wheel.add(tyre);
        for (let index = 0; index < 4; index += 1) {
            const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.012, wheelRadius * 2, 0.012), steel);
            spoke.rotation.x = (index / 4) * Math.PI;
            wheel.add(spoke);
        }
        bike.add(wheel);
    }

    const tube = (from: THREE.Vector3, to: THREE.Vector3, radius = 0.022): void => {
        const length = from.distanceTo(to);
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 5), frame);
        mesh.position.copy(from).add(to).multiplyScalar(0.5);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
        mesh.castShadow = true;
        bike.add(mesh);
    };
    const rear = new THREE.Vector3(0, wheelRadius, -0.52);
    const front = new THREE.Vector3(0, wheelRadius, 0.52);
    const seat = new THREE.Vector3(0, 0.82, -0.18);
    const crank = new THREE.Vector3(0, 0.3, -0.05);
    const head = new THREE.Vector3(0, 0.86, 0.38);
    tube(rear, seat);
    tube(rear, crank);
    tube(seat, crank);
    tube(crank, head);
    tube(seat, head);
    tube(head, front, 0.02);

    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.24), rubber);
    saddle.position.copy(seat).setY(seat.y + 0.04);
    bike.add(saddle);
    const bars = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.5, 5), steel);
    bars.rotation.z = Math.PI / 2;
    bars.position.copy(head).setY(head.y + 0.08);
    bike.add(bars);
    // A basket on the front: of course it has a basket.
    const basket = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.22), new THREE.MeshStandardMaterial({ color: 0x7a5a32, roughness: 1 }));
    basket.position.set(0, 0.86, 0.58);
    bike.add(basket);
    return bike;
}
