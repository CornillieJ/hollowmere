import type { Cell } from '../helpers/grid';

/**
 * Chess rules.
 *
 * A plain data model with no rendering: an 8 by 8 board indexed as
 * `rank * 8 + file`, where rank 0 is White's home rank and file 0 is the a file.
 * That maps straight onto the board template's `Cell { x: file, z: rank }`.
 *
 * Move generation filters pseudo legal moves by actually playing them and
 * asking whether the mover's king is attacked, which is slower than a
 * specialised check test but far easier to trust. `perft` at the bottom of this
 * file exists so the rules can be compared against published node counts.
 */
export type Color = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type Piece = { color: Color; type: PieceType };
export type BoardSquare = Piece | null;

export type Move = {
    /** Source square index 0..63. */
    from: number;
    /** Destination square index 0..63. */
    to: number;
    piece: Piece;
    /** Piece standing on the destination, if any. */
    captured: Piece | null;
    /** Promotion piece for a pawn reaching the last rank. */
    promotion?: PieceType;
    /** 'k' or 'q' for the side the king moved towards. */
    castle?: 'k' | 'q';
    /** True when the move captures en passant. */
    enPassant?: boolean;
};

export type CastlingRights = { wk: boolean; wq: boolean; bk: boolean; bq: boolean };

export type Position = {
    board: BoardSquare[];
    turn: Color;
    castling: CastlingRights;
    /** Square index a pawn may capture onto, or null. */
    epTarget: number | null;
    /** Half moves since the last capture or pawn move, for the fifty move rule. */
    halfmove: number;
    fullmove: number;
};

export type GameStatus = 'playing' | 'check' | 'checkmate' | 'stalemate';

/** Shifts in file and rank, used by the sliding and stepping generators. */
const KNIGHT_STEPS: Array<[number, number]> = [
    [1, 2],
    [2, 1],
    [2, -1],
    [1, -2],
    [-1, -2],
    [-2, -1],
    [-2, 1],
    [-1, 2],
];

const KING_STEPS: Array<[number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
];

const BISHOP_DIRS: Array<[number, number]> = [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
];

const ROOK_DIRS: Array<[number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
];

//#region Squares

/** Index from file and rank, `undefined` when off the board. */
export function square(file: number, rank: number): number | undefined {
    if (file < 0 || file > 7 || rank < 0 || rank > 7) return undefined;
    return rank * 8 + file;
}

export function fileOf(index: number): number {
    return index % 8;
}

export function rankOf(index: number): number {
    return Math.floor(index / 8);
}

/** Board cell for a square index, matching the board template's grid. */
export function squareToCell(index: number): Cell {
    return { x: fileOf(index), z: rankOf(index) };
}

/** Square index for a board cell. */
export function cellToSquare(cell: Cell): number {
    return cell.z * 8 + cell.x;
}

/** Algebraic name of a square, e.g. 'e4'. */
export function squareName(index: number): string {
    return `${String.fromCharCode('a'.charCodeAt(0) + fileOf(index))}${rankOf(index) + 1}`;
}

/** Algebraic name of a cell, e.g. 'e4'. */
export function cellName(cell: Cell): string {
    return squareName(cellToSquare(cell));
}

export function opposite(color: Color): Color {
    return color === 'w' ? 'b' : 'w';
}

export function isLightSquare(index: number): boolean {
    return (fileOf(index) + rankOf(index)) % 2 === 1;
}

//#endregion Squares

//#region Position setup

/** The standard starting position. */
export function initialPosition(): Position {
    return parseFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1') as Position;
}

export function clonePosition(position: Position): Position {
    return {
        board: [...position.board],
        turn: position.turn,
        castling: { ...position.castling },
        epTarget: position.epTarget,
        halfmove: position.halfmove,
        fullmove: position.fullmove,
    };
}

/**
 * Parse a FEN string. Returns `undefined` when it is malformed, which is also
 * how the FEN driven tests reject bad input.
 */
export function parseFen(fen: string): Position | undefined {
    const parts = fen.trim().split(/\s+/);
    if (parts.length < 4) return undefined;
    const [placement, turn, castling, ep, halfmove = '0', fullmove = '1'] = parts as [string, string, string, string, string?, string?];

    const board: BoardSquare[] = new Array(64).fill(null);
    const ranks = placement.split('/');
    if (ranks.length !== 8) return undefined;

    for (let index = 0; index < 8; index += 1) {
        const rank = 7 - index;
        const row = ranks[index] as string;
        let file = 0;
        for (const character of row) {
            if (/\d/.test(character)) {
                file += Number(character);
                continue;
            }
            const piece = pieceFromFen(character);
            if (!piece || file > 7) return undefined;
            board[rank * 8 + file] = piece;
            file += 1;
        }
        if (file !== 8) return undefined;
    }

    const epSquare = ep === '-' ? null : squareFromName(ep);
    return {
        board,
        turn: turn === 'b' ? 'b' : 'w',
        castling: {
            wk: castling.includes('K'),
            wq: castling.includes('Q'),
            bk: castling.includes('k'),
            bq: castling.includes('q'),
        },
        epTarget: epSquare ?? null,
        halfmove: Number(halfmove) || 0,
        fullmove: Number(fullmove) || 1,
    };
}

/** FEN for a position, e.g. to save a game in one line. */
export function toFen(position: Position): string {
    const rows: string[] = [];
    for (let rank = 7; rank >= 0; rank -= 1) {
        let row = '';
        let empty = 0;
        for (let file = 0; file < 8; file += 1) {
            const piece = position.board[rank * 8 + file] as BoardSquare;
            if (!piece) {
                empty += 1;
                continue;
            }
            if (empty > 0) {
                row += String(empty);
                empty = 0;
            }
            row += fenFromPiece(piece);
        }
        if (empty > 0) row += String(empty);
        rows.push(row);
    }
    const castling = `${position.castling.wk ? 'K' : ''}${position.castling.wq ? 'Q' : ''}${position.castling.bk ? 'k' : ''}${position.castling.bq ? 'q' : ''}` || '-';
    const ep = position.epTarget === null ? '-' : squareName(position.epTarget);
    return `${rows.join('/')} ${position.turn} ${castling} ${ep} ${position.halfmove} ${position.fullmove}`;
}

function pieceFromFen(character: string): Piece | undefined {
    const type = character.toLowerCase() as PieceType;
    if (!'pnbrqk'.includes(type)) return undefined;
    return { color: character === type ? 'b' : 'w', type };
}

function fenFromPiece(piece: Piece): string {
    const letter = piece.type;
    return piece.color === 'w' ? letter.toUpperCase() : letter;
}

function squareFromName(name: string): number | undefined {
    return square(name.charCodeAt(0) - 'a'.charCodeAt(0), Number(name[1]) - 1);
}

//#endregion Position setup

//#region Move generation

/** Every legal move for the side to move. */
export function generateMoves(position: Position, onlyFrom?: number): Move[] {
    const moves: Move[] = [];
    for (let index = 0; index < 64; index += 1) {
        if (onlyFrom !== undefined && index !== onlyFrom) continue;
        const piece = position.board[index] as BoardSquare;
        if (!piece || piece.color !== position.turn) continue;
        switch (piece.type) {
            case 'p':
                pawnMoves(position, index, piece, moves);
                break;
            case 'n':
                stepMoves(position, index, piece, KNIGHT_STEPS, moves);
                break;
            case 'k':
                stepMoves(position, index, piece, KING_STEPS, moves);
                castleMoves(position, index, piece, moves);
                break;
            case 'b':
                slideMoves(position, index, piece, BISHOP_DIRS, moves);
                break;
            case 'r':
                slideMoves(position, index, piece, ROOK_DIRS, moves);
                break;
            case 'q':
                slideMoves(position, index, piece, [...BISHOP_DIRS, ...ROOK_DIRS], moves);
                break;
        }
    }
    return moves;
}

/** Legal moves only: generate, play, and reject anything that leaves the king in check. */
export function legalMoves(position: Position, onlyFrom?: number): Move[] {
    return generateMoves(position, onlyFrom).filter((move) => !leavesKingInCheck(position, move));
}

function stepMoves(position: Position, from: number, piece: Piece, steps: Array<[number, number]>, moves: Move[]): void {
    for (const [df, dr] of steps) {
        const to = square(fileOf(from) + df, rankOf(from) + dr);
        if (to === undefined) continue;
        const target = position.board[to] as BoardSquare;
        if (target && target.color === piece.color) continue;
        moves.push({ from, to, piece, captured: target, ...(target ? {} : {}) });
    }
}

function slideMoves(position: Position, from: number, piece: Piece, directions: Array<[number, number]>, moves: Move[]): void {
    for (const [df, dr] of directions) {
        let file = fileOf(from) + df;
        let rank = rankOf(from) + dr;
        for (let to = square(file, rank); to !== undefined; to = square(file, rank)) {
            const target = position.board[to] as BoardSquare;
            if (target && target.color === piece.color) break;
            moves.push({ from, to, piece, captured: target });
            if (target) break;
            file += df;
            rank += dr;
        }
    }
}

function pawnMoves(position: Position, from: number, piece: Piece, moves: Move[]): void {
    const forward = piece.color === 'w' ? 1 : -1;
    const startRank = piece.color === 'w' ? 1 : 6;
    const promotionRank = piece.color === 'w' ? 7 : 0;
    const file = fileOf(from);
    const rank = rankOf(from);

    const push = (to: number | undefined, captured: BoardSquare, extra: Partial<Move>): void => {
        if (to === undefined) return;
        if (rankOf(to) === promotionRank) {
            for (const promotion of ['q', 'r', 'b', 'n'] as PieceType[]) moves.push({ from, to, piece, captured, promotion, ...extra });
        } else {
            moves.push({ from, to, piece, captured, ...extra });
        }
    };

    const oneStep = square(file, rank + forward);
    if (oneStep !== undefined && !position.board[oneStep]) {
        push(oneStep, null, {});
        const twoStep = square(file, rank + forward * 2);
        if (rank === startRank && twoStep !== undefined && !position.board[twoStep]) moves.push({ from, to: twoStep, piece, captured: null });
    }

    for (const df of [-1, 1]) {
        const to = square(file + df, rank + forward);
        if (to === undefined) continue;
        const target = position.board[to] as BoardSquare;
        if (target && target.color !== piece.color) {
            push(to, target, {});
            continue;
        }
        // En passant: the target square is empty but a pawn is standing next to it.
        if (!target && position.epTarget === to) {
            const victimSquare = square(fileOf(to), rank);
            const victim = victimSquare === undefined ? null : (position.board[victimSquare] as BoardSquare);
            if (victim?.type === 'p' && victim.color !== piece.color) moves.push({ from, to, piece, captured: victim, enPassant: true });
        }
    }
}

function castleMoves(position: Position, from: number, piece: Piece, moves: Move[]): void {
    const rights = position.castling;
    const homeRank = piece.color === 'w' ? 0 : 7;
    if (rankOf(from) !== homeRank || fileOf(from) !== 4) return;
    if (isAttacked(position, from, opposite(piece.color))) return;

    const kingSide = piece.color === 'w' ? rights.wk : rights.bk;
    const queenSide = piece.color === 'w' ? rights.wq : rights.bq;

    if (kingSide) {
        const f1 = square(5, homeRank);
        const g1 = square(6, homeRank);
        if (f1 !== undefined && g1 !== undefined && !position.board[f1] && !position.board[g1] && !isAttacked(position, f1, opposite(piece.color))) {
            moves.push({ from, to: g1, piece, captured: null, castle: 'k' });
        }
    }
    if (queenSide) {
        const d1 = square(3, homeRank);
        const c1 = square(2, homeRank);
        const b1 = square(1, homeRank);
        if (d1 !== undefined && c1 !== undefined && b1 !== undefined && !position.board[d1] && !position.board[c1] && !position.board[b1] && !isAttacked(position, d1, opposite(piece.color))) {
            moves.push({ from, to: c1, piece, captured: null, castle: 'q' });
        }
    }
}

//#endregion Move generation

//#region Making moves

/** Play a move on a copy of the position. The input is never modified. */
export function applyMove(position: Position, move: Move): Position {
    const next = clonePosition(position);
    playMoveInPlace(next, move);
    return next;
}

/** Play a move, modifying the position. Use `applyMove` when you need the old state. */
export function playMoveInPlace(position: Position, move: Move): void {
    const piece = position.board[move.from] as BoardSquare;
    if (!piece) return;

    position.board[move.from] = null;

    if (move.enPassant) {
        const victimRank = rankOf(move.from);
        const victim = square(fileOf(move.to), victimRank);
        if (victim !== undefined) position.board[victim] = null;
    }

    position.board[move.to] = move.promotion ? { color: piece.color, type: move.promotion } : piece;

    if (move.castle) {
        const homeRank = piece.color === 'w' ? 0 : 7;
        const rookFrom = square(move.castle === 'k' ? 7 : 0, homeRank);
        const rookTo = square(move.castle === 'k' ? 5 : 3, homeRank);
        if (rookFrom !== undefined && rookTo !== undefined) {
            position.board[rookTo] = position.board[rookFrom] as BoardSquare;
            position.board[rookFrom] = null;
        }
    }

    updateCastlingRights(position, move);

    // A double pawn push sets the en passant target behind the pawn.
    position.epTarget = null;
    if (piece.type === 'p' && Math.abs(rankOf(move.to) - rankOf(move.from)) === 2) {
        position.epTarget = square(fileOf(move.from), (rankOf(move.from) + rankOf(move.to)) / 2) ?? null;
    }

    position.halfmove = piece.type === 'p' || move.captured ? 0 : position.halfmove + 1;
    if (position.turn === 'b') position.fullmove += 1;
    position.turn = opposite(position.turn);
}

function updateCastlingRights(position: Position, move: Move): void {
    const rights = position.castling;
    if (move.piece.type === 'k') {
        if (move.piece.color === 'w') {
            rights.wk = false;
            rights.wq = false;
        } else {
            rights.bk = false;
            rights.bq = false;
        }
    }
    // A rook leaving its corner, or being captured on it, kills that right.
    const corners: Array<[number, keyof CastlingRights]> = [
        [square(0, 0) as number, 'wq'],
        [square(7, 0) as number, 'wk'],
        [square(0, 7) as number, 'bq'],
        [square(7, 7) as number, 'bk'],
    ];
    for (const [index, key] of corners) {
        if (move.from === index || move.to === index) rights[key] = false;
    }
}

/** True when playing this move would leave the mover's own king attacked. */
export function leavesKingInCheck(position: Position, move: Move): boolean {
    const probe = clonePosition(position);
    playMoveInPlace(probe, move);
    return isInCheck(probe, position.turn);
}

//#endregion Making moves

//#region Attacks and status

/** The square index of a colour's king, `-1` when it is not on the board. */
export function findKing(position: Position, color: Color): number {
    for (let index = 0; index < 64; index += 1) {
        const piece = position.board[index] as BoardSquare;
        if (piece?.type === 'k' && piece.color === color) return index;
    }
    return -1;
}

/** True when `square` is attacked by `by`. Does not care whose turn it is. */
export function isAttacked(position: Position, index: number, by: Color): boolean {
    const file = fileOf(index);
    const rank = rankOf(index);

    // Pawns
    const pawnRank = rank + (by === 'w' ? -1 : 1);
    for (const df of [-1, 1]) {
        const from = square(file + df, pawnRank);
        if (from === undefined) continue;
        const piece = position.board[from] as BoardSquare;
        if (piece?.type === 'p' && piece.color === by) return true;
    }

    // Knights and king, as single steps
    for (const [df, dr] of KNIGHT_STEPS) {
        const from = square(file + df, rank + dr);
        if (from === undefined) continue;
        const piece = position.board[from] as BoardSquare;
        if (piece?.color === by && piece.type === 'n') return true;
    }
    for (const [df, dr] of KING_STEPS) {
        const from = square(file + df, rank + dr);
        if (from === undefined) continue;
        const piece = position.board[from] as BoardSquare;
        if (piece?.color === by && piece.type === 'k') return true;
    }

    // Sliding pieces
    const slide = (directions: Array<[number, number]>, types: PieceType[]): boolean => {
        for (const [df, dr] of directions) {
            let f = file + df;
            let r = rank + dr;
            for (let from = square(f, r); from !== undefined; from = square(f, r)) {
                const piece = position.board[from] as BoardSquare;
                if (piece) {
                    if (piece.color === by && types.includes(piece.type)) return true;
                    break;
                }
                f += df;
                r += dr;
            }
        }
        return false;
    };
    if (slide(ROOK_DIRS, ['r', 'q'])) return true;
    if (slide(BISHOP_DIRS, ['b', 'q'])) return true;
    return false;
}

export function isInCheck(position: Position, color: Color): boolean {
    const king = findKing(position, color);
    return king >= 0 && isAttacked(position, king, opposite(color));
}

/** Full status of the side to move: playing, check, checkmate or stalemate. */
export function gameStatus(position: Position): GameStatus {
    const inCheck = isInCheck(position, position.turn);
    const hasMoves = legalMoves(position).length > 0;
    if (!hasMoves) return inCheck ? 'checkmate' : 'stalemate';
    return inCheck ? 'check' : 'playing';
}

/** Material score, positive favours White. Values in centipawns. */
export function materialBalance(position: Position): number {
    let score = 0;
    for (const piece of position.board) {
        if (!piece) continue;
        score += (piece.color === 'w' ? 1 : -1) * PIECE_VALUE[piece.type];
    }
    return score;
}

export const PIECE_VALUE: Record<PieceType, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

//#endregion Attacks and status

//#region Notation

/**
 * Moves that return to a previous position three times draw the game.
 * A compact key is enough for the repetition test.
 */
export function repetitionKey(position: Position): string {
    return `${toFen(position).split(' ').slice(0, 4).join(' ')}`;
}

/**
 * Standard algebraic notation, with as much disambiguation as the position needs.
 * @param after The position after the move, used to detect check and mate.
 */
export function toSan(position: Position, move: Move, after?: Position): string {
    if (move.castle) return `${move.castle === 'k' ? 'O-O' : 'O-O-O'}${suffix(position, move, after)}`;

    const type = move.piece.type;
    const destination = squareName(move.to);
    const isCapture = move.captured !== null || move.enPassant === true;

    if (type === 'p') {
        const fromFile = isCapture ? `${String.fromCharCode('a'.charCodeAt(0) + fileOf(move.from))}x` : '';
        const promotion = move.promotion ? `=${move.promotion.toUpperCase()}` : '';
        return `${fromFile}${destination}${promotion}${suffix(position, move, after)}`;
    }

    const rivals = legalMoves(position).filter((candidate) => candidate.piece.type === type && candidate.to === move.to && candidate.from !== move.from);
    let disambiguation = '';
    if (rivals.length > 0) {
        const sameFile = rivals.some((rival) => fileOf(rival.from) === fileOf(move.from));
        const sameRank = rivals.some((rival) => rankOf(rival.from) === rankOf(move.from));
        if (!sameFile) disambiguation = String.fromCharCode('a'.charCodeAt(0) + fileOf(move.from));
        else if (!sameRank) disambiguation = String(rankOf(move.from) + 1);
        else disambiguation = squareName(move.from);
    }
    return `${type.toUpperCase()}${disambiguation}${isCapture ? 'x' : ''}${destination}${suffix(position, move, after)}`;
}

function suffix(position: Position, move: Move, after?: Position): string {
    if (!after) return '';
    const status = gameStatus(after);
    if (status === 'checkmate') return '#';
    if (isInCheck(after, after.turn)) return '+';
    void position;
    void move;
    return '';
}

//#endregion Notation

//#region Tests

/**
 * Count leaf nodes of the move tree at a given depth.
 *
 * This is the standard way to prove a chess implementation: the numbers for the
 * start position are 20, 400, 8902, 197281 for depths one to four, and Kiwipete
 * (which is full of castling and en passant cases) gives 48, 2039, 97862.
 */
export function perft(position: Position, depth: number): number {
    if (depth === 0) return 1;
    const moves = legalMoves(position);
    if (depth === 1) return moves.length;
    let nodes = 0;
    for (const move of moves) nodes += perft(applyMove(position, move), depth - 1);
    return nodes;
}

/** Published perft results, so the rules can be checked without a chess engine. */
export const PERFT_REFERENCE = {
    initial: [20, 400, 8902, 197281],
    kiwipete: [48, 2039, 97862],
} as const;

/** Kiwipete: a position that exercises castling, en passant and pins. */
export const KIWIPETE_FEN = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';

//#endregion Tests
