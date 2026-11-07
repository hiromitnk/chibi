"""クロスワード（クリスクロス型）の生成。

単語リストだけで盤面を組む。埋め草の一般語は使わない。
- 単語は互いに直交して交差する。横に並んだ別の単語と接しない（読めない文字列を作らない）。
- 盤面は max_size x max_size に収める。
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field

ACROSS = "across"
DOWN = "down"


@dataclass
class Entry:
    answer: str          # 表示用（"PALE ALE"）
    clue: str
    category: str = ""
    difficulty: int = 2

    @property
    def letters(self) -> str:
        return "".join(ch for ch in self.answer if ch.isalpha())

    @property
    def enumeration(self) -> str:
        """複数語なら (4,3)、ハイフンなら (3-4)。1語なら空。"""
        if " " not in self.answer and "-" not in self.answer:
            return ""
        out, n = [], 0
        for ch in self.answer:
            if ch.isalpha():
                n += 1
            else:
                out.append(str(n))
                out.append("," if ch == " " else "-")
                n = 0
        out.append(str(n))
        return "(" + "".join(out) + ")"


@dataclass
class Placement:
    entry: Entry
    row: int
    col: int
    direction: str
    number: int = 0

    def cells(self):
        word = self.entry.letters
        for i, ch in enumerate(word):
            if self.direction == ACROSS:
                yield self.row, self.col + i, ch
            else:
                yield self.row + i, self.col, ch


@dataclass
class Puzzle:
    placements: list[Placement]
    rows: int
    cols: int
    grid: dict = field(default_factory=dict)  # (r, c) -> letter

    @property
    def across(self):
        return sorted((p for p in self.placements if p.direction == ACROSS), key=lambda p: p.number)

    @property
    def down(self):
        return sorted((p for p in self.placements if p.direction == DOWN), key=lambda p: p.number)

    def numbers(self):
        """(r, c) -> 番号"""
        return {(p.row, p.col): p.number for p in self.placements}

    def to_dict(self):
        return {
            "rows": self.rows,
            "cols": self.cols,
            "words": [
                {
                    "number": p.number,
                    "direction": p.direction,
                    "row": p.row,
                    "col": p.col,
                    "answer": p.entry.answer,
                    "clue": p.entry.clue,
                }
                for p in sorted(self.placements, key=lambda p: (p.direction, p.number))
            ],
        }


class _Board:
    def __init__(self, max_size: int):
        self.max_size = max_size
        self.cells: dict[tuple[int, int], str] = {}
        self.dirs: dict[tuple[int, int], set] = {}
        self.placements: list[Placement] = []
        self.min_r = self.max_r = self.min_c = self.max_c = None

    def _bbox_ok(self, r0, c0, r1, c1):
        if self.min_r is None:
            return (r1 - r0 + 1) <= self.max_size and (c1 - c0 + 1) <= self.max_size
        return (max(self.max_r, r1) - min(self.min_r, r0) + 1) <= self.max_size and (
            max(self.max_c, c1) - min(self.min_c, c0) + 1
        ) <= self.max_size

    def check(self, word: str, r: int, c: int, d: str):
        """置けるなら交差数を返す。置けないなら -1。"""
        n = len(word)
        dr, dc = (0, 1) if d == ACROSS else (1, 0)
        r1, c1 = r + dr * (n - 1), c + dc * (n - 1)
        if not self._bbox_ok(min(r, r1), min(c, c1), max(r, r1), max(c, c1)):
            return -1
        # 単語の前後は空き
        if (r - dr, c - dc) in self.cells or (r1 + dr, c1 + dc) in self.cells:
            return -1
        crossings = 0
        for i, ch in enumerate(word):
            rr, cc = r + dr * i, c + dc * i
            existing = self.cells.get((rr, cc))
            if existing is not None:
                if existing != ch or d in self.dirs[(rr, cc)]:
                    return -1
                crossings += 1
            else:
                # 交差しないマスは、直交方向の隣が空いていること
                if d == ACROSS:
                    if (rr - 1, cc) in self.cells or (rr + 1, cc) in self.cells:
                        return -1
                else:
                    if (rr, cc - 1) in self.cells or (rr, cc + 1) in self.cells:
                        return -1
        if crossings == n:
            return -1
        return crossings

    def place(self, entry: Entry, r: int, c: int, d: str):
        p = Placement(entry, r, c, d)
        for rr, cc, ch in p.cells():
            self.cells[(rr, cc)] = ch
            self.dirs.setdefault((rr, cc), set()).add(d)
            if self.min_r is None:
                self.min_r = self.max_r = rr
                self.min_c = self.max_c = cc
            else:
                self.min_r, self.max_r = min(self.min_r, rr), max(self.max_r, rr)
                self.min_c, self.max_c = min(self.min_c, cc), max(self.max_c, cc)
        self.placements.append(p)

    def candidates(self, word: str):
        """既存の文字と交差する置き場所を列挙する。"""
        seen = set()
        for (rr, cc), ch in self.cells.items():
            if len(self.dirs[(rr, cc)]) == 2:
                continue
            for i, wch in enumerate(word):
                if wch != ch:
                    continue
                d = DOWN if ACROSS in self.dirs[(rr, cc)] else ACROSS
                r, c = (rr, cc - i) if d == ACROSS else (rr - i, cc)
                key = (r, c, d)
                if key in seen:
                    continue
                seen.add(key)
                x = self.check(word, r, c, d)
                if x > 0:
                    yield r, c, d, x

    def area_after(self, word, r, c, d):
        n = len(word)
        r1 = r + (n - 1 if d == DOWN else 0)
        c1 = c + (n - 1 if d == ACROSS else 0)
        h = max(self.max_r, r1) - min(self.min_r, r) + 1
        w = max(self.max_c, c1) - min(self.min_c, c) + 1
        return h, w


def _attempt(entries: list[Entry], max_size: int, rng: random.Random):
    board = _Board(max_size)
    order = sorted(entries, key=lambda e: -len(e.letters))
    # 長い順を基本に少し揺らす
    order = sorted(order, key=lambda e: -len(e.letters) + rng.random() * 3)
    first = order[0]
    board.place(first, 0, 0, ACROSS if rng.random() < 0.5 else DOWN)
    pending = order[1:]
    # 置けなかった単語は後で再挑戦（盤面が育つと置ける場合がある）
    for _round in range(3):
        left = []
        for e in pending:
            word = e.letters
            best, best_score = None, None
            for r, c, d, x in board.candidates(word):
                h, w = board.area_after(word, r, c, d)
                score = x * 10 - (h * w) * 0.15 - abs(h - w) * 0.8 + rng.random()
                if best_score is None or score > best_score:
                    best, best_score = (r, c, d), score
            if best:
                board.place(e, *best)
            else:
                left.append(e)
        if not left or len(left) == len(pending):
            pending = left
            break
        pending = left
    return board, pending


def _finalize(board: _Board) -> Puzzle:
    # 原点を (0,0) に寄せる
    r0, c0 = board.min_r, board.min_c
    for p in board.placements:
        p.row -= r0
        p.col -= c0
    grid = {(r - r0, c - c0): ch for (r, c), ch in board.cells.items()}
    # 番号付け：上の行から、左から
    starts = sorted({(p.row, p.col) for p in board.placements})
    num = {pos: i + 1 for i, pos in enumerate(starts)}
    for p in board.placements:
        p.number = num[(p.row, p.col)]
    return Puzzle(
        placements=board.placements,
        rows=board.max_r - board.min_r + 1,
        cols=board.max_c - board.min_c + 1,
        grid=grid,
    )


def build_puzzle(entries: list[Entry], max_size: int, rng: random.Random, attempts: int = 120):
    """entries をなるべく全部置いた盤面を返す。(puzzle, 置けなかった単語)"""
    best = None
    for _ in range(attempts):
        board, left = _attempt(entries, max_size, rng)
        crossings = sum(1 for v in board.dirs.values() if len(v) == 2)
        h = board.max_r - board.min_r + 1
        w = board.max_c - board.min_c + 1
        key = (len(board.placements), crossings - (h * w) * 0.05 - abs(h - w) * 0.3)
        if best is None or key > best[0]:
            best = (key, board, left)
    _, board, left = best
    return _finalize(board), left
