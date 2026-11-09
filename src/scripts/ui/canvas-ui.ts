import * as THREE from 'three';
import { Text } from 'troika-three-text';
import { RoundedBoxGeometry } from 'three-stdlib';

import { addOverlay } from '../init';

/**
 * UI drawn with three.js, on the game's own canvas.
 *
 * A second scene with an orthographic camera in pixel space is drawn after the
 * game scene, so this looks and behaves like a screen space UI without a single
 * DOM element. Buttons are meshes, labels are troika text, and hit testing is a
 * bounds test in the same space the layout uses, so the same code works for a
 * mouse and for a finger.
 *
 * The camera keeps three.js conventions: the origin is the centre of the canvas
 * and +Y is up. `screenToOverlay` converts pointer coordinates into that space.
 *
 * ```ts
 * const ui = new CanvasUi(game);
 * const menu = ui.addStack({ anchor: 'center' });
 * menu.add(ui.addButton({ label: 'Resume', onClick: resume }));
 * ```
 */
export type Anchor = 'top-left' | 'top-center' | 'top-right' | 'center' | 'bottom-left' | 'bottom-center' | 'bottom-right';

export type Widget = {
    object: THREE.Object3D;
    /** The label as given, so a test can find a button by name. */
    label: string;
    width: number;
    height: number;
    anchor: Anchor;
    offset: { x: number; y: number };
    visible: boolean;
    enabled: boolean;
    hovered: boolean;
    pressed: boolean;
    onClick: (() => void) | undefined;
    repaint: () => void;
    /** Assigned by the stack a widget belongs to. */
    stack: object | undefined;
};

type Stack = {
    anchor: Anchor;
    direction: 'column' | 'row';
    gap: number;
    offset: { x: number; y: number };
    widgets: Widget[];
};

/** Margin from the canvas edge for anchored widgets, in pixels. */
const MARGIN = 18;

export class CanvasUi {
    readonly scene = new THREE.Scene();
    readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1000, 1000);

    /** True while the pointer is over a widget, so the game should ignore it. */
    pointerOverWidget = false;

    private readonly game: Game;
    private readonly widgets: Widget[] = [];
    private readonly stacks: Stack[] = [];
    private readonly disposeOverlay: () => void;
    private readonly zoneCleanups: Array<() => void> = [];
    private pressed: Widget | undefined;
    private readonly onPointerDown: (event: PointerEvent) => void;
    private readonly onPointerMove: (event: PointerEvent) => void;
    private readonly onPointerUp: (event: PointerEvent) => void;
    private width = 1;
    private height = 1;

    constructor(game: Game) {
        this.game = game;
        this.scene.name = 'canvas-ui';
        this.disposeOverlay = addOverlay({ scene: this.scene, camera: this.camera });
        this.resize();

        game.systems.add({ name: 'canvas-ui', order: 999, always: true, update: () => this.resize() });

        this.onPointerDown = (event) => {
            const hit = this.hitTest(event.clientX, event.clientY);
            if (!hit) return;
            // A press on a widget is ours: the game must not also act on it.
            this.game.input.pointerOverUi = true;
            event.preventDefault();
            event.stopPropagation();
            this.pressed = hit;
            hit.pressed = true;
            hit.repaint();
        };

        this.onPointerMove = (event) => {
            const hit = this.hitTest(event.clientX, event.clientY);
            const over = hit !== undefined;
            if (over !== this.pointerOverWidget) {
                this.pointerOverWidget = over;
                this.game.input.pointerOverUi = over;
            }
            for (const widget of this.widgets) {
                const hovered = widget === hit;
                if (hovered === widget.hovered) continue;
                widget.hovered = hovered;
                widget.repaint();
            }
        };

        this.onPointerUp = (event) => {
            // A finger lifts without a move afterwards, so the flag would stick and eat the next world tap.
            if (event.pointerType !== 'mouse') {
                this.pointerOverWidget = false;
                this.game.input.pointerOverUi = false;
            }
            const widget = this.pressed;
            this.pressed = undefined;
            if (!widget) return;
            widget.pressed = false;
            widget.repaint();
            if (this.hitTest(event.clientX, event.clientY) !== widget) return;
            event.preventDefault();
            event.stopPropagation();
            widget.onClick?.();
        };

        game.canvas.addEventListener('pointerdown', this.onPointerDown, { capture: true });
        window.addEventListener('pointermove', this.onPointerMove, { passive: true });
        window.addEventListener('pointerup', this.onPointerUp);
        window.addEventListener('pointercancel', this.onPointerUp);
    }

    /** Canvas size in CSS pixels. */
    get size(): { width: number; height: number } {
        return { width: this.width, height: this.height };
    }

    /** Every widget, for tests and for a settings screen. */
    get allWidgets(): Widget[] {
        return [...this.widgets];
    }

    /** True when the pointer is over a widget. */
    get isClaimingPointer(): boolean {
        return this.pointerOverWidget;
    }

    //#region Widgets

    /** Add a button. Returns the widget so it can be moved or hidden later. */
    addButton(options: {
        label: string;
        onClick?: () => void;
        width?: number;
        height?: number;
        anchor?: Anchor;
        offset?: { x: number; y: number };
        fontSize?: number;
        primary?: boolean;
        icon?: string;
        color?: THREE.ColorRepresentation;
    }): Widget {
        const width = options.width ?? 200;
        const height = options.height ?? 48;
        const base = new THREE.Color(options.color ?? (options.primary ? 0x2f6f9e : 0x232833));
        const hover = base.clone().offsetHSL(0, 0.05, 0.08);
        const down = base.clone().offsetHSL(0, 0.05, -0.04);

        const group = new THREE.Group();
        const plate = new THREE.Mesh(new RoundedBoxGeometry(width, height, 2, 4, Math.min(height / 2 - 1, 9)), new THREE.MeshBasicMaterial({ color: base, transparent: true, opacity: 0.94 }));
        group.add(plate);

        const label = new Text();
        label.text = options.icon ? `${options.icon}  ${options.label}` : options.label;
        label.fontSize = options.fontSize ?? Math.round(height * 0.42);
        label.color = 0xf4f6fb;
        label.anchorX = '50%';
        label.anchorY = '50%';
        label.maxWidth = width - 18;
        label.textAlign = 'center';
        label.position.z = 1;
        label.sync();
        group.add(label);

        this.scene.add(group);

        const widget: Widget = {
            object: group,
            label: options.label,
            width,
            height,
            anchor: options.anchor ?? 'center',
            offset: options.offset ?? { x: 0, y: 0 },
            visible: true,
            enabled: true,
            hovered: false,
            pressed: false,
            onClick: options.onClick,
            stack: undefined,
            repaint: () => {
                const material = plate.material as THREE.MeshBasicMaterial;
                material.color.copy(widget.pressed ? down : widget.hovered ? hover : base);
                material.opacity = widget.enabled ? 0.94 : 0.38;
                group.scale.setScalar(widget.pressed ? 0.97 : 1);
            },
        };
        this.widgets.push(widget);
        this.layout();
        return widget;
    }

    /** Add a rounded panel, e.g. the backing of a menu. */
    addPanel(options: { width: number; height: number; anchor?: Anchor; offset?: { x: number; y: number }; title?: string; color?: THREE.ColorRepresentation }): Widget {
        const group = new THREE.Group();
        const plate = new THREE.Mesh(new RoundedBoxGeometry(options.width, options.height, 2, 6, 14), new THREE.MeshBasicMaterial({ color: options.color ?? 0x11151d, transparent: true, opacity: 0.9 }));
        group.add(plate);

        if (options.title) {
            const title = new Text();
            title.text = options.title;
            title.fontSize = 21;
            title.color = 0xf4f6fb;
            title.anchorX = '50%';
            title.anchorY = 'top';
            title.position.set(0, options.height / 2 - 14, 1.5);
            title.sync();
            group.add(title);
        }

        this.scene.add(group);
        const widget: Widget = {
            object: group,
            label: options.title ?? 'panel',
            width: options.width,
            height: options.height,
            anchor: options.anchor ?? 'center',
            offset: options.offset ?? { x: 0, y: 0 },
            visible: true,
            // Panels do not take clicks themselves, but they do block them.
            enabled: false,
            hovered: false,
            pressed: false,
            onClick: undefined,
            stack: undefined,
            repaint: () => undefined,
        };
        this.widgets.push(widget);
        this.layout();
        return widget;
    }

    /** Add a group of widgets that lay out together, e.g. a vertical menu. */
    addStack(options: { anchor: Anchor; direction?: 'column' | 'row'; gap?: number; offset?: { x: number; y: number } }): {
        add: (...widgets: Widget[]) => void;
        readonly widgets: Widget[];
    } {
        const stack: Stack = {
            anchor: options.anchor,
            direction: options.direction ?? 'column',
            gap: options.gap ?? 10,
            offset: options.offset ?? { x: 0, y: 0 },
            widgets: [],
        };
        this.stacks.push(stack);
        return {
            add: (...widgets: Widget[]) => {
                for (const widget of widgets) {
                    widget.anchor = stack.anchor;
                    widget.stack = stack;
                    stack.widgets.push(widget);
                }
                this.layout();
            },
            get widgets() {
                return [...stack.widgets];
            },
        };
    }

    /** Show or hide a widget. A hidden widget is not hit tested. */
    setVisible(widget: Widget, visible: boolean): void {
        widget.visible = visible;
        widget.object.visible = visible;
        this.layout();
    }

    /** Enable or disable a widget. A disabled one is dimmed and inert. */
    setEnabled(widget: Widget, enabled: boolean): void {
        widget.enabled = enabled;
        widget.repaint();
    }

    /** Find a widget by the label it was created with. */
    find(label: string): Widget | undefined {
        return this.widgets.find((widget) => widget.label.toLowerCase().includes(label.toLowerCase()));
    }

    /** Remove one widget. */
    remove(widget: Widget): void {
        this.scene.remove(widget.object);
        const index = this.widgets.indexOf(widget);
        if (index >= 0) this.widgets.splice(index, 1);
        for (const stack of this.stacks) {
            const stackIndex = stack.widgets.indexOf(widget);
            if (stackIndex >= 0) stack.widgets.splice(stackIndex, 1);
        }
        this.layout();
    }

    //#endregion Widgets

    //#region Layout and input

    /**
     * Position every widget from its anchor, its stack and the canvas size.
     * A stack walks a cursor away from its anchored edge, which keeps the maths
     * readable and makes the order in the stack the order on screen.
     */
    layout(): void {
        for (const widget of this.widgets) {
            if (!widget.visible) continue;
            const stack = widget.stack as Stack | undefined;
            const anchor = stack?.anchor ?? widget.anchor;
            const base = this.anchorPosition(anchor);
            widget.object.position.set(base.x + (stack?.offset.x ?? 0) + widget.offset.x, base.y + (stack?.offset.y ?? 0) + widget.offset.y, 0);
        }

        for (const stack of this.stacks) {
            const base = this.anchorPosition(stack.anchor);
            // A column grows downwards from a top anchor and upwards from a bottom
            // one; a row grows rightwards from a left anchor and leftwards from a
            // right one.
            const vertical = stack.direction === 'column';
            const direction = vertical ? (stack.anchor.startsWith('bottom') ? 1 : stack.anchor.startsWith('top') ? -1 : 1) : stack.anchor.endsWith('right') ? -1 : 1;
            let cursor = 0;

            for (const widget of stack.widgets) {
                if (!widget.visible) continue;
                const size = vertical ? widget.height : widget.width;
                // A centred column starts centred on the anchor.
                const start = stack.anchor === 'center' && vertical ? -cursor - size / 2 + (stack.widgets.length * (size + stack.gap)) / 4 : direction * (cursor + size / 2);
                const offset = start;
                widget.object.position.set(base.x + stack.offset.x + (vertical ? widget.offset.x : offset), base.y + stack.offset.y + (vertical ? offset : widget.offset.y), 0);
                cursor += size + stack.gap;
            }
        }

        this.syncZones();
    }

    /** Anchor position in overlay space: origin at the centre, +Y is up. */
    anchorPosition(anchor: Anchor): { x: number; y: number } {
        const left = -this.width / 2 + MARGIN;
        const right = this.width / 2 - MARGIN;
        const top = this.height / 2 - MARGIN;
        const bottom = -this.height / 2 + MARGIN;
        switch (anchor) {
            case 'top-left':
                return { x: left, y: top };
            case 'top-center':
                return { x: 0, y: top };
            case 'top-right':
                return { x: right, y: top };
            case 'bottom-left':
                return { x: left, y: bottom };
            case 'bottom-center':
                return { x: 0, y: bottom };
            case 'bottom-right':
                return { x: right, y: bottom };
            default:
                return { x: 0, y: 0 };
        }
    }

    /** Pointer position in overlay space. */
    screenToOverlay(clientX: number, clientY: number, out = new THREE.Vector2()): THREE.Vector2 {
        const rect = this.game.canvas.getBoundingClientRect();
        return out.set(clientX - rect.left - rect.width / 2, rect.height / 2 - (clientY - rect.top));
    }

    /** Which widget is under a pointer position, in CSS pixels. */
    hitTest(clientX: number, clientY: number): Widget | undefined {
        const point = this.screenToOverlay(clientX, clientY, this.scratch);
        // Later widgets are drawn on top, so test from the end.
        for (let index = this.widgets.length - 1; index >= 0; index -= 1) {
            const widget = this.widgets[index] as Widget;
            if (!widget.visible) continue;
            const position = widget.object.position;
            if (Math.abs(point.x - position.x) > widget.width / 2) continue;
            if (Math.abs(point.y - position.y) > widget.height / 2) continue;
            // A disabled widget still blocks the game from seeing the click, but
            // it reports no hit so nothing happens.
            return widget.enabled ? widget : undefined;
        }
        return undefined;
    }

    /** Resize the overlay camera to the canvas, then re-lay out. */
    resize(): void {
        const width = this.game.canvas.clientWidth || this.game.sizes.width;
        const height = this.game.canvas.clientHeight || this.game.sizes.height;
        if (width === this.width && height === this.height) return;
        this.width = width;
        this.height = height;
        this.camera.left = -width / 2;
        this.camera.right = width / 2;
        this.camera.top = height / 2;
        this.camera.bottom = -height / 2;
        this.camera.updateProjectionMatrix();
        this.layout();
    }

    /**
     * Register a touch zone per visible widget, so a finger that starts on a
     * button does not also turn the camera.
     */
    private syncZones(): void {
        for (const cleanup of this.zoneCleanups) cleanup();
        this.zoneCleanups.length = 0;
        const rect = this.game.canvas.getBoundingClientRect();
        for (const widget of this.widgets) {
            if (!widget.visible) continue;
            const position = widget.object.position;
            const radius = Math.max(widget.width, widget.height) / 2;
            this.zoneCleanups.push(
                this.game.input.touch.addZone({
                    x: rect.left + rect.width / 2 + position.x,
                    y: rect.top + rect.height / 2 - position.y,
                    radius,
                }),
            );
        }
    }

    private readonly scratch = new THREE.Vector2();

    /** Remove every widget and stop drawing. */
    dispose(): void {
        this.disposeOverlay();
        this.game.canvas.removeEventListener('pointerdown', this.onPointerDown, { capture: true });
        window.removeEventListener('pointermove', this.onPointerMove);
        window.removeEventListener('pointerup', this.onPointerUp);
        window.removeEventListener('pointercancel', this.onPointerUp);
        for (const cleanup of this.zoneCleanups) cleanup();
        this.zoneCleanups.length = 0;
        for (const widget of this.widgets) this.scene.remove(widget.object);
        this.widgets.length = 0;
        this.stacks.length = 0;
    }

    //#endregion Layout and input
}
