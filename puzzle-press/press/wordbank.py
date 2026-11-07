"""単語リスト（words.json）の読み込み・検査・問題ごとの単語選び。"""

from __future__ import annotations

import json
import random
import re
from collections import Counter
from pathlib import Path

from .crossword import Entry

ANSWER_RE = re.compile(r"^[A-Z]+(?:[ -][A-Z]+)*$")
MIN_LEN, MAX_LEN = 3, 13
MAX_CLUE = 90


def load(path: Path) -> list[Entry]:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    return [
        Entry(
            answer=str(d["answer"]).strip().upper(),
            clue=str(d["clue"]).strip(),
            category=str(d.get("category", "")).strip(),
            difficulty=int(d.get("difficulty", 2)),
        )
        for d in data
    ]


def _tokens(answer: str):
    return [t for t in re.split(r"[ -]", answer) if len(t) >= 3]


def _clue_words(clue: str) -> set:
    """ヒント中の単語（小文字）。'S と末尾の S を外した形も含める（Martini's → martini）。"""
    out = set()
    for w in re.findall(r"[a-z]+(?:'s)?", clue.lower()):
        w = w.removesuffix("'s")
        out.add(w)
        if len(w) > 3 and w.endswith("s"):
            out.add(w[:-1])
    return out


def validate(entries: list[Entry]):
    """(errors, warnings) を返す。errors があれば本は作らない。"""
    errors, warnings = [], []
    seen = {}
    for i, e in enumerate(entries, 1):
        tag = f"#{i} {e.answer}"
        if not ANSWER_RE.match(e.answer):
            errors.append(f"{tag}: 答えに A-Z・スペース・ハイフン以外の文字がある")
            continue
        n = len(e.letters)
        if not MIN_LEN <= n <= MAX_LEN:
            errors.append(f"{tag}: 文字数 {n}（{MIN_LEN}〜{MAX_LEN} の範囲外）")
        if e.letters in seen:
            errors.append(f"{tag}: #{seen[e.letters]} と答えが重複")
        seen.setdefault(e.letters, i)
        if not e.clue:
            errors.append(f"{tag}: ヒントが空")
        clue_words = re.findall(r"[a-z]+", e.clue.lower())
        for t in _tokens(e.answer):
            tl = t.lower()
            if tl in clue_words or (len(tl) >= 4 and any(w.startswith(tl) for w in clue_words)):
                errors.append(f"{tag}: ヒントに答え（{t}）が含まれている")
                break
        if len(e.clue) > MAX_CLUE:
            warnings.append(f"{tag}: ヒントが長い（{len(e.clue)}文字）")
        if e.difficulty not in (1, 2, 3):
            errors.append(f"{tag}: difficulty は 1〜3")
        if e.clue.endswith("."):
            warnings.append(f"{tag}: ヒントの末尾にピリオド")
    return errors, warnings


LEVEL_NAMES = {1: "Easy", 2: "Medium", 3: "Hard"}
# レベルごとの難易度の好み（小さいほど選ばれやすい）
_LEVEL_COST = {
    1: {1: 0.0, 2: 1.2, 3: 6.0},
    2: {1: 0.6, 2: 0.0, 3: 0.8},
    3: {1: 1.5, 2: 0.4, 3: 0.0},
}


def level_for(index: int, total: int) -> int:
    """問題番号（0始まり）から Easy / Medium / Hard を決める。前から順に1/3ずつ。"""
    return min(3, index * 3 // total + 1)


class Picker:
    """使用回数がなるべく均等になるように、問題ごとの単語を選ぶ。"""

    def __init__(self, entries: list[Entry], rng: random.Random):
        self.entries = entries
        self.rng = rng
        self.usage = Counter()

    def pick(self, n: int, level: int) -> list[Entry]:
        cost = _LEVEL_COST[level]
        scored = sorted(
            self.entries,
            key=lambda e: self.usage[e.letters] * 3.0 + cost[e.difficulty] + self.rng.random() * 2.5,
        )
        chosen, used_tokens, clue_words, long_count = [], set(), set(), 0
        for e in scored:
            if len(chosen) >= n:
                break
            toks = set(_tokens(e.answer)) | {e.letters}
            if toks & used_tokens:
                continue  # PALE ALE と ALE のように同じ語を含む答えは同じ問題に入れない
            words = _clue_words(e.clue)
            if {t.lower() for t in toks} & clue_words or words & {t.lower() for t in used_tokens}:
                continue  # 他の問題のヒントに答えが出てしまう組み合わせ（MONK と TRAPPIST など）は避ける
            if len(e.letters) >= 10:
                if long_count >= 4:
                    continue
                long_count += 1
            chosen.append(e)
            used_tokens |= toks
            clue_words |= words
        return chosen

    def commit(self, entries: list[Entry]):
        for e in entries:
            self.usage[e.letters] += 1
