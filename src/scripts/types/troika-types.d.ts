/**
 * Ambient types for troika-three-text, which ships without TypeScript types.
 * Only the surface this project uses is declared.
 */
declare module 'troika-three-text' {
    import type * as THREE from 'three';

    export type TextAlign = 'left' | 'right' | 'center' | 'justify';
    export type Anchor = number | string;

    export class Text extends THREE.Mesh {
        text: string;
        font: string | null;
        fontSize: number;
        fontWeight: number | string;
        fontStyle: string;
        letterSpacing: number;
        lineHeight: number | 'normal';
        maxWidth: number;
        textAlign: TextAlign;
        anchorX: Anchor;
        anchorY: Anchor;
        color: THREE.ColorRepresentation;
        outlineWidth: number | string;
        outlineColor: THREE.ColorRepresentation;
        outlineOpacity: number;
        outlineBlur: number | string;
        outlineOffsetX: number | string;
        outlineOffsetY: number | string;
        sdfGlyphSize: number | null;
        depthOffset: number;
        whiteSpace: 'normal' | 'pre-wrap' | 'nowrap';
        overflowWrap: 'normal' | 'break-word';
        direction: 'auto' | 'ltr' | 'rtl';
        textRenderInfo: unknown;

        /** Upload the current properties to the GPU. Call after changing any field. */
        sync(callback?: () => void): void;
        /** Free the glyph geometry and material. */
        dispose(): void;
    }

    /** Preload a font so the first `Text` does not pop in a frame late. */
    export function preloadFont(options: { font?: string; characters?: string | string[] }, callback?: () => void): void;

    /** Force the text builder to flush any pending work. Mostly for tests. */
    export function getTextRenderInfo(options: Record<string, unknown>, callback?: () => void): void;
}
