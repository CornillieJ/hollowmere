import type { Board, BoardPiece } from '../game/board';
import type { OrbitController } from '../controls/orbit';
import type { Cell } from '../helpers/grid';
import { chooseMove, type Difficulty } from './ai';
import type { ChessPanel } from './panel';
import type { ChessSet } from './pieces';
import type { ChessSounds } from './sounds';
import { applyMove, cellToSquare, gameStatus, initialPosition, legalMoves, opposite, parseFen, repetitionKey, squareToCell, toFen, toSan, type Color, type Move, type Piece, type PieceType, type Position } from './rules';

/**
 * One game of chess on a 3D board: whose turn it is, what the player clicked,
 * what the engine answers, and how each move looks and sounds.
 *
 * The rules live in `rules.ts` and never see a mesh; the board never sees a rule.
 * This class is the only place both meet, which keeps each side testable alone.
 */
export type ChessMode = 'white' | 'black' | 'local';

export type PieceData = Piece;

export type ChessHistoryEntry = {
    /** Position before the move, so undo is exact. */
    fen: string;
    san: string;
    from: number;
    to: number;
    captured: PieceType | undefined;
    by: Color;
};

export type ChessSave = { fen: string; history: ChessHistoryEntry[]; mode: ChessMode; difficulty: Difficulty };

export type ChessParts = {
    game: Game;
    board: Board<PieceData>;
    camera: OrbitController;
    panel: ChessPanel;
    set: ChessSet;
    sounds: ChessSounds;
    /** Called when a choice is needed for a promotion. Resolves to undefined on cancel. */
    choosePromotion: () => Promise<PieceType | undefined>;
    /** Called after every move, e.g. to autosave. */
    onMove?: () => void;
};

const SIDE_NAME: Record<Color, string> = { w: 'White', b: 'Black' };
/** Shortest time the engine appears to think, so its reply never lands on top of the player's move. */
const MIN_ENGINE_DELAY_MS = 350;

export class ChessMatch {
    mode: ChessMode = 'white';
    difficulty: Difficulty = 'normal';
    position: Position = initialPosition();
    readonly history: ChessHistoryEntry[] = [];
    selectedFrom: number | undefined;
    /** Moves the selected piece can make. */
    legalTargets: Move[] = [];
    thinking = false;
    /** Why the game ended, `undefined` while it is running. */
    result: string | undefined;
    promoting = false;

    private readonly parts: ChessParts;
    /**
     * Bumped whenever the game is reset, restored or rewound. Any async work
     * (an engine search, a promotion dialog) checks it before acting, so a reply
     * from an abandoned game can never land in the new one.
     */
    private generation = 0;

    constructor(parts: ChessParts) {
        this.parts = parts;
        parts.board.onCellClick((cell, piece) => this.onCellClick(cell, piece));
    }

    //#region State

    /** The colour a human plays, or `'both'` for two players on one screen. */
    get humanSide(): Color | 'both' {
        return this.mode === 'local' ? 'both' : this.mode === 'white' ? 'w' : 'b';
    }

    get isPlayerTurn(): boolean {
        return this.humanSide === 'both' || this.humanSide === this.position.turn;
    }

    get finished(): boolean {
        return this.result !== undefined;
    }

    /** Pieces taken by each colour, rebuilt from the history so undo stays correct. */
    capturedBy(color: Color): PieceType[] {
        return this.history.filter((entry) => entry.by === color && entry.captured).map((entry) => entry.captured as PieceType);
    }

    toSave(): ChessSave {
        return { fen: toFen(this.position), history: [...this.history], mode: this.mode, difficulty: this.difficulty };
    }

    //#endregion State

    //#region Lifecycle

    newGame(mode: ChessMode = this.mode, difficulty: Difficulty = this.difficulty): void {
        this.load(initialPosition(), [], mode, difficulty);
        this.parts.panel.setStatus(mode === 'local' ? 'Two players, White starts' : `You play ${SIDE_NAME[this.humanSide as Color]}. Engine: ${difficulty}`);
    }

    restore(save: ChessSave): boolean {
        const position = parseFen(save.fen);
        if (!position) return false;
        this.load(position, save.history, save.mode, save.difficulty);
        this.parts.panel.setStatus('Saved game restored');
        return true;
    }

    /** Take back the last move, or the last full move against the engine. */
    undo(): void {
        if (this.history.length === 0 || this.promoting) return;
        const human = this.humanSide;
        let index = this.history.length - 1;
        // Against the engine, rewind to just before the player's own last move.
        while (human !== 'both' && index > 0 && this.history[index]?.by !== human) index -= 1;
        const entry = this.history[index];
        const position = entry && parseFen(entry.fen);
        if (!position) return;

        this.load(position, this.history.slice(0, index), this.mode, this.difficulty, false);
        this.parts.panel.setStatus('Move taken back');
    }

    /** Show the engine's suggestion. Clicking the marked square plays it. */
    async hint(): Promise<void> {
        if (this.thinking || this.finished || !this.isPlayerTurn || this.promoting) return;
        const generation = this.generation;
        this.parts.panel.setStatus('Looking for a good move...');
        const found = await chooseMove(this.position, { difficulty: 'hard', timeMs: 700 });
        if (!found || generation !== this.generation) return;
        this.select(found.move.from);
        this.legalTargets = [found.move];
        this.parts.board.setLegalTargets([squareToCell(found.move.to)]);
        this.parts.panel.setStatus(`Try ${toSan(this.position, found.move)}`);
    }

    /** Look at the board from one side. */
    view(side: Color, duration = 0.9): Promise<void> {
        return this.parts.camera.orbitTo({ azimuth: side === 'w' ? 0 : Math.PI, polar: 0.78, distance: 12.5 }, duration);
    }

    /** Look from the other side. */
    flip(): Promise<void> {
        const azimuth = Math.atan2(this.parts.game.camera.position.x - this.parts.camera.controls.target.x, this.parts.game.camera.position.z - this.parts.camera.controls.target.z);
        return this.parts.camera.orbitTo({ azimuth: azimuth + Math.PI });
    }

    setDifficulty(difficulty: Difficulty): void {
        this.difficulty = difficulty;
        this.parts.panel.setDifficulty(difficulty);
        this.parts.panel.setStatus(`Engine set to ${difficulty}`);
    }

    private load(position: Position, history: ChessHistoryEntry[], mode: ChessMode, difficulty: Difficulty, turnCamera = true): void {
        this.generation += 1;
        this.mode = mode;
        this.difficulty = difficulty;
        this.position = position;
        this.history.length = 0;
        this.history.push(...history);
        this.thinking = false;
        this.promoting = false;
        this.result = undefined;
        this.clearSelection();
        this.rebuildBoard();

        const { panel } = this.parts;
        panel.setPlayers(mode === 'local' ? ['White', 'Black'] : mode === 'white' ? ['You', 'Engine'] : ['Engine', 'You']);
        panel.setDifficulty(difficulty);
        panel.setBusy(false);
        // Tweens are frozen outside play, so a game started from a menu turns the camera at once.
        if (turnCamera) void this.view(mode === 'black' ? 'b' : 'w', this.parts.game.state.is('playing') ? 0.9 : 0);

        this.checkForEnd();
        this.syncUi();
        this.maybeEngineMove();
    }

    //#endregion Lifecycle

    //#region Interaction

    private onCellClick(cell: Cell, piece: BoardPiece<PieceData> | undefined): void {
        if (this.finished || this.promoting) return;
        if (this.thinking || !this.isPlayerTurn) {
            this.parts.panel.setStatus('Wait for the engine to move');
            return;
        }

        const square = cellToSquare(cell);
        if (piece && piece.data.color === this.position.turn) {
            if (this.selectedFrom === square) this.clearSelection();
            else this.select(square);
            return;
        }

        const candidates = this.legalTargets.filter((move) => move.to === square);
        if (candidates.length === 0) {
            this.clearSelection();
            return;
        }
        if (candidates.some((move) => move.promotion)) void this.promote(candidates);
        else this.play(candidates[0] as Move);
    }

    private select(square: number): void {
        this.selectedFrom = square;
        this.legalTargets = legalMoves(this.position, square);
        this.parts.board.select(squareToCell(square));
        this.parts.board.setLegalTargets(this.legalTargets.map((move) => squareToCell(move.to)));
        this.parts.sounds.select();
        if (this.legalTargets.length === 0) this.parts.panel.setStatus('That piece has no legal moves');
    }

    private clearSelection(): void {
        this.selectedFrom = undefined;
        this.legalTargets = [];
        this.parts.board.select(undefined);
        this.parts.board.setLegalTargets([]);
    }

    private async promote(candidates: Move[]): Promise<void> {
        const generation = this.generation;
        this.promoting = true;
        this.parts.panel.setStatus('Choose a piece for the pawn');
        const choice = await this.parts.choosePromotion();
        if (generation !== this.generation) return;
        this.promoting = false;
        const move = candidates.find((candidate) => candidate.promotion === choice);
        if (move) this.play(move);
        else this.parts.panel.setStatus('Promotion cancelled');
    }

    //#endregion Interaction

    //#region Moves

    /** Play a legal move for the side to move. Used by the player, the engine and tests. */
    play(move: Move): void {
        const before = this.position;
        const after = applyMove(before, move);
        this.history.push({ fen: toFen(before), san: toSan(before, move, after), from: move.from, to: move.to, captured: move.captured?.type, by: before.turn });
        this.position = after;

        this.clearSelection();
        this.animate(move);
        this.playSound(move);
        this.checkForEnd();
        this.syncUi();
        this.parts.onMove?.();
        this.maybeEngineMove();
    }

    private animate(move: Move): void {
        const { board, set } = this.parts;
        const from = squareToCell(move.from);
        const to = squareToCell(move.to);
        const piece = board.pieceAt(from);
        if (!piece) {
            // The view drifted from the position, so redraw it rather than guess.
            this.rebuildBoard();
            return;
        }

        if (move.enPassant) {
            const victim = board.pieceAt({ x: to.x, z: from.z });
            if (victim) board.capture(victim, 0.2);
        }

        const promotion = move.promotion;
        board.movePiece(piece, to, {
            arc: move.piece.type === 'n' ? 0.6 : 0.12,
            onArrive: promotion
                ? () => {
                      board.removePiece(piece);
                      board.addPiece(to, set.create({ color: move.piece.color, type: promotion }), { color: move.piece.color, type: promotion });
                  }
                : undefined,
        });

        if (move.castle) {
            const rank = from.z;
            const rook = board.pieceAt({ x: move.castle === 'k' ? 7 : 0, z: rank });
            if (rook) board.movePiece(rook, { x: move.castle === 'k' ? 5 : 3, z: rank }, { arc: 0.3 });
        }
    }

    private playSound(move: Move): void {
        const { sounds } = this.parts;
        const status = gameStatus(this.position);
        if (status === 'check' || status === 'checkmate') sounds.check();
        else if (move.castle) sounds.castle();
        else if (move.captured) sounds.capture();
        else sounds.move();
        if (move.promotion) sounds.promote();
    }

    private rebuildBoard(): void {
        const { board, set } = this.parts;
        board.clear();
        this.position.board.forEach((piece, index) => {
            if (piece) board.addPiece(squareToCell(index), set.create(piece), { ...piece });
        });
    }

    private checkForEnd(): void {
        const status = gameStatus(this.position);
        const mover = this.position.turn;
        if (status === 'checkmate') this.result = `Checkmate. ${SIDE_NAME[opposite(mover)]} wins`;
        else if (status === 'stalemate') this.result = 'Stalemate. Draw';
        else if (this.position.halfmove >= 100) this.result = 'Fifty moves without progress. Draw';
        else if (this.isThreefold()) this.result = 'Threefold repetition. Draw';
        else if (isInsufficientMaterial(this.position)) this.result = 'Not enough material to mate. Draw';
        if (!this.result) return;

        const human = this.humanSide;
        const humanWon = status === 'checkmate' && human !== 'both' ? opposite(mover) === human : undefined;
        this.parts.sounds.gameOver(humanWon !== false);
        this.parts.panel.setStatus(this.result, humanWon === false ? 'bad' : 'good');
        this.parts.game.events.emit('custom:chess:over', { result: this.result });
    }

    private isThreefold(): boolean {
        const key = repetitionKey(this.position);
        let seen = 1;
        for (const entry of this.history) {
            const earlier = parseFen(entry.fen);
            if (earlier && repetitionKey(earlier) === key) seen += 1;
        }
        return seen >= 3;
    }

    private maybeEngineMove(): void {
        if (this.finished || this.isPlayerTurn) return;
        void this.engineTurn();
    }

    private async engineTurn(): Promise<void> {
        const generation = this.generation;
        this.thinking = true;
        this.parts.panel.setBusy(true);
        this.parts.panel.setStatus('Engine is thinking...');

        // Let the player's own move land first: the reply should read as a reply.
        const started = performance.now();
        await this.parts.board.whenSettled();
        const found = await chooseMove(this.position, { difficulty: this.difficulty });
        const wait = MIN_ENGINE_DELAY_MS - (performance.now() - started);
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
        if (generation !== this.generation) return;

        this.thinking = false;
        this.parts.panel.setBusy(false);
        if (!found) return;
        this.parts.panel.setStatus(`Engine played ${toSan(this.position, found.move)}`);
        this.play(found.move);
    }

    //#endregion Moves

    /** Push the whole state into the panel, the HUD and the board markers. */
    private syncUi(): void {
        const { panel, board, game } = this.parts;
        const status = gameStatus(this.position);
        panel.setTurn(this.position.turn, status);
        panel.setMoves(pairMoves(this.history));
        panel.setCaptured('w', this.capturedBy('w'));
        panel.setCaptured('b', this.capturedBy('b'));

        const last = this.history[this.history.length - 1];
        board.setHighlights('last', last ? [squareToCell(last.from), squareToCell(last.to)] : []);
        const king = this.position.board.findIndex((piece) => piece?.type === 'k' && piece.color === this.position.turn);
        board.setHighlights('check', (status === 'check' || status === 'checkmate') && king >= 0 ? [squareToCell(king)] : []);

        game.hud.setObjective(this.result ?? `${SIDE_NAME[this.position.turn]} to move`);
        game.debug.log('fen', toFen(this.position));
    }
}

/** Move list rows: number, white's move, black's move. */
function pairMoves(history: ChessHistoryEntry[]): Array<{ number: number; white: string; black?: string }> {
    const rows: Array<{ number: number; white: string; black?: string }> = [];
    for (let index = 0; index < history.length; index += 2) {
        const white = history[index] as ChessHistoryEntry;
        const black = history[index + 1];
        rows.push({ number: index / 2 + 1, white: white.san, ...(black ? { black: black.san } : {}) });
    }
    return rows;
}

/** King against king, or king and one minor piece against king. */
export function isInsufficientMaterial(position: Position): boolean {
    const others = position.board.filter((piece): piece is Piece => piece !== null && piece.type !== 'k');
    if (others.length === 0) return true;
    return others.length === 1 && (others[0]?.type === 'n' || others[0]?.type === 'b');
}
