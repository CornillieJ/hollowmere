import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

import type { Physics, PhysicsBody } from './physics';

/**
 * A four-wheeled vehicle on Rapier's ray-cast vehicle controller.
 *
 * The chassis is one dynamic box; each wheel is a ray that pushes it along a
 * spring, which is what makes a van feel planted instead of icy. Wheels have no
 * bodies of their own: their world positions come from the controller after
 * each step, which is what the wheel meshes read.
 *
 * Tuning follows the official Rapier vehicle demo: suspension stiffness 100,
 * damping 10, and `EXCLUDE_DYNAMIC` on the wheel rays so they never hit the
 * chassis itself.
 */
export type VehicleOptions = {
    position: THREE.Vector3 | Vec3;
    /** Heading, radians around Y. Defaults to 0. */
    yaw?: number;
    /** Chassis box size in meters. Defaults to a small van. */
    size?: Vec3;
    /** Chassis mass in kg. Defaults to 850. */
    mass?: number;
    /** Visual driven by the chassis. One is made from the size when omitted. */
    object?: THREE.Object3D;
    /** Distance between the front and rear wheel contact points. */
    wheelBase?: number;
    /** Distance between the left and right wheels. */
    trackWidth?: number;
    wheelRadius?: number;
    suspensionRestLength?: number;
    suspensionStiffness?: number;
    suspensionDamping?: number;
    /** Tire grip. Higher is grippier. */
    frictionSlip?: number;
    /** Strongest push a suspension spring may give. Defaults to 100x the weight. */
    maxSuspensionForce?: number;
    /** Newtons on each driving wheel at full throttle. */
    engineForce?: number;
    /** Brake force at full brake. */
    brakeForce?: number;
    /** Largest steering angle of the front wheels, radians. */
    maxSteer?: number;
    /** Which wheels drive and which steer. Defaults to rear drive, front steer. */
    driveWheels?: 'front' | 'rear' | 'all';
    tag?: string;
};

export type VehicleDriveInput = {
    /** -1..1, forward is positive. */
    throttle: number;
    /** -1..1, positive steers left. */
    steer: number;
    /** 0..1. */
    brake?: number;
    /** Cut the engine and hold the wheels, e.g. when parked. */
    handbrake?: boolean;
};

export class VehicleBody {
    /** The object the chassis drives. Add meshes under it. */
    readonly root: THREE.Group;
    readonly chassis: PhysicsBody;
    readonly controller: RAPIER.DynamicRayCastVehicleController;

    private readonly physics: Physics;
    private readonly options: Required<Pick<VehicleOptions, 'engineForce' | 'brakeForce' | 'maxSteer' | 'driveWheels' | 'wheelRadius'>>;
    private readonly scratch = new THREE.Vector3();
    private input: VehicleDriveInput = { throttle: 0, steer: 0 };
    private disposed = false;

    constructor(game: Game, options: VehicleOptions) {
        this.physics = game.physics;
        this.options = {
            engineForce: options.engineForce ?? 5200,
            brakeForce: options.brakeForce ?? 60,
            maxSteer: options.maxSteer ?? 0.55,
            driveWheels: options.driveWheels ?? 'rear',
            wheelRadius: options.wheelRadius ?? 0.34,
        };

        const size = options.size ?? { x: 1.7, y: 1.1, z: 3.4 };
        const wheelBase = options.wheelBase ?? size.z * 0.62;
        const trackWidth = options.trackWidth ?? size.x * 0.82;
        const restLength = options.suspensionRestLength ?? 0.32;

        this.root = new THREE.Group();
        this.root.name = options.object?.name ?? 'vehicle';
        if (options.object) this.root.add(options.object);
        game.scene.add(this.root);

        // The chassis spawns at ride height: ground + wheel + suspension minus
        // the few centimeters the springs settle under the weight.
        const y = options.position.y + this.options.wheelRadius + restLength + size.y / 2 - 0.08;
        this.chassis = this.physics.add({
            kind: 'dynamic',
            shape: { type: 'box', size },
            position: { x: options.position.x, y, z: options.position.z },
            rotation: new THREE.Euler(0, options.yaw ?? 0, 0),
            mass: options.mass ?? 850,
            // A top-heavy van rolling over is a tuning problem, not a feature.
            angularDamping: 3.2,
            linearDamping: 0.04,
            friction: 0.6,
            object: this.root,
            tag: options.tag ?? 'vehicle',
        });

        this.controller = this.physics.world.createVehicleController(this.chassis.rigidBody);

        // Wheels sit at the corners of the chassis' underside. Front wheels are
        // at -z in chassis space: the controller drives -z forward, the same
        // convention as three.js cameras and the character controllers.
        const down = { x: 0, y: -1, z: 0 };
        const axle = { x: 1, y: 0, z: 0 };
        const halfTrack = trackWidth / 2;
        const halfBase = wheelBase / 2;
        const mountY = -size.y / 2;
        const mounts = [
            { x: -halfTrack, y: mountY, z: -halfBase },
            { x: halfTrack, y: mountY, z: -halfBase },
            { x: -halfTrack, y: mountY, z: halfBase },
            { x: halfTrack, y: mountY, z: halfBase },
        ];
        for (const mount of mounts) {
            this.controller.addWheel(mount, down, axle, restLength, this.options.wheelRadius);
        }
        // Suspension tuning, from Rapier's `update_suspension`: the spring force
        // is `stiffness * compression * chassisMass`, so the stiffness answers
        // "how many meters should the springs sag under the weight", not "how
        // strong are the springs". The defaults settle at 30% of the rest
        // length, with damping at 70% of critical and a force ceiling of three
        // times the weight, so a landing does not launch the van.
        const mass = options.mass ?? 850;
        const gravity = Math.abs(this.physics.gravity.y) || 9.81;
        const stiffness = options.suspensionStiffness ?? gravity / (4 * restLength * 0.3);
        const damping = options.suspensionDamping ?? 1.4 * Math.sqrt(stiffness);
        const maxForce = options.maxSuspensionForce ?? mass * gravity * 3;
        for (let index = 0; index < this.controller.numWheels(); index += 1) {
            this.controller.setWheelSuspensionStiffness(index, stiffness);
            this.controller.setWheelSuspensionCompression(index, damping);
            this.controller.setWheelSuspensionRelaxation(index, damping);
            this.controller.setWheelFrictionSlip(index, options.frictionSlip ?? 8);
            this.controller.setWheelMaxSuspensionTravel(index, restLength * 0.8);
            this.controller.setWheelMaxSuspensionForce(index, maxForce);
        }

        game.systems.add({
            name: 'vehicle',
            order: 9, // just before PHYSICS_SYNC: the controller writes chassis velocity
            fixedUpdate: (step) => this.update(step),
        });
    }

    /** Forward speed in meters per second, signed. */
    get speed(): number {
        return this.controller.currentVehicleSpeed();
    }

    /** Speed in km/h, for the HUD. */
    get speedKmh(): number {
        return Math.abs(this.speed) * 3.6;
    }

    /** True while any wheel touches the ground. */
    get grounded(): boolean {
        for (let index = 0; index < this.controller.numWheels(); index += 1) {
            if (this.controller.wheelIsInContact(index)) return true;
        }
        return false;
    }

    get position(): THREE.Vector3 {
        return this.root.position;
    }

    /** Heading of the chassis, radians around Y. */
    get yaw(): number {
        const euler = new THREE.Euler().setFromQuaternion(this.root.quaternion, 'YXZ');
        return euler.y;
    }

    /** Set the driving intent for the next physics steps. */
    drive(input: VehicleDriveInput): void {
        this.input = {
            throttle: THREE.MathUtils.clamp(input.throttle, -1, 1),
            steer: THREE.MathUtils.clamp(input.steer, -1, 1),
            ...(input.brake !== undefined ? { brake: THREE.MathUtils.clamp(input.brake, 0, 1) } : {}),
            ...(input.handbrake !== undefined ? { handbrake: input.handbrake } : {}),
        };
    }

    /** World position of a wheel's contact patch, for the wheel meshes. */
    wheelWorldPosition(index: number, target = new THREE.Vector3()): THREE.Vector3 | undefined {
        const connection = this.controller.wheelChassisConnectionPointCs(index);
        if (!connection) return undefined;
        const length = this.controller.wheelSuspensionLength(index) ?? 0;
        target.set(connection.x, connection.y - length, connection.z);
        return target.applyQuaternion(this.root.quaternion).add(this.root.position);
    }

    /** Steering angle of a front wheel, for turning the wheel meshes. */
    wheelSteering(index: number): number {
        return this.controller.wheelSteering(index) ?? 0;
    }

    /** Drop the vehicle somewhere, with no carried velocity. */
    teleport(position: THREE.Vector3 | Vec3, yaw?: number): void {
        this.chassis.rigidBody.setTranslation({ x: position.x, y: position.y, z: position.z }, true);
        const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw ?? this.yaw, 0));
        this.chassis.rigidBody.setRotation({ x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w }, true);
        this.chassis.rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
        this.chassis.rigidBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.physics.world.removeVehicleController(this.controller);
        this.physics.remove(this.chassis);
        this.root.removeFromParent();
    }

    //#region Internals

    private update(step: number): void {
        if (this.disposed) return;

        const { throttle, steer, brake = 0, handbrake = false } = this.input;
        const wheels = this.controller.numWheels();
        const front = (index: number): boolean => (this.controller.wheelChassisConnectionPointCs(index)?.z ?? 0) < 0;
        const drives = (index: number): boolean => this.options.driveWheels === 'all' || (this.options.driveWheels === 'rear' ? !front(index) : front(index));

        // Steering eases off with speed, so a highway sweeper is not a roll risk.
        const steerLimit = this.options.maxSteer / (1 + Math.abs(this.speed) * 0.06);
        for (let index = 0; index < wheels; index += 1) {
            const engine = handbrake || !drives(index) ? 0 : throttle * this.options.engineForce * (throttle < 0 ? 0.45 : 1);
            this.controller.setWheelEngineForce(index, engine);
            this.controller.setWheelSteering(index, front(index) ? steer * steerLimit : 0);
            const braking = handbrake ? this.options.brakeForce : brake * this.options.brakeForce;
            this.controller.setWheelBrake(index, braking);
        }

        // The wheel rays ignore every dynamic body, which includes the chassis:
        // hitting it would read as driving on yourself.
        this.controller.updateVehicle(step, RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC);
    }

    //#endregion Internals
}
