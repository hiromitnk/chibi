#!/usr/bin/env python3
"""お酒テーマのクロスワード本（KDP 用の本文 PDF）を作る。

使い方:
    python3 build.py beer            # books/beer から output/beer/ を作る
    python3 build.py --all           # books/ の全部
    python3 build.py beer --check    # 単語リストの検査だけ
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from press import wordbank  # noqa: E402
from press.crossword import build_puzzle  # noqa: E402
from press.layout import BookPDF  # noqa: E402

DEFAULTS = {
    "puzzles": 50,
    "words_per_puzzle": 18,
    "min_words": 14,
    "max_grid": 17,
    "seed": 1,
    "author": "AUTHOR NAME",
    "year": 2026,
    "paper": "white",
}

# KDP のページ厚（インチ/ページ）。最終値は KDP の計算ツールで確認すること
PAPER_THICKNESS = {"white": 0.002252, "cream": 0.0025}


def default_texts(meta: dict) -> dict:
    topic = meta["topic"]
    return {
        "copyright_lines": [
            meta["title"].replace("\n", " "),
            f"Copyright © {meta['year']} {meta['author']}. All rights reserved.",
            "",
            "No part of this book may be reproduced in any form without written permission "
            "from the publisher, except for brief quotations in reviews.",
            "",
            "This book is intended for adults of legal drinking age. Please enjoy alcohol responsibly.",
        ]
        + ([""] + meta["disclosure"].split("\n") if meta.get("disclosure") else []),
        "how_to": [
            f"Every puzzle in this book is a criss-cross grid built entirely from {topic} words: "
            "styles, ingredients, places, history, tools and tasting terms.",
            "Read the numbered clues, then write each answer into the boxes that start at the "
            "same number — left to right for <b>Across</b>, top to bottom for <b>Down</b>. "
            "Where two answers cross, they share a letter.",
            "Answers of more than one word show the length of each word in parentheses, "
            "for example <b>(4,3)</b>. Write them in the grid without spaces or hyphens.",
            "The puzzles get harder as you go: Easy, then Medium, then Hard. "
            "Complete solutions are at the back of the book.",
        ],
    }


def load_meta(book_dir: Path) -> dict:
    meta = dict(DEFAULTS)
    meta.update(json.loads((book_dir / "book.json").read_text(encoding="utf-8")))
    texts = default_texts(meta)
    for k, v in texts.items():
        meta.setdefault(k, v)
    return meta


def check(book_dir: Path):
    entries = wordbank.load(book_dir / "words.json")
    errors, warnings = wordbank.validate(entries)
    return entries, errors, warnings


def generate(entries, meta, log):
    rng = random.Random(meta["seed"])
    picker = wordbank.Picker(entries, rng)
    total = meta["puzzles"]
    result = []
    for i in range(total):
        level = wordbank.level_for(i, total)
        best = None
        for _try in range(10):
            chosen = picker.pick(meta["words_per_puzzle"], level)
            pz, left = build_puzzle(chosen, meta["max_grid"], rng)
            if best is None or len(pz.placements) > len(best.placements):
                best = pz
            if len(pz.placements) >= meta["min_words"]:
                break
        if len(best.placements) < meta["min_words"]:
            log.append(f"Puzzle {i + 1}: {len(best.placements)} 語しか置けなかった（最低 {meta['min_words']}）")
        picker.commit([p.entry for p in best.placements])
        result.append((i + 1, level, best))
    return result, picker.usage


def build(book_dir: Path, out_root: Path):
    slug = book_dir.name
    meta = load_meta(book_dir)
    entries, errors, warnings = check(book_dir)
    if errors:
        print(f"[{slug}] 単語リストにエラーがあるため中止：")
        for e in errors:
            print("  -", e)
        return False

    log = []
    puzzles, usage = generate(entries, meta, log)
    out = out_root / slug
    out.mkdir(parents=True, exist_ok=True)

    # ページ番号の見積もり：1 扉 / 2 権利表記 / 3 遊び方 / 4〜 問題 / 解答の扉 / 解答
    n = len(puzzles)
    solutions_page = 4 + n
    ranges = {}
    for idx, lv, _ in puzzles:
        a, b = ranges.get(lv, (idx, idx))
        ranges[lv] = (min(a, idx), max(b, idx))

    pdf = BookPDF(out / "interior.pdf", meta)
    pdf.title_page()
    pdf.copyright_page()
    pdf.how_to_page(ranges, solutions_page, n)
    cells, sizes = [], []
    for idx, lv, pz in puzzles:
        pdf.puzzle_page(idx, pz, lv)
        cells.append(pdf.last_cell)
        sizes.append(pdf.size_used)
    assert pdf.page == solutions_page, (pdf.page, solutions_page)
    pdf.divider_page("Solutions")
    pdf.solutions_pages([(idx, pz) for idx, _, pz in puzzles])
    pages = pdf.page - 1
    pdf.save()

    (out / "puzzles.json").write_text(
        json.dumps([{"index": i, "level": lv, **pz.to_dict()} for i, lv, pz in puzzles], ensure_ascii=False, indent=1),
        encoding="utf-8",
    )

    # レポート
    used = Counter({e.letters: usage.get(e.letters, 0) for e in entries})
    per_puzzle = [len(pz.placements) for _, _, pz in puzzles]
    spine = pages * PAPER_THICKNESS[meta["paper"]]
    unused = [e.answer for e in entries if used[e.letters] == 0]
    most = used.most_common(5)
    lines = [
        f"# {meta['title'].replace(chr(10), ' ')} — ビルド結果",
        "",
        f"- ページ数: **{pages}**（8.5 x 11 in、塗り足しなし）",
        f"- 問題数: {n}（1問あたり {min(per_puzzle)}〜{max(per_puzzle)} 語、平均 {sum(per_puzzle) / n:.1f} 語）",
        f"- 単語リスト: {len(entries)} 語（未使用 {len(unused)} 語）",
        f"- 1語あたりの使用回数: 平均 {sum(used.values()) / len(entries):.1f} 回、最多 {most[0][1] if most else 0} 回",
        f"- マスの大きさ: {min(cells) / 72:.2f}〜{max(cells) / 72:.2f} in、ヒントの文字: {min(sizes)}〜{max(sizes)} pt",
        "",
        "## 表紙の寸法（目安。必ず KDP の計算ツールで確認）",
        "",
        f"- 用紙: {meta['paper']}、背幅 {spine:.3f} in",
        f"- 表紙全体（塗り足し込み）: {2 * 8.5 + spine + 0.25:.3f} x 11.25 in",
        f"- 背表紙に文字を入れられるのは 79 ページ超から（現在 {pages} ページ）",
        "",
    ]
    if warnings or log:
        lines += ["## 注意", ""] + [f"- {w}" for w in warnings + log] + [""]
    if unused:
        lines += ["## 一度も使われなかった単語", "", ", ".join(unused), ""]
    (out / "report.md").write_text("\n".join(lines), encoding="utf-8")
    print(f"[{slug}] {pages} ページ → {out / 'interior.pdf'}")
    for w in log:
        print("  !", w)
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("books", nargs="*")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--check", action="store_true", help="単語リストの検査だけ")
    ap.add_argument("--out", default=str(ROOT / "output"))
    args = ap.parse_args()

    names = sorted(p.name for p in (ROOT / "books").iterdir() if (p / "words.json").exists()) if args.all else args.books
    if not names:
        ap.error("本の名前（例: beer）か --all を指定してください")
    ok = True
    for name in names:
        book_dir = ROOT / "books" / name
        if args.check:
            entries, errors, warnings = check(book_dir)
            print(f"[{name}] {len(entries)} 語、エラー {len(errors)}、注意 {len(warnings)}")
            for e in errors:
                print("  E", e)
            for w in warnings:
                print("  W", w)
            ok &= not errors
        else:
            ok &= build(book_dir, Path(args.out))
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
