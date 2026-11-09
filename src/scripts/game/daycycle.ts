import * as THREE from 'three';

import { SYSTEM_ORDER } from '../core/systems';
import { color as toColor } from '../helpers/color';
import type { LightingRefs } from '../setup/setup-scene';

/**
 * Time of day.
 *
 * Drives the sun's direction and colour, an ambient tint and a day counter.
 * Events fire at day start, dusk, night and day end, which is all a farming,
 * survival or shop-sim game needs to hang its logic on.
 */
export type DayCycleOptions = {
    /** Real seconds for a full 24 hour day. */
    dayLength?: number;
    /** Hour of day to start at, 0 to 24. */
    startHour?: number;
    /** Day number to start at, day 1 is the first day. */
    startDay?: number;
    /** Freeze time, e.g. while a menu is open. */
    paused?: boolean;
    /** Update the scene lighting from the time of day. */
    lighting?: LightingRefs;
    /** Sun colour at noon and at dusk; the cycle interpolates between them. */
    noonColor?: THREE.ColorRepresentation;
    duskColor?: THREE.ColorRepresentation;
    nightColor?: THREE.ColorRepresentation;
    /** Scene background colour by phase. */
    skyDay?: THREE.ColorRepresentation;
    skyNight?: THREE.ColorRepresentation;
};

export type DayPhase = 'night' | 'dawn' | 'day' | 'dusk';

export class DayCycle {
    /** Real seconds for a full day. */
    dayLength: number;
    /** Current hour in 0..24, with a fractional part. */
    hour: number;
    /** Day counter, starts at 1. */
    day: number;
    /** Freeze time without unregistering the system. */
    paused: boolean;

    /** Optional callbacks for the moments a game cares about. */
    readonly hooks: {
        /** Fires when the clock passes an hour. */
        onHour?: (hour: number) => void;
        /** Fires once at midnight. */
        onDayStart?: (day: number) => void;
        /** Fires at 18:00, when a shop would close. */
        onDusk?: (day: number) => void;
        /** Fires at 21:00. */
        onNight?: (day: number) => void;
        /** Fires at 06:00, when the day begins in earnest. */
        onMorning?: (day: number) => void;
        /** Fires on every change, for a clock HUD. */
        onTick?: (hour: number, day: number, phase: DayPhase) => void;
    } = {};

    private readonly game: Game;
    private readonly lighting: LightingRefs | undefined;
    private readonly noonColor: THREE.Color;
    private readonly duskColor: THREE.Color;
    private readonly nightColor: THREE.Color;
    private readonly skyDay: THREE.Color;
    private readonly skyNight: THREE.Color;
    private readonly sunDirection = new THREE.Vector3();
    private lastHour: number;

    constructor(game: Game, options: DayCycleOptions = {}) {
        this.game = game;
        this.dayLength = options.dayLength ?? 600;
        this.hour = options.startHour ?? 8;
        this.day = options.startDay ?? 1;
        this.paused = options.paused ?? false;
        this.lastHour = Math.floor(this.hour);

        this.lighting = options.lighting;
        this.noonColor = toColor(options.noonColor ?? 0xfff2d5);
        this.duskColor = toColor(options.duskColor ?? 0xff9a52);
        this.nightColor = toColor(options.nightColor ?? 0x7d9cff);
        this.skyDay = toColor(options.skyDay ?? 0x9fc3ef);
        this.skyNight = toColor(options.skyNight ?? 0x0a1024);

        game.systems.add({
            name: 'day-cycle',
            order: SYSTEM_ORDER.GAMEPLAY - 1,
            update: (delta) => this.update(delta),
        });
        this.apply();
    }

    /** A clock string, e.g. '07:30'. */
    get clock(): string {
        const hours = Math.floor(this.hour) % 24;
        const minutes = Math.floor((this.hour % 1) * 60);
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }

    /** Coarse phase of the day, useful for gating activities. */
    get phase(): DayPhase {
        if (this.hour < 5 || this.hour >= 21) return 'night';
        if (this.hour < 8) return 'dawn';
        if (this.hour < 18) return 'day';
        return 'dusk';
    }

    /** 0 at midnight, 1 at noon. Handy for shaders and audio mixes. */
    get daylight(): number {
        return Math.max(0, Math.sin(((this.hour - 6) / 12) * Math.PI));
    }

    /** Jump the clock, e.g. `cycle.setHour(6)` to start the morning. */
    setHour(hour: number): void {
        this.hour = ((hour % 24) + 24) % 24;
        this.apply();
    }

    /** Skip to the next morning, e.g. when the player sleeps. */
    sleep(): void {
        this.hour = 6;
        this.day += 1;
        this.lastHour = 6;
        this.apply();
        this.hooks.onDayStart?.(this.day);
        this.hooks.onMorning?.(this.day);
    }

    private update(delta: number): void {
        if (this.paused) return;
        this.hour += (delta / this.dayLength) * 24;

        if (this.hour >= 24) {
            this.hour -= 24;
            this.day += 1;
            this.hooks.onDayStart?.(this.day);
        }

        const hour = Math.floor(this.hour);
        if (hour !== this.lastHour) {
            this.lastHour = hour;
            this.hooks.onHour?.(hour);
            if (hour === 6) this.hooks.onMorning?.(this.day);
            if (hour === 18) this.hooks.onDusk?.(this.day);
            if (hour === 21) this.hooks.onNight?.(this.day);
        }

        this.apply();
        this.hooks.onTick?.(this.hour, this.day, this.phase);
    }

    /** Push the current time into the scene lighting. */
    private apply(): void {
        const elevation = Math.sin(((this.hour - 6) / 12) * Math.PI);
        const azimuth = ((this.hour - 6) / 12) * Math.PI;
        this.sunDirection.set(Math.cos(azimuth) * 0.6, Math.max(elevation, -0.35), Math.sin(azimuth) * 0.6).normalize();

        if (!this.lighting) return;
        const { sun, hemisphere, fill } = this.lighting;
        sun.position.copy(this.sunDirection).multiplyScalar(30);
        sun.target.position.set(0, 0, 0);
        sun.target.updateMatrixWorld();

        // Dawn and dusk glow orange, midday is warm white, night is moon blue.
        const warm = Math.min(1, Math.abs(elevation - 0.25) * 2.2);
        sun.color.copy(this.noonColor).lerp(elevation < 0.05 ? this.duskColor : this.nightColor, warm);
        sun.intensity = Math.max(0.05, 2.4 * Math.max(elevation, 0) + 0.25);
        hemisphere.intensity = 0.18 + 0.45 * Math.max(elevation, 0);
        fill.intensity = 0.15 + 0.25 * Math.max(elevation, 0);

        if (this.game.scene.background instanceof THREE.Color) {
            this.game.scene.background.copy(this.skyNight).lerp(this.skyDay, Math.max(elevation, 0));
        }
    }
}
