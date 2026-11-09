import * as THREE from 'three';

import { SYSTEM_ORDER } from '../core/systems';
import { VehicleBody, type VehicleOptions } from '../physics/vehicle';
import { VehicleController, type VehicleControllerOptions } from '../controls/vehicle';
import { createVehicleVisual } from '../helpers/build';

//#region Vehicles

export type AddVehicleOptions = VehicleOptions & {
    /** Chase camera options. */
    camera?: VehicleControllerOptions;
    /** Visual: 'van' builds the grey-box van, or hand over your own root group. */
    visual?: 'van' | THREE.Object3D;
    /** Van paint and panel colours, when `visual` is 'van'. */
    colors?: { color?: THREE.ColorRepresentation; panelColor?: THREE.ColorRepresentation };
};

export type VehicleHandle = {
    readonly vehicle: VehicleBody;
    readonly controller: VehicleController;
    /** The wheel meshes, already synced with the suspension. */
    readonly wheels: THREE.Mesh[];
    dispose: () => void;
};

/**
 * A drivable vehicle in one call: the physics, the chase camera, a grey-box
 * visual and the wheel meshes, spinning and steering with the suspension.
 *
 * ```ts
 * const van = addVehicle(game, { position: { x: 0, y: 0, z: 4 }, engineForce: 2600 });
 * ```
 */
export function addVehicle(game: Game, options: AddVehicleOptions): VehicleHandle {
    const visual = options.visual instanceof THREE.Object3D ? { root: options.visual, wheels: [] as THREE.Mesh[] } : createVehicleVisual(options.colors ?? {});

    for (const wheel of visual.wheels) game.scene.add(wheel);

    const vehicle = new VehicleBody(game, { ...options, object: visual.root });
    const controller = new VehicleController(game, vehicle, options.camera);

    // The wheels are ray results, not bodies: spin them with the speed and turn
    // the front pair with the steering.
    const wheelSpin = [0, 0, 0, 0];
    const radius = options.wheelRadius ?? 0.34;
    game.systems.add({
        name: 'vehicle-wheels',
        order: SYSTEM_ORDER.EFFECTS,
        update: (delta) => {
            for (let index = 0; index < visual.wheels.length; index += 1) {
                const mesh = visual.wheels[index];
                const position = vehicle.wheelWorldPosition(index);
                if (!mesh || !position) continue;
                mesh.position.copy(position);
                wheelSpin[index] = (wheelSpin[index] ?? 0) + (vehicle.speed / radius) * delta;
                mesh.rotation.set(wheelSpin[index] ?? 0, vehicle.yaw + (index < 2 ? vehicle.wheelSteering(index) : 0), 0, 'YXZ');
            }
        },
    });

    return {
        vehicle,
        controller,
        wheels: visual.wheels,
        dispose: () => {
            vehicle.dispose();
            controller.dispose();
            for (const wheel of visual.wheels) wheel.removeFromParent();
        },
    };
}

//#endregion Vehicles
