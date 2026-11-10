import { div } from '../helpers/dom';

/**
 * Named UI layers.
 *
 * Every piece of interface mounts into a screen instead of directly onto the UI
 * root, so a game can say "the inventory lives in the modal screen" and let the
 * layer handle stacking, pointer events and input blocking.
 *
 * The four built-in names cover almost everything:
 *  - `hud`     always-on gameplay readouts, clicks pass through
 *  - `menu`    full screen menus, they take clicks and pause the game
 *  - `modal`   dialogs that sit above whatever else is showing
 *  - `overlay` transitions, flashes and letterboxes
 *
 * Custom names are just strings, and layers are created on first use.
 */
export type ScreenName = string;

/** Layers that swallow clicks and therefore block gameplay input. */
export const BLOCKING_SCREENS: ScreenName[] = ['menu', 'modal'];

export type ScreensOptions = {
    /** Extra layer names to create up front, in stacking order. */
    layers?: ScreenName[];
    /** Layers that start visible. Defaults to just the HUD. */
    visible?: ScreenName[];
    /** Screens that should block input while visible. Defaults to menus and modals. */
    blocking?: ScreenName[];
};

export class Screens {
    /** Where every layer lives, normally `game.uiRoot`. */
    readonly root: HTMLElement;

    private readonly layers = new Map<ScreenName, HTMLElement>();
    private readonly owners = new Map<ScreenName, Set<object>>();
    private readonly blocking: Set<ScreenName>;
    private readonly listeners = new Set<() => void>();
    private zIndex = 10;

    constructor(root: HTMLElement, options: ScreensOptions = {}) {
        this.root = root;
        this.blocking = new Set(options.blocking ?? BLOCKING_SCREENS);

        for (const name of options.layers ?? ['hud', 'menu', 'modal', 'overlay']) this.layer(name);
        for (const name of options.visible ?? ['hud']) this.show(name);
    }

    /** The element for a layer, creating and stacking it when new. */
    layer(name: ScreenName): HTMLElement {
        const existing = this.layers.get(name);
        if (existing) return existing;

        const element = div(`screen screen-${name} is-hidden`, undefined, this.root);
        element.dataset.screen = name;
        element.style.position = 'absolute';
        element.style.inset = '0';
        element.style.zIndex = String(this.zIndex);
        // Only the layers that take interaction stop clicks reaching the game.
        element.style.pointerEvents = this.blocking.has(name) ? 'auto' : 'none';
        this.zIndex += 1;

        this.layers.set(name, element);
        return element;
    }

    /** All layer names, in stacking order. */
    get names(): ScreenName[] {
        return [...this.layers.keys()];
    }

    /**
     * Show a layer. Pass an `owner` (the panel doing it) when several things share
     * a layer: the layer then stays up until every owner has hidden it again.
     */
    show(name: ScreenName, owner?: object): void {
        if (owner) this.ownersOf(name).add(owner);
        const element = this.layer(name);
        if (!element.classList.contains('is-hidden')) return;
        element.classList.remove('is-hidden');
        this.notify();
    }

    /** Hide a layer. With an `owner`, only once no other owner still needs it. */
    hide(name: ScreenName, owner?: object): void {
        if (owner) {
            const owners = this.ownersOf(name);
            owners.delete(owner);
            if (owners.size > 0) return;
        } else {
            this.owners.delete(name);
        }
        const element = this.layers.get(name);
        if (!element || element.classList.contains('is-hidden')) return;
        element.classList.add('is-hidden');
        this.notify();
    }

    private ownersOf(name: ScreenName): Set<object> {
        let owners = this.owners.get(name);
        if (!owners) {
            owners = new Set();
            this.owners.set(name, owners);
        }
        return owners;
    }

    /** Show or hide, and report the new state. */
    toggle(name: ScreenName): boolean {
        const visible = this.isVisible(name);
        if (visible) this.hide(name);
        else this.show(name);
        return !visible;
    }

    /** True when the layer is on screen. */
    isVisible(name: ScreenName): boolean {
        const element = this.layers.get(name);
        return element !== undefined && !element.classList.contains('is-hidden');
    }

    /** Layers currently on screen, in stacking order. */
    get visible(): ScreenName[] {
        return this.names.filter((name) => this.isVisible(name));
    }

    /** True when a blocking layer is up, i.e. the game should ignore gameplay input. */
    get blocksInput(): boolean {
        for (const name of this.blocking) {
            if (this.isVisible(name)) return true;
        }
        return false;
    }

    /** True when any layer at all is visible. */
    get anyVisible(): boolean {
        return this.visible.length > 0;
    }

    /** Add or remove a layer from the input blocking set. */
    setBlocking(name: ScreenName, blocks: boolean): void {
        if (blocks) this.blocking.add(name);
        else this.blocking.delete(name);
        const element = this.layers.get(name);
        if (element) element.style.pointerEvents = blocks ? 'auto' : 'none';
    }

    /** Hide every layer. */
    hideAll(): void {
        for (const name of this.names) this.hide(name);
    }

    /** Notified whenever any layer changes visibility. Returns an unsubscribe function. */
    onChange(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /**
     * Keep an input gate disabled while a blocking screen is up, so gameplay
     * systems do not react to keys pressed inside a menu.
     * Pass `game.input`; call it once during boot.
     */
    bindInput(input: { setGate: (name: string, open: boolean) => void }, gate = 'screens'): () => void {
        const apply = (): void => input.setGate(gate, !this.blocksInput);
        apply();
        return this.onChange(apply);
    }

    private notify(): void {
        for (const listener of [...this.listeners]) listener();
    }
}
