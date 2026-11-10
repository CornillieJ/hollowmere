import { div } from '../helpers/dom';

/**
 * Heads-up display.
 *
 * A fixed set of widgets that most games need: crosshair, health, lives, ammo
 * and an objective line. Anything it does not cover goes in with
 * `setStat(name, value)`, which creates the row on first use.
 */
export type HudOptions = {
    showCrosshair?: boolean;
    showHealth?: boolean;
    showLives?: boolean;
    showAmmo?: boolean;
    showObjective?: boolean;
};

export class Hud {
    readonly root: HTMLElement;
    readonly crosshair: HTMLElement;

    private readonly healthFill: HTMLElement;
    private readonly healthValue: HTMLElement;
    private readonly healthMeter: HTMLElement;
    private readonly livesBlock: HTMLElement;
    private readonly ammoBlock: HTMLElement;
    private readonly livesValue: HTMLElement;
    private readonly ammoValue: HTMLElement;
    private readonly objectiveElement: HTMLElement;
    private readonly statsContainer: HTMLElement;
    private readonly stats = new Map<string, { row: HTMLElement; value: HTMLElement; label: HTMLElement }>();

    constructor(parent: HTMLElement, options: HudOptions = {}) {
        this.root = div('hud', undefined, parent);

        this.crosshair = div('crosshair click-through', undefined, this.root);
        this.crosshair.classList.toggle('is-hidden', options.showCrosshair === false);

        this.healthMeter = div('hud-bar click-through', undefined, this.root);
        const healthRow = div('hud-label', undefined, this.healthMeter);
        div('', 'HEALTH', healthRow);
        this.healthValue = div('', '100 / 100', healthRow);
        this.healthFill = div('hud-fill', undefined, div('hud-track', undefined, this.healthMeter));
        this.healthMeter.classList.toggle('is-hidden', options.showHealth === false);

        const counters = div('hud-stats click-through', undefined, this.root);
        this.livesValue = div('hud-stat-value', '0', div('hud-stat', undefined, counters));
        this.livesBlock = this.livesValue.parentElement as HTMLElement;
        div('hud-stat-label', 'LIVES', this.livesBlock);
        // Lives and ammo only mean something in some genres, so they are opt-in.
        this.livesBlock.classList.toggle('is-hidden', options.showLives !== true);

        this.ammoValue = div('hud-stat-value', '0', div('hud-stat', undefined, counters));
        this.ammoBlock = this.ammoValue.parentElement as HTMLElement;
        div('hud-stat-label', 'AMMO', this.ammoBlock);
        this.ammoBlock.classList.toggle('is-hidden', options.showAmmo !== true);

        this.statsContainer = div('click-through', undefined, this.root);
        Object.assign(this.statsContainer.style, {
            position: 'absolute',
            bottom: '28px',
            right: '28px',
            display: 'grid',
            gap: '6px',
            fontSize: '13px',
            textAlign: 'right',
        } satisfies Partial<CSSStyleDeclaration>);

        this.objectiveElement = div('hud-objective click-through', undefined, this.root);
        this.objectiveElement.classList.toggle('is-hidden', options.showObjective !== true);
    }

    /** Set the health bar. `max` defaults to 100. */
    setHealth(current: number, max = 100): void {
        const ratio = max <= 0 ? 0 : Math.max(0, Math.min(1, current / max));
        this.healthFill.style.width = `${ratio * 100}%`;
        this.healthFill.classList.toggle('is-low', ratio <= 0.3);
        this.healthValue.textContent = `${Math.ceil(current)} / ${Math.ceil(max)}`;
    }

    /** Set the remaining lives. */
    setLives(lives: number): void {
        this.livesValue.textContent = String(Math.max(0, lives));
    }

    /** Set the ammo counter. Omit `reserve` to show a single number. */
    setAmmo(current: number, reserve?: number): void {
        this.ammoValue.textContent = reserve === undefined ? String(current) : `${current} / ${reserve}`;
    }

    /** Show or hide the crosshair, optionally marking it as "on target". */
    setCrosshair(visible: boolean, active = false): void {
        this.crosshair.classList.toggle('is-hidden', !visible);
        this.crosshair.classList.toggle('is-active', active);
    }

    /** Show or hide the health meter. */
    setHealthVisible(visible: boolean): void {
        this.healthMeter.classList.toggle('is-hidden', !visible);
    }

    /** Show or hide the lives counter. */
    setLivesVisible(visible: boolean): void {
        this.livesBlock.classList.toggle('is-hidden', !visible);
    }

    /** Show or hide the ammo counter. */
    setAmmoVisible(visible: boolean): void {
        this.ammoBlock.classList.toggle('is-hidden', !visible);
    }

    /** Hide every counter that only some genres need, e.g. for a board game. */
    setCombatCountersVisible(visible: boolean): void {
        this.setHealthVisible(visible);
        this.setLivesVisible(visible);
        this.setAmmoVisible(visible);
    }

    /** Replace the objective line. Empty text hides it. */
    setObjective(text: string): void {
        this.objectiveElement.textContent = text;
        this.objectiveElement.classList.toggle('is-hidden', text.length === 0);
    }

    /** Add or update an arbitrary stat row, e.g. `setStat('gold', 240)`. */
    setStat(name: string, value: string | number, label?: string): void {
        let entry = this.stats.get(name);
        if (!entry) {
            const row = div('click-through', undefined, this.statsContainer);
            Object.assign(row.style, { display: 'flex', justifyContent: 'flex-end', gap: '10px' } satisfies Partial<CSSStyleDeclaration>);
            const labelElement = div('hud-stat-label', (label ?? name).toUpperCase(), row);
            const valueElement = div('', '', row);
            valueElement.style.fontWeight = '600';
            entry = { row, value: valueElement, label: labelElement };
            this.stats.set(name, entry);
        }
        entry.value.textContent = String(value);
        if (label) entry.label.textContent = label.toUpperCase();
    }

    /** Give a stat row a quick pulse, e.g. when money comes in. */
    bumpStat(name: string): void {
        const row = this.stats.get(name)?.row;
        if (!row) return;
        row.classList.remove('is-bump');
        // Reading a layout value restarts the animation for back-to-back bumps.
        void row.offsetWidth;
        row.classList.add('is-bump');
    }

    /** Remove a stat row entirely. */
    removeStat(name: string): void {
        const entry = this.stats.get(name);
        if (!entry) return;
        entry.row.remove();
        this.stats.delete(name);
    }

    /** Reset every widget to a neutral state, e.g. before a level loads. */
    reset(health = 100, lives = 0): void {
        this.setHealth(health, health);
        this.setLives(lives);
        this.setAmmo(0);
        this.setObjective('');
        for (const name of [...this.stats.keys()]) this.removeStat(name);
    }

    /** Hide or show the whole HUD. */
    setVisible(visible: boolean): void {
        this.root.classList.toggle('is-hidden', !visible);
    }
}
