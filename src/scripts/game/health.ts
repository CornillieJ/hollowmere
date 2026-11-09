/**
 * Hit points with an invulnerability window.
 *
 * Used by the player and by anything else that can be shot at. The callbacks
 * are deliberately separate from the event bus: a health bar on one enemy does
 * not want to hear about another enemy's damage.
 */
export type HealthOptions = {
    max?: number;
    /** Seconds of immunity after taking damage. 0 disables it. */
    invulnerableAfterHit?: number;
    /** Health restored per second, 0 disables regeneration. */
    regenPerSecond?: number;
    /** Seconds without damage before regeneration starts. */
    regenDelay?: number;
};

export class Health {
    max: number;
    current: number;
    invulnerableAfterHit: number;
    regenPerSecond: number;
    regenDelay: number;

    private invulnerableTimer = 0;
    private sinceDamage = 0;
    private readonly deathListeners = new Set<() => void>();
    private readonly changeListeners = new Set<(current: number, max: number) => void>();

    constructor(options: HealthOptions = {}) {
        this.max = options.max ?? 100;
        this.current = this.max;
        this.invulnerableAfterHit = options.invulnerableAfterHit ?? 0;
        this.regenPerSecond = options.regenPerSecond ?? 0;
        this.regenDelay = options.regenDelay ?? 5;
    }

    /** Current health as a fraction in 0..1. */
    get ratio(): number {
        return this.max <= 0 ? 0 : Math.max(0, this.current / this.max);
    }

    get isDead(): boolean {
        return this.current <= 0;
    }

    get isInvulnerable(): boolean {
        return this.invulnerableTimer > 0;
    }

    /** Seconds of invulnerability left. */
    get invulnerableRemaining(): number {
        return this.invulnerableTimer;
    }

    /**
     * Apply damage.
     * @returns The health actually removed, 0 while invulnerable or dead.
     */
    damage(amount: number): number {
        if (amount <= 0 || this.isDead || this.isInvulnerable) return 0;
        const applied = Math.min(amount, this.current);
        this.current -= applied;
        this.sinceDamage = 0;
        if (this.invulnerableAfterHit > 0) this.invulnerableTimer = this.invulnerableAfterHit;
        this.notifyChange();
        if (this.current <= 0) this.notifyDeath();
        return applied;
    }

    /** Restore health. Returns the amount actually restored. */
    heal(amount: number): number {
        if (amount <= 0 || this.isDead) return 0;
        const applied = Math.min(amount, this.max - this.current);
        if (applied <= 0) return 0;
        this.current += applied;
        this.notifyChange();
        return applied;
    }

    /** Set health directly, e.g. when loading a save. */
    set(value: number): void {
        this.current = Math.max(0, Math.min(value, this.max));
        this.notifyChange();
        if (this.current <= 0) this.notifyDeath();
    }

    /** Refill and clear the invulnerability timer. */
    reset(): void {
        this.current = this.max;
        this.invulnerableTimer = 0;
        this.sinceDamage = this.regenDelay;
        this.notifyChange();
    }

    /** Make the owner immune for a while, e.g. right after a respawn. */
    setInvulnerable(seconds: number): void {
        this.invulnerableTimer = Math.max(this.invulnerableTimer, seconds);
    }

    /** Empty the health bar and fire the death callbacks. */
    kill(): void {
        if (this.isDead) return;
        this.current = 0;
        this.notifyChange();
        this.notifyDeath();
    }

    /** Called once per frame. Handles the invulnerability timer and regeneration. */
    update(delta: number): void {
        if (this.invulnerableTimer > 0) this.invulnerableTimer = Math.max(0, this.invulnerableTimer - delta);
        if (this.isDead || this.regenPerSecond <= 0) return;
        this.sinceDamage += delta;
        if (this.sinceDamage >= this.regenDelay) this.heal(this.regenPerSecond * delta);
    }

    /** Fires once when health reaches zero. */
    onDeath(listener: () => void): () => void {
        this.deathListeners.add(listener);
        return () => this.deathListeners.delete(listener);
    }

    /** Fires whenever health changes, for HUD updates. */
    onChange(listener: (current: number, max: number) => void): () => void {
        this.changeListeners.add(listener);
        return () => this.changeListeners.delete(listener);
    }

    private notifyDeath(): void {
        for (const listener of [...this.deathListeners]) listener();
    }

    private notifyChange(): void {
        for (const listener of [...this.changeListeners]) listener(this.current, this.max);
    }
}
