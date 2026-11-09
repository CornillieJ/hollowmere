import * as THREE from 'three';

import type { Assets } from '../helpers/assets';
import type { Color, Piece, PieceType } from './rules';

/**
 * The chess set: six glTF models, one per piece type, recoloured per side.
 *
 * The models are the CC0 "Chess" set by Lyricsz (see static/models/ATTRIBUTION.md).
 * Only the white set is shipped, because black is the same mesh with another
 * material. Every piece shares its geometry with the others of its type, so the
 * whole set is six downloads and 32 cheap clones.
 */
export type PieceAppearance = {
    light?: THREE.ColorRepresentation;
    dark?: THREE.ColorRepresentation;
    roughness?: number;
    clearcoat?: number;
};

const FILES: Record<PieceType, string> = {
    p: 'pawn',
    r: 'rook',
    n: 'knight',
    b: 'bishop',
    q: 'queen',
    k: 'king',
};

/** Scale from the model's own units to board cells. A pawn ends up about 1.1 cells tall. */
const MODEL_SCALE = 1.85;

const DEFAULT_APPEARANCE: Required<PieceAppearance> = {
    light: 0xf1e6cf,
    dark: 0x2f2a28,
    roughness: 0.32,
    clearcoat: 0.55,
};

export class ChessSet {
    private readonly models = new Map<PieceType, THREE.Group>();
    private readonly materials: Record<Color, THREE.MeshPhysicalMaterial>;

    private constructor(appearance: PieceAppearance) {
        const settings = { ...DEFAULT_APPEARANCE, ...appearance };
        const make = (color: THREE.ColorRepresentation): THREE.MeshPhysicalMaterial =>
            new THREE.MeshPhysicalMaterial({ color, roughness: settings.roughness, metalness: 0.05, clearcoat: settings.clearcoat, clearcoatRoughness: 0.2 });
        this.materials = { w: make(settings.light), b: make(settings.dark) };
    }

    /** Download the six models. Call once, before the first game. */
    static async load(assets: Assets, baseUrl = './models/chess/', appearance: PieceAppearance = {}): Promise<ChessSet> {
        const set = new ChessSet(appearance);
        await Promise.all(
            (Object.entries(FILES) as Array<[PieceType, string]>).map(async ([type, file]) => {
                // The set clones per piece itself, so it keeps the cached originals.
                set.models.set(type, await assets.loadModel(`${baseUrl}${file}.glb`, false));
            }),
        );
        return set;
    }

    /** A new piece object, standing at its own origin, facing the opponent. */
    create(piece: Piece): THREE.Group {
        const model = this.models.get(piece.type);
        if (!model) throw new Error(`Chess set has no model for '${piece.type}'`);

        const group = new THREE.Group();
        group.name = `${piece.color}${piece.type}`;
        group.userData.pieceType = piece.type;

        const body = model.clone();
        body.scale.setScalar(MODEL_SCALE);
        body.traverse((node) => {
            if (!(node instanceof THREE.Mesh)) return;
            node.material = this.materials[piece.color];
            node.castShadow = true;
            node.receiveShadow = true;
        });
        group.add(body);
        // The models face +z. The chess board runs ranks along -z, so White turns round.
        if (piece.color === 'w') group.rotation.y = Math.PI;
        return group;
    }

    dispose(): void {
        for (const material of Object.values(this.materials)) material.dispose();
    }
}

/** Colour name for a piece, for UI copy. */
export function pieceColourName(color: Color): string {
    return color === 'w' ? 'White' : 'Black';
}
