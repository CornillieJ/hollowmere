import assert from 'node:assert/strict';

import {
    applyMove,
    legalMoves,
    gameStatus,
    generateMoves,
    isInCheck,
    parseFen,
    perft,
    toFen,
    toSan,
    initialPosition,
    KIWIPETE_FEN,
    PERFT_REFERENCE,
    findKing,
    square,
    type Move,
    type Position,
} from '../src/scripts/chess/rules';

/**
 * The chess rules, checked against published node counts.
 *
 * `perft` counts the leaf nodes of the move tree. If the move generator is wrong
 * in any way (castling, en passant, promotion, pins) the counts diverge
 * immediately, which is why every chess engine project starts here. The
 * reference numbers below are the standard ones for these two positions.
 */

//#region Perft

const start = initialPosition();
for (let depth = 1; depth <= 4; depth += 1) {
    assert.equal(perft(start, depth), PERFT_REFERENCE.initial[depth - 1], `initial position perft(${depth})`);
}

const kiwipete = parseFen(KIWIPETE_FEN) as Position;
for (let depth = 1; depth <= 3; depth += 1) {
    assert.equal(perft(kiwipete, depth), PERFT_REFERENCE.kiwipete[depth - 1], `kiwipete perft(${depth})`);
}

//#endregion Perft

//#region FEN

assert.equal(toFen(start), 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
assert.equal(toFen(kiwipete), KIWIPETE_FEN, 'fen must round trip exactly');
assert.equal(parseFen('not a fen'), undefined, 'malformed fen must be rejected');
assert.equal(parseFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq'), undefined, 'too few fields');
assert.equal(parseFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR'), undefined, 'placement only');
// Halfmove and fullmove may be omitted, which some tools do.
assert.ok(parseFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -'), 'a four field fen is accepted');

//#endregion FEN

//#region Move rules

/** Play a move written as 'e2e4'. */
function play(position: Position, from: string, to: string, promotion?: string): Position {
    const fromIndex = square(from.charCodeAt(0) - 97, Number(from[1]) - 1) as number;
    const toIndex = square(to.charCodeAt(0) - 97, Number(to[1]) - 1) as number;
    const move = legalMoves(position, fromIndex).find((candidate) => candidate.to === toIndex && (!promotion || candidate.promotion === promotion));
    assert.ok(move, `expected ${from}${to}${promotion ?? ''} to be legal`);
    return applyMove(position, move as Move);
}

// Opening moves and the pawn double step.
const afterE4 = play(start, 'e2', 'e4');
assert.equal(afterE4.turn, 'b');
assert.equal(afterE4.epTarget, square(4, 2), 'a double push sets the en passant target');
assert.equal(afterE4.board[square(4, 3) as number]?.type, 'p');

// En passant actually captures the pawn beside the destination.
const epPosition = parseFen('4k3/8/8/4pP2/8/8/8/4K3 w - e6 0 1') as Position;
const epMoves = legalMoves(epPosition).filter((move) => move.enPassant);
assert.equal(epMoves.length, 1, 'the en passant capture must be generated');
const afterEp = applyMove(epPosition, epMoves[0] as Move);
assert.equal(afterEp.board[square(4, 4) as number], null, 'the captured pawn is removed from its own square');
assert.equal(afterEp.board[square(4, 5) as number]?.type, 'p', 'the capturing pawn lands on the target square, e6');

// Castling: both sides, and it is illegal while in check.
const castlePosition = parseFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1') as Position;
const castleMoves = legalMoves(castlePosition).filter((move) => move.castle);
assert.equal(castleMoves.length, 2, 'both castlings available');
const kingSide = applyMove(castlePosition, castleMoves.find((move) => move.castle === 'k') as Move);
assert.equal(kingSide.board[square(6, 0) as number]?.type, 'k', 'king on g1');
assert.equal(kingSide.board[square(5, 0) as number]?.type, 'r', 'rook on f1');
assert.equal(kingSide.board[square(7, 0) as number], null, 'the rook left h1');
assert.equal(kingSide.castling.wk, false, 'castling rights are consumed');

const noCastleInCheck = parseFen('r3k2r/8/8/8/8/8/4r3/R3K2R w KQkq - 0 1') as Position;
assert.equal(legalMoves(noCastleInCheck).filter((move) => move.castle).length, 0, 'no castling out of check');

// Castling through an attacked square is illegal too.
const throughCheck = parseFen('r3k2r/8/8/8/8/8/5r2/R3K2R w KQkq - 0 1') as Position;
assert.equal(legalMoves(throughCheck).filter((move) => move.castle === 'k').length, 0, 'cannot castle through check');

// Promotion generates all four choices and the pawn becomes the chosen piece.
const promotionPosition = parseFen('8/4P3/8/8/8/8/8/4K1k1 w - - 0 1') as Position;
const promotions = legalMoves(promotionPosition).filter((move) => move.from === (square(4, 6) as number));
assert.equal(promotions.length, 4, 'four promotion choices');
const promoted = applyMove(promotionPosition, promotions.find((move) => move.promotion === 'n') as Move);
assert.equal(promoted.board[square(4, 7) as number]?.type, 'n', 'the pawn became a knight');

// A rook pinned along a file may only slide up and down that file, and it may
// still take the pinner on the far end.
const pinnedRook = parseFen('4r3/8/8/8/8/8/4R3/4K3 w - - 0 1') as Position;
const rookMoves = legalMoves(pinnedRook, square(4, 1) as number);
assert.ok(rookMoves.length > 0, 'the pinned rook can still move');
assert.ok(rookMoves.every((move) => move.to % 8 === 4), 'a rook pinned on the e file stays on it');
assert.ok(rookMoves.some((move) => move.to === (square(4, 7) as number)), 'including capturing the pinning rook');

// A bishop pinned on a file is frozen: a bishop cannot move along a file, so any
// move it makes would expose the king.
const pinnedBishop = parseFen('4r3/8/8/8/8/8/4B3/4K3 w - - 0 1') as Position;
assert.equal(legalMoves(pinnedBishop, square(4, 1) as number).length, 0, 'a bishop pinned on a file is frozen');
assert.ok(legalMoves(pinnedBishop).length > 0, 'the king can still step aside');

// A knight pinned against its king has no legal moves at all.
const pinnedKnight = parseFen('4r3/8/8/8/8/8/4N3/4K3 w - - 0 1') as Position;
assert.equal(legalMoves(pinnedKnight, square(4, 1) as number).length, 0, 'a pinned knight is frozen');

//#endregion Move rules

//#region Status

assert.equal(gameStatus(start), 'playing');
assert.equal(gameStatus(parseFen('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3') as Position), 'checkmate', "fool's mate is mate");
assert.equal(gameStatus(parseFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1') as Position), 'stalemate', 'a king with no moves and no check is stalemate');
assert.equal(gameStatus(parseFen('4k3/8/8/8/8/8/8/4R1K1 b - - 0 1') as Position), 'check');
assert.equal(isInCheck(start, 'w'), false);
assert.equal(findKing(start, 'w'), square(4, 0));

// Generate a legal move count for a position with many pieces, to catch a
// generator that silently drops or duplicates moves.
assert.equal(generateMoves(start).length, 20, 'twenty pseudo legal moves at the start');
assert.equal(legalMoves(start).length, 20, 'and twenty legal moves');

//#endregion Status

//#region Notation

const e4 = legalMoves(start).find((move) => move.to === (square(4, 3) as number)) as Move;
assert.equal(toSan(start, e4, applyMove(start, e4)), 'e4');

// Two knights can both reach d2, so the notation has to name the file.
const knights = parseFen('4k3/8/8/8/8/5N2/8/1N2K3 w - - 0 1') as Position;
const b1 = square(1, 0) as number;
const d2 = square(3, 1) as number;
const knightMove = legalMoves(knights, b1).find((move) => move.to === d2) as Move;
assert.equal(toSan(knights, knightMove, applyMove(knights, knightMove)), 'Nbd2', 'the file disambiguates two knights');
// A single knight reaching the same square needs no letter.
const loneKnight = parseFen('4k3/8/8/8/8/5N2/8/4K3 w - - 0 1') as Position;
const f3 = square(5, 2) as number;
const loneMove = legalMoves(loneKnight, f3).find((move) => move.to === d2) as Move;
assert.equal(toSan(loneKnight, loneMove, applyMove(loneKnight, loneMove)), 'Nd2');

const mateSan = toSan(parseFen('6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1') as Position, { from: square(4, 0) as number, to: square(4, 7) as number, piece: { color: 'w', type: 'r' }, captured: null }, parseFen('4R1k1/5ppp/8/8/8/8/5PPP/6K1 b - - 1 1') as Position);
assert.equal(mateSan, 'Re8#', 'checkmate gets a hash');

//#endregion Notation
