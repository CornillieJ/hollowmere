import * as THREE from 'three';
import { Text } from 'troika-three-text';

/**
 * Text in 3D space, built on troika-three-text.
 *
 * Troika renders crisp signed-distance-field glyphs, so labels stay sharp at any
 * distance and cost one draw call each. For text that lives in the DOM, use
 * `ui/toasts.ts` or `fx/floating-text.ts` instead.
 */
export type LabelOptions = {
    /** Font size in world units. Defaults to 0.3. */
    fontSize?: number;
    color?: THREE.ColorRepresentation;
    fontWeight?: number | string;
    /** Maximum line width in world units before wrapping. */
    maxWidth?: number;
    textAlign?: 'left' | 'right' | 'center' | 'justify';
    anchorX?: number | string;
    anchorY?: number | string;
    lineHeight?: number | 'normal';
    letterSpacing?: number;
    /** Dark outline that keeps text readable against a busy background. */
    outlineWidth?: number | string;
    outlineColor?: THREE.ColorRepresentation;
    /** Render order offset, useful when a label sits on a surface. */
    depthOffset?: number;
    /** Load a custom font from a url, e.g. 'fonts/inter.woff'. */
    font?: string;
};

/** Default font size in world units for 3D labels. */
export const DEFAULT_LABEL_SIZE = 0.3;

/** Create a text mesh. Remember `label.sync()` is called for you. */
export function createLabel(text: string, options: LabelOptions = {}): Text {
    const label = new Text();
    applyLabelOptions(label, options);
    label.text = text;
    label.sync();
    return label;
}

/** Create a label and place it, in one call. */
export function createLabelAt(text: string, position: THREE.Vector3 | Vec3, options: LabelOptions = {}): Text {
    const label = createLabel(text, options);
    label.position.set(position.x, position.y, position.z);
    return label;
}

/** Overwrite the text of an existing label and re-upload it. */
export function setLabelText(label: Text, text: string): Text {
    label.text = text;
    label.sync();
    return label;
}

/** Change several label options at once and re-upload. */
export function updateLabel(label: Text, options: LabelOptions): Text {
    applyLabelOptions(label, options);
    label.sync();
    return label;
}

/**
 * Label that always faces the camera.
 * Register it with `game.systems` so it updates every frame.
 */
export function createBillboardLabel(text: string, position: THREE.Vector3 | Vec3, options: LabelOptions = {}): Text {
    const label = createLabelAt(text, position, options);
    label.userData.billboard = true;
    return label;
}

/** Orient a label so it faces a camera, cancelling out the parent's rotation. */
export function faceCamera(label: THREE.Object3D, camera: THREE.Camera): void {
    if (!label.userData.billboard) return;
    label.quaternion.copy(camera.quaternion);
    const parent = label.parent;
    if (parent) label.quaternion.premultiply(parent.getWorldQuaternion(new THREE.Quaternion()).invert());
}

/** Convenience: a label that shows a number with a fixed number of decimals. */
export function createCounterLabel(value: number, position: THREE.Vector3 | Vec3, options: LabelOptions & { decimals?: number; suffix?: string } = {}): Text {
    const decimals = options.decimals ?? 0;
    return createLabelAt(`${value.toFixed(decimals)}${options.suffix ?? ''}`, position, options);
}

/** Update a counter label created by `createCounterLabel`. */
export function setCounterValue(label: Text, value: number, decimals = 0, suffix = ''): Text {
    return setLabelText(label, `${value.toFixed(decimals)}${suffix}`);
}

function applyLabelOptions(label: Text, options: LabelOptions): void {
    label.fontSize = options.fontSize ?? DEFAULT_LABEL_SIZE;
    label.color = options.color ?? 0xffffff;
    if (options.fontWeight !== undefined) label.fontWeight = options.fontWeight;
    if (options.font) label.font = options.font;
    label.maxWidth = options.maxWidth ?? Infinity;
    label.textAlign = options.textAlign ?? 'center';
    label.anchorX = options.anchorX ?? '50%';
    label.anchorY = options.anchorY ?? '50%';
    if (options.lineHeight !== undefined) label.lineHeight = options.lineHeight;
    if (options.letterSpacing !== undefined) label.letterSpacing = options.letterSpacing;
    if (options.outlineWidth !== undefined) {
        label.outlineWidth = options.outlineWidth;
        label.outlineColor = options.outlineColor ?? 0x000000;
    }
    if (options.depthOffset !== undefined) label.depthOffset = options.depthOffset;
}
