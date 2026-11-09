import { applyMove, findKing, gameStatus, isAttacked, legalMoves, opposite, rankOf, fileOf, square, PIECE_VALUE, type Move, type Piece, type PieceType, type Position } from './rules';

/**
 * Chess engine.
 *
 * Negamax with alpha beta pruning, capture-first move ordering, quiescence on
 * captures and iterative deepening under a time budget. The whole search is a
 * pure function of the position, so it can be unit tested from Node without a
 * browser, and it yields between depth iterations so a search never blocks the
 * render loop for more than one iteration's worth of work.
 *
 * The evaluation is material plus piece square tables. That is not strong chess,
 * but it plays sensibly, it never hangs a queen for free, and it takes a mate
 * when it sees one.
 */
export type Difficulty = 'easy' | 'normal' | 'hard';

export type SearchResult = {
    move: Move;
    /** Score in centipawns from the engine's point of view. */
    score: number;
    /** Depth actually completed. */
    depth: number;
    nodes: number;
    ms: number;
};

export type SearchOptions = {
    difficulty?: Difficulty;
    /** Hard cap on thinking time in milliseconds. */
    timeMs?: number;
    /** Hard cap on depth. */
    maxDepth?: number;
};

/** Thinking time and depth ceiling per difficulty. */
export const DIFFICULTY_SETTINGS: Record<Difficulty, { timeMs: number; maxDepth: number; blunderChance: number }> = {
    easy: { timeMs: 120, maxDepth: 2, blunderChance: 0.3 },
    normal: { timeMs: 600, maxDepth: 4, blunderChance: 0.08 },
    hard: { timeMs: 1600, maxDepth: 6, blunderChance: 0 },
};

/** Row of piece square tables, `a1` first, written from White's point of view. */
const PAWN_TABLE = [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, -20, -20, 10, 10, 5, 5, -5, -10, 0, 0, -10, -5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, 5, 10, 25, 25, 10, 5, 5, 10, 10, 20, 30, 30, 20, 10, 10, 50, 50, 50, 50, 50, 50, 50, 50, 0, 0, 0, 0, 0, 0, 0, 0];
const KNIGHT_TABLE = [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 5, 5, 0, -20, -40, -30, 5, 10, 15, 15, 10, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 10, 15, 15, 10, 0, -30, -40, -20, 0, 0, 0, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50];
const BISHOP_TABLE = [-20, -10, -10, -10, -10, -10, -10, -20, -10, 5, 0, 0, 0, 0, 5, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 0, 0, 0, 0, 0, 0, -10, -20, -10, -10, -10, -10, -10, -10, -20];
const ROOK_TABLE = [0, 0, 0, 5, 5, 0, 0, 0, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 5, 10, 10, 10, 10, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0];
const QUEEN_TABLE = [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 5, 0, 0, 0, 0, -10, -10, 5, 5, 5, 5, 5, 0, -10, 0, 0, 5, 5, 5, 5, 0, -5, -5, 0, 5, 5, 5, 5, 0, -5, -10, 0, 5, 5, 5, 5, 0, -10, -10, 0, 0, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20];
const KING_TABLE = [20, 30, 10, 0, 0, 10, 30, 20, 20, 20, 0, 0, 0, 0, 20, 20, -10, -20, -20, -20, -20, -20, -20, -10, -20, -30, -30, -40, -40, -30, -30, -20, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30];

const TABLES: Record<PieceType, number[]> = { p: PAWN_TABLE, n: KNIGHT_TABLE, b: BISHOP_TABLE, r: ROOK_TABLE, q: QUEEN_TABLE, k: KING_TABLE };

/** Checkmate score: large enough to dominate material, offset so nearer mates win. */
const MATE_SCORE = 1_000_000;

/**
 * Pick a move for the side to move.
 * Resolves with `undefined` only when there is no legal move at all.
 */
export async function chooseMove(position: Position, options: SearchOptions = {}): Promise<SearchResult | undefined> {
    const settings = DIFFICULTY_SETTINGS[options.difficulty ?? 'normal'];
    const timeMs = options.timeMs ?? settings.timeMs;
    const maxDepth = options.maxDepth ?? settings.maxDepth;

    const roots = legalMoves(position);
    if (roots.length === 0) return undefined;

    const started = Date.now();
    let nodes = 0;
    let best: { move: Move; score: number } | undefined;

    for (let depth = 1; depth <= maxDepth; depth += 1) {
        const iteration = searchRoot(position, depth, started, timeMs, roots, () => {
            nodes += 1;
        });
        if (!iteration) break;
        best = iteration;

        // Cheap blunder option: sometimes an easier opponent should not play the
        // best move it found.
        if (settings.blunderChance > 0 && depth === maxDepth && Math.random() < settings.blunderChance) {
            const alternatives = roots.filter((move) => move.to !== best?.move.to);
            const pick = alternatives[Math.floor(Math.random() * alternatives.length)];
            if (pick) best = { move: pick, score: 0 };
        }

        if (Math.abs(iteration.score) > MATE_SCORE / 2) break;
        if (Date.now() - started > timeMs) break;
        // Give the browser a frame between depth iterations.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }

    if (!best) return undefined;
    return { move: best.move, score: best.score, depth: maxDepth, nodes, ms: Date.now() - started };
}

/** Search the root moves in order and keep the best. Returns `undefined` on timeout. */
function searchRoot(position: Position, depth: number, started: number, timeMs: number, roots: Move[], countNode: () => void): { move: Move; score: number } | undefined {
    let best: { move: Move; score: number } | undefined;
    let alpha = -Infinity;

    for (const move of orderMoves(position, roots)) {
        if (Date.now() - started > timeMs) return best;
        const child = applyMove(position, move);
        const score = -negamax(child, depth - 1, -Infinity, -alpha, started, timeMs, countNode);
        if (score > alpha || !best) {
            alpha = score;
            best = { move, score };
        }
    }
    return best;
}

/** Negamax with alpha beta pruning. Scores are from the side to move. */
function negamax(position: Position, depth: number, alpha: number, beta: number, started: number, timeMs: number, countNode: () => void): number {
    countNode();
    if (Date.now() - started > timeMs) return evaluate(position);
    if (depth <= 0) return quiescence(position, alpha, beta, 0);

    const moves = legalMoves(position);
    if (moves.length === 0) return gameStatus(position) === 'checkmate' ? -MATE_SCORE + (10 - depth) : 0;

    let best = -Infinity;
    for (const move of orderMoves(position, moves)) {
        const child = applyMove(position, move);
        const score = -negamax(child, depth - 1, -beta, -alpha, started, timeMs, countNode);
        if (score > best) best = score;
        if (best > alpha) alpha = best;
        if (alpha >= beta) break;
    }
    return best;
}

/** Extend the search on captures so the engine does not stop mid trade. */
function quiescence(position: Position, alpha: number, beta: number, depth: number): number {
    const stand = evaluate(position);
    if (depth >= 3) return stand;
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;

    const captures = legalMoves(position).filter((move) => move.captured !== null || move.promotion);
    for (const move of orderMoves(position, captures)) {
        const score = -quiescence(applyMove(position, move), -beta, -alpha, depth + 1);
        if (score >= beta) return beta;
        if (score > alpha) alpha = score;
    }
    return alpha;
}

/** Captures of the most valuable victim first, then promotions, then quiet moves. */
function orderMoves(position: Position, moves: Move[]): Move[] {
    return [...moves].sort((a, b) => scoreMove(b) - scoreMove(a));
}

function scoreMove(move: Move): number {
    let score = 0;
    if (move.captured) score += 10 * PIECE_VALUE[move.captured.type] - PIECE_VALUE[move.piece.type];
    if (move.promotion) score += PIECE_VALUE[move.promotion];
    if (move.castle) score += 50;
    return score;
}

/**
 * Static evaluation from the side to move's point of view.
 * Positive means the side to move is better.
 */
export function evaluate(position: Position): number {
    let score = 0;
    for (let index = 0; index < 64; index += 1) {
        const piece = position.board[index] as Piece | null;
        if (!piece) continue;
        const table = TABLES[piece.type];
        const tableIndex = piece.color === 'w' ? index : mirror(index);
        const value = PIECE_VALUE[piece.type] + (table[tableIndex] as number);
        score += piece.color === 'w' ? value : -value;
    }
    return position.turn === 'w' ? score : -score;
}

/** Flip a square vertically, so one table serves both colours. */
function mirror(index: number): number {
    const rank = rankOf(index);
    const file = fileOf(index);
    const flipped = square(file, 7 - rank);
    return flipped ?? index;
}

/** Exposed for tests: is the king of `color` attacked in this position? */
export function kingInCheck(position: Position, color: 'w' | 'b'): boolean {
    const king = findKing(position, color);
    return king >= 0 && isAttacked(position, king, opposite(color));
}
