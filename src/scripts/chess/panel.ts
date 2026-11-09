import { button, div, setText, setVisible } from '../helpers/dom';
import type { Color, PieceType } from './rules';

/**
 * Side panel: turn banner, status, move list, captured pieces and the controls.
 *
 * Everything is plain DOM in one column, so the 3D board keeps the whole left
 * half of the screen. The panel never reads game state directly: the entry point
 * pushes changes into it, which keeps rendering out of the rules.
 */
export type PanelOptions = {
    /** Player names, defaults to You and Computer. */
    players?: [string, string];
    onNewGame?: () => void;
    onUndo?: () => void;
    onFlip?: () => void;
    onHint?: () => void;
    onDifficulty?: (difficulty: 'easy' | 'normal' | 'hard') => void;
};

export class ChessPanel {
    readonly root: HTMLElement;

    private readonly turnBanner: HTMLElement;
    private readonly statusLine: HTMLElement;
    private readonly moveList: HTMLElement;
    private readonly capturedRows = new Map<Color, HTMLElement>();
    private readonly buttons: HTMLButtonElement[] = [];
    private readonly difficultyButtons = new Map<string, HTMLButtonElement>();
    private players: [string, string];

    constructor(parent: HTMLElement, options: PanelOptions = {}) {
        this.players = options.players ?? ['You', 'Computer'];
        this.root = div('chess-panel', undefined, parent);

        const header = div('chess-header', undefined, this.root);
        div('chess-title', 'Chess', header);
        this.turnBanner = div('chess-turn', 'White to move', this.root);
        this.statusLine = div('chess-status', '', this.root);

        const captures = div('chess-captures', undefined, this.root);
        for (const color of ['w', 'b'] as Color[]) {
            const row = div('chess-capture-row', undefined, captures);
            div('chess-capture-label', color === 'w' ? 'Taken by White' : 'Taken by Black', row);
            const pieces = div('chess-capture-pieces', '', row);
            this.capturedRows.set(color, pieces);
        }

        const movesLabel = div('chess-section-label', 'Moves', this.root);
        void movesLabel;
        this.moveList = div('chess-moves', undefined, this.root);

        const actions = div('chess-actions', undefined, this.root);
        const add = (label: string, action: (() => void) | undefined, className = 'chess-button'): HTMLButtonElement => {
            const element = button(label, () => action?.(), { className, parent: actions });
            this.buttons.push(element);
            return element;
        };
        add('New game', options.onNewGame);
        add('Undo', options.onUndo);
        add('Flip view', options.onFlip);
        add('Hint', options.onHint);

        const difficulty = div('chess-difficulty', undefined, this.root);
        div('chess-section-label', 'Opponent', difficulty);
        const row = div('chess-difficulty-row', undefined, difficulty);
        for (const level of ['easy', 'normal', 'hard'] as const) {
            const element = button(level, () => options.onDifficulty?.(level), { className: 'chess-button chess-button-small', parent: row });
            element.dataset.level = level;
            this.difficultyButtons.set(level, element);
            this.buttons.push(element);
        }
        this.setDifficulty('normal');
    }

    /** Names shown in the turn banner, White's first. */
    setPlayers(players: [string, string]): void {
        this.players = players;
    }

    /** Big banner naming whose turn it is. */
    setTurn(turn: Color, status: 'playing' | 'check' | 'checkmate' | 'stalemate'): void {
        const mover = turn === 'w' ? this.players[0] : this.players[1];
        const colour = turn === 'w' ? 'White' : 'Black';
        const whose = mover === 'You' ? 'Your move' : `${mover} to move`;
        setText(this.turnBanner, status === 'check' ? `${colour} is in check` : mover === colour ? `${colour} to move` : `${whose} (${colour})`);
        this.turnBanner.classList.toggle('is-check', status === 'check' || status === 'checkmate');
    }

    /** Small line under the banner: checkmate, stalemate, thinking, saved. */
    setStatus(text: string, tone: 'neutral' | 'good' | 'bad' = 'neutral'): void {
        setText(this.statusLine, text);
        this.statusLine.classList.toggle('is-good', tone === 'good');
        this.statusLine.classList.toggle('is-bad', tone === 'bad');
    }

    /** Replace the whole move list. `moves` are already formatted pairs. */
    setMoves(moves: Array<{ number: number; white: string; black?: string }>): void {
        this.moveList.replaceChildren();
        for (const move of moves) {
            const row = div('chess-move-row', undefined, this.moveList);
            div('chess-move-number', String(move.number), row);
            div('chess-move-san', move.white, row);
            div('chess-move-san', move.black ?? '', row);
        }
        this.moveList.scrollTop = this.moveList.scrollHeight;
    }

    /** Captured piece glyphs for one side. */
    setCaptured(color: Color, pieces: PieceType[]): void {
        const row = this.capturedRows.get(color);
        if (!row) return;
        const order: PieceType[] = ['q', 'r', 'b', 'n', 'p'];
        const counts = new Map<PieceType, number>();
        for (const type of pieces) counts.set(type, (counts.get(type) ?? 0) + 1);
        setText(row, order.filter((type) => counts.has(type)).map((type) => `${GLYPHS[type]}${counts.get(type) === 1 ? '' : `x${counts.get(type)}`}`).join('  '));
    }

    /** Highlight the difficulty the engine is currently using. */
    setDifficulty(level: 'easy' | 'normal' | 'hard'): void {
        for (const [key, element] of this.difficultyButtons) element.classList.toggle('is-primary', key === level);
    }

    /** Show or hide the whole panel, e.g. while the main menu is up. */
    setVisible(visible: boolean): void {
        setVisible(this.root, visible);
    }

    /** Disable the buttons while the engine is thinking. */
    setBusy(busy: boolean): void {
        for (const element of this.buttons) element.disabled = busy;
    }
}

/** Unicode chess glyphs, which every system font has. */
export const GLYPHS: Record<PieceType, string> = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' };
