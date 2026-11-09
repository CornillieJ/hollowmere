import * as THREE from 'three';

import { createBoardGame, type BoardGameWorld } from '../templates/board-game';
import { setViewInset } from '../helpers/viewport';
import { ChoiceDialog } from '../ui/choice-dialog';
import { type Difficulty } from './ai';
import { ChessMatch, type ChessMode, type ChessSave, type PieceData } from './chess-match';
import { ChessPanel } from './panel';
import { ChessSet, type PieceAppearance } from './pieces';
import { ChessSounds } from './sounds';
import type { PieceType } from './rules';

export { ChessMatch, type ChessMode, type ChessSave } from './chess-match';
export * from './rules';
export { chooseMove, evaluate, type Difficulty } from './ai';
export { ChessSet, type PieceAppearance } from './pieces';

/**
 * A complete 3D chess game in one call.
 *
 *   const { chess } = await createChess();
 *
 * Main menu with side selection, engine opponent on three levels, two players
 * on one screen, undo, hints, promotion dialog, autosave and continue, check,
 * mate and every draw rule. Everything below is optional.
 */
export type ChessOptions = {
    title?: string;
    /** Folder holding pawn.glb, rook.glb ... king.glb. */
    modelsUrl?: string;
    pieces?: PieceAppearance;
    /** Light and dark squares. */
    squares?: [THREE.ColorRepresentation, THREE.ColorRepresentation];
    frame?: THREE.ColorRepresentation;
    difficulty?: Difficulty;
    /** Skip the menu and start this mode straight away. */
    autoStartMode?: ChessMode | undefined;
    saveSlot?: string;
    game?: GameOptions;
};

export type ChessWorld = BoardGameWorld<PieceData> & { chess: ChessMatch; panel: ChessPanel };

const PROMOTION_CHOICES: Array<{ type: PieceType; label: string }> = [
    { type: 'q', label: 'Queen' },
    { type: 'r', label: 'Rook' },
    { type: 'b', label: 'Bishop' },
    { type: 'n', label: 'Knight' },
];

export async function createChess(options: ChessOptions = {}): Promise<{ game: Game; world: ChessWorld; chess: ChessMatch }> {
    const title = options.title ?? 'Chess';
    const saveSlot = options.saveSlot ?? 'chess';
    // The menu buttons need the match, which needs the board the template builds.
    let chess: ChessMatch | undefined;
    const begin = (mode: ChessMode): void => {
        chess?.newGame(mode);
        world.flow.start();
    };

    const { game, world } = await createBoardGame<PieceData>({
        title,
        autoStart: false,
        saveSlot,
        game: { stats: false, exposeDebug: true, ...options.game },
        board: { columns: 8, rows: 8, zDirection: -1, colors: options.squares ?? [0xe8d8b8, 0x8a6a4f], frameColor: options.frame ?? 0x3b2a20 },
        camera: { target: new THREE.Vector3(3.5, 0, -3.5), distance: 11, minDistance: 6, maxDistance: 20, minPolarAngle: 0.15, maxPolarAngle: 1.25, enablePan: false },
        flow: {
            hudWhen: [],
            mainMenu: {
                title,
                subtitle: 'Choose your side',
                buttons: [
                    { label: 'Play as White', primary: true, action: () => begin('white') },
                    { label: 'Play as Black', action: () => begin('black') },
                    { label: 'Two players', action: () => begin('local') },
                    { label: 'Continue saved game', action: () => continueSaved() },
                ],
                hint: 'Click a piece, then a marked square. Drag to turn the board, scroll to zoom.',
            },
            pauseMenu: {
                title: 'Paused',
                buttons: [
                    { label: 'Resume', primary: true, action: () => world.flow.resume() },
                    { label: 'New game', action: () => begin(chess?.mode ?? 'white') },
                    { label: 'Main menu', action: () => world.flow.quit() },
                ],
            },
        },
    });

    const set = await ChessSet.load(game.assets, options.modelsUrl, options.pieces);
    const sounds = new ChessSounds(game);
    const dialog = new ChoiceDialog(game.uiRoot, { eyebrow: 'Pawn promotion', dismissible: true }, game);
    const panel = new ChessPanel(game.uiRoot, {
        onNewGame: () => chess?.newGame(),
        onUndo: () => chess?.undo(),
        onFlip: () => void chess?.flip(),
        onHint: () => void chess?.hint(),
        onDifficulty: (level) => chess?.setDifficulty(level),
    });

    chess = new ChessMatch({
        game,
        board: world.board,
        camera: world.camera,
        panel,
        set,
        sounds,
        choosePromotion: () => dialog.ask('Promote the pawn to', PROMOTION_CHOICES.map((choice, index) => ({ label: choice.label, value: choice.type, primary: index === 0, description: `Key ${index + 1}` }))),
        onMove: () => game.save.save(saveSlot),
    });
    chess.difficulty = options.difficulty ?? 'normal';
    const match = chess;

    game.save.register('chess', {
        save: () => match.toSave(),
        load: (data) => {
            const saved = data as Partial<ChessSave> | undefined;
            if (saved?.fen) match.restore({ fen: saved.fen, history: saved.history ?? [], mode: saved.mode ?? 'white', difficulty: saved.difficulty ?? 'normal' });
        },
    });

    function continueSaved(): void {
        if (game.save.exists(saveSlot) && game.save.load(saveSlot)) world.flow.start();
        else game.toasts.push('No saved game yet', { color: '#ff9a9a' });
    }

    // The panel belongs to the game in progress, not to the menus.
    const syncPanel = (): void => panel.setVisible(game.state.is('playing', 'paused'));
    game.events.on('state:changed', syncPanel);
    syncPanel();

    // Centre the board in the space the panel leaves free: right side on desktop, above it on a phone.
    setViewInset(game, (width, height) => (width > 760 ? { right: 312 } : { bottom: Math.min(height * 0.38, 300) }));

    // A finger has no hover, so the hover marker would only ever show the last tap.
    if (window.matchMedia('(pointer: coarse)').matches) world.board.setHoverEnabled(false);

    // Browsers only allow audio after a gesture.
    const unlock = (): void => void sounds.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    match.newGame(options.autoStartMode ?? 'white', match.difficulty);
    if (options.autoStartMode) world.flow.start();

    const chessWorld: ChessWorld = { ...world, chess: match, panel };
    game.world = chessWorld;
    return { game, world: chessWorld, chess: match };
}
