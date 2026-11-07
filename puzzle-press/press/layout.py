"""KDP ペーパーバック用の本文 PDF を作る（8.5 x 11 インチ、塗り足しなし、フォント埋め込み）。"""

from __future__ import annotations

from pathlib import Path

from reportlab.lib.enums import TA_CENTER
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph
from reportlab.lib.fonts import addMapping

from .wordbank import LEVEL_NAMES

FONT_DIR = Path(__file__).resolve().parent.parent / "fonts"

PAGE_W, PAGE_H = 8.5 * inch, 11 * inch
M_INSIDE, M_OUTSIDE = 0.75 * inch, 0.5 * inch
M_TOP, M_BOTTOM = 0.65 * inch, 0.7 * inch
CONTENT_W = PAGE_W - M_INSIDE - M_OUTSIDE
CONTENT_H = PAGE_H - M_TOP - M_BOTTOM
MAX_CELL = 0.42 * inch
MIN_CELL = 0.27 * inch
INK = (0.1, 0.1, 0.1)


def _register_fonts():
    if "Serif" in pdfmetrics.getRegisteredFontNames():
        return
    for name, file in [
        ("Serif", "Caladea-Regular.ttf"),
        ("Serif-Bold", "Caladea-Bold.ttf"),
        ("Sans", "Carlito-Regular.ttf"),
        ("Sans-Bold", "Carlito-Bold.ttf"),
        ("Sans-Italic", "Carlito-Italic.ttf"),
    ]:
        pdfmetrics.registerFont(TTFont(name, str(FONT_DIR / file)))
    addMapping("Sans", 0, 0, "Sans")
    addMapping("Sans", 1, 0, "Sans-Bold")
    addMapping("Sans", 0, 1, "Sans-Italic")
    addMapping("Sans", 1, 1, "Sans-Bold")


def _esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


class BookPDF:
    def __init__(self, path: Path, meta: dict):
        _register_fonts()
        self.meta = meta
        self.c = canvas.Canvas(str(path), pagesize=(PAGE_W, PAGE_H), initialFontName="Sans", initialFontSize=10)
        self.c.setTitle(meta["title"])
        self.c.setAuthor(meta.get("author", ""))
        self.page = 1  # 1ページ目は右ページ（奇数＝右）

    # ---- ページの枠 ----
    def left_x(self):
        return M_INSIDE if self.page % 2 == 1 else M_OUTSIDE

    def new_page(self, number=True):
        if number:
            self.c.setFont("Sans", 9)
            self.c.setFillColorRGB(*INK)
            self.c.drawCentredString(self.left_x() + CONTENT_W / 2, 0.42 * inch, str(self.page))
        self.c.showPage()
        self.page += 1

    def save(self):
        self.c.save()

    # ---- 前付け ----
    def title_page(self):
        c, m = self.c, self.meta
        cx = self.left_x() + CONTENT_W / 2
        c.setFillColorRGB(*INK)
        c.setFont("Serif-Bold", 40)
        y = PAGE_H * 0.62
        for line in m["title"].split("\n"):
            c.drawCentredString(cx, y, line)
            y -= 48
        c.setFont("Serif", 17)
        y -= 6
        for line in m.get("subtitle", "").split("\n"):
            if line:
                c.drawCentredString(cx, y, line)
                y -= 24
        c.setLineWidth(0.8)
        c.line(cx - 0.8 * inch, y - 4, cx + 0.8 * inch, y - 4)
        if m.get("author"):
            c.setFont("Sans", 13)
            c.drawCentredString(cx, M_BOTTOM + 0.6 * inch, m["author"])
        self.new_page(number=False)

    def copyright_page(self):
        m = self.meta
        style = ParagraphStyle("cp", fontName="Sans", fontSize=9.5, leading=13.5, textColor=INK)
        lines = m.get("copyright_lines") or []
        text = "<br/>".join(_esc(l) for l in lines)
        p = Paragraph(text, style)
        _, h = p.wrap(CONTENT_W * 0.8, CONTENT_H)
        p.drawOn(self.c, self.left_x(), M_BOTTOM + 0.3 * inch)
        self.new_page(number=False)

    def how_to_page(self, ranges: dict, solutions_page: int, total: int):
        c = self.c
        x = self.left_x()
        y = PAGE_H - M_TOP - 0.3 * inch
        c.setFillColorRGB(*INK)
        c.setFont("Serif-Bold", 26)
        c.drawString(x, y, "How to Play")
        y -= 0.25 * inch
        body = ParagraphStyle("b", fontName="Sans", fontSize=12, leading=17.5, textColor=INK, spaceAfter=8)
        paras = self.meta.get("how_to") or []
        for t in paras:
            p = Paragraph(t, body)
            _, h = p.wrap(CONTENT_W, CONTENT_H)
            y -= h
            p.drawOn(c, x, y)
            y -= 10
        y -= 0.3 * inch
        c.setFont("Serif-Bold", 20)
        c.drawString(x, y, "Contents")
        y -= 0.38 * inch
        rows = [(LEVEL_NAMES[lv], f"Puzzles {a}\u2013{b}") for lv, (a, b) in sorted(ranges.items())]
        rows.append(("Solutions", f"page {solutions_page}"))
        c.setFont("Sans", 13)
        for left, right in rows:
            c.drawString(x, y, left)
            c.drawRightString(x + CONTENT_W, y, right)
            c.setDash(1, 3)
            c.setLineWidth(0.5)
            c.line(x + c.stringWidth(left, "Sans", 13) + 8, y + 3, x + CONTENT_W - c.stringWidth(right, "Sans", 13) - 8, y + 3)
            c.setDash()
            y -= 0.33 * inch
        self.new_page()

    def divider_page(self, text: str, sub: str = ""):
        c = self.c
        cx = self.left_x() + CONTENT_W / 2
        c.setFillColorRGB(*INK)
        c.setFont("Serif-Bold", 36)
        c.drawCentredString(cx, PAGE_H * 0.55, text)
        if sub:
            c.setFont("Sans", 13)
            c.drawCentredString(cx, PAGE_H * 0.55 - 30, sub)
        self.new_page()

    # ---- 盤面 ----
    def draw_grid(self, puzzle, x, y_top, cell, solution=False, numbers=True):
        c = self.c
        nums = puzzle.numbers() if numbers else {}
        c.setLineWidth(0.9 if cell > 0.2 * inch else 0.5)
        c.setStrokeColorRGB(*INK)
        for (r, col), ch in puzzle.grid.items():
            cx = x + col * cell
            cy = y_top - (r + 1) * cell
            c.setFillColorRGB(1, 1, 1)
            c.rect(cx, cy, cell, cell, stroke=1, fill=1)
            c.setFillColorRGB(*INK)
            n = nums.get((r, col))
            if n:
                fs = max(5.0, cell * 0.27)
                c.setFont("Sans", fs)
                c.drawString(cx + cell * 0.07, cy + cell - fs * 0.95, str(n))
            if solution:
                fs = cell * 0.62
                c.setFont("Sans-Bold", fs)
                c.drawCentredString(cx + cell / 2, cy + cell * 0.22, ch)

    # ---- 問題ページ ----
    def _clue_flowables(self, puzzle, size):
        num_w = size * 1.9
        head = ParagraphStyle("h", fontName="Sans-Bold", fontSize=size + 1.5, leading=(size + 1.5) * 1.3,
                              textColor=INK, spaceBefore=0)
        st = ParagraphStyle("c", fontName="Sans", fontSize=size, leading=size * 1.28, textColor=INK,
                            leftIndent=num_w, firstLineIndent=-num_w)
        items = []
        for title, plist in (("ACROSS", puzzle.across), ("DOWN", puzzle.down)):
            if not plist:
                continue
            items.append(("head", Paragraph(title, head)))
            for p in plist:
                enum = p.entry.enumeration
                text = f"<b>{p.number}</b> {_esc(p.entry.clue)}" + (f" {enum}" if enum else "")
                items.append(("clue", Paragraph(text, st)))
        return items

    @staticmethod
    def _col_height(col, gap):
        h = 0.0
        for i, (kind, p, ph, before) in enumerate(col):
            h += (before if i else 0) + ph + gap
        return h

    def _layout_clues(self, puzzle, col_w, size):
        """ヒントを2列に分ける。(列のリスト, 列の高さ, 行間) を返す。"""
        gap = size * 0.3
        items = []
        for kind, p in self._clue_flowables(puzzle, size):
            _, ph = p.wrap(col_w, CONTENT_H)
            before = size * 0.9 if kind == "head" else 0
            items.append((kind, p, ph, before))
        # 2列の高い方が最小になる位置で分ける。見出しだけ左列の最後に残さない
        best = None
        for split in range(1, len(items)):
            if items[split - 1][0] == "head":
                continue
            h = max(self._col_height(items[:split], gap), self._col_height(items[split:], gap))
            if best is None or h < best[0]:
                best = (h, split)
        h, split = best if best else (self._col_height(items, gap), len(items))
        return [items[:split], items[split:]], h, gap

    def puzzle_page(self, index: int, puzzle, level: int):
        c = self.c
        x = self.left_x()
        top = PAGE_H - M_TOP
        # 見出し
        c.setFillColorRGB(*INK)
        c.setFont("Serif-Bold", 22)
        c.drawString(x, top - 22, f"Puzzle {index}")
        c.setFont("Sans", 11)
        c.drawRightString(x + CONTENT_W, top - 20, LEVEL_NAMES[level])
        c.setLineWidth(0.6)
        c.line(x, top - 32, x + CONTENT_W, top - 32)
        header_h = 32 + 14

        col_gap = 0.3 * inch
        col_w = (CONTENT_W - col_gap) / 2
        for size in (10.5, 10, 9.5, 9):
            cols, clue_h, gap = self._layout_clues(puzzle, col_w, size)
            avail_h = CONTENT_H - header_h - clue_h - 0.25 * inch
            cell = min(MAX_CELL, avail_h / puzzle.rows, CONTENT_W / puzzle.cols)
            if cell >= MIN_CELL:
                break
        self.last_cell = cell
        grid_w = cell * puzzle.cols
        grid_h = cell * puzzle.rows
        gx = x + (CONTENT_W - grid_w) / 2
        gy_top = top - header_h - max(0, (avail_h - grid_h) * 0.35)
        self.draw_grid(puzzle, gx, gy_top, cell)

        # ヒント（下寄せ）
        y_start = M_BOTTOM + clue_h
        for ci, col in enumerate(cols):
            cx = x + ci * (col_w + col_gap)
            y = y_start
            for i, (kind, p, ph, before) in enumerate(col):
                y -= (before if i else 0) + ph
                p.drawOn(c, cx, y)
                y -= gap
        self.size_used = size
        self.new_page()

    # ---- 解答ページ（1ページ6問） ----
    def solutions_pages(self, puzzles: list):
        per_page, ncols, nrows = 6, 2, 3
        gap_x, gap_y, label_h = 0.35 * inch, 0.3 * inch, 18
        box_w = (CONTENT_W - gap_x) / ncols
        box_h = (CONTENT_H - gap_y * (nrows - 1)) / nrows
        for start in range(0, len(puzzles), per_page):
            c = self.c
            x0 = self.left_x()
            for k, (index, pz) in enumerate(puzzles[start:start + per_page]):
                col, row = k % ncols, k // ncols
                bx = x0 + col * (box_w + gap_x)
                by_top = PAGE_H - M_TOP - row * (box_h + gap_y)
                c.setFillColorRGB(*INK)
                c.setFont("Serif-Bold", 12)
                c.drawString(bx, by_top - 12, f"Puzzle {index}")
                cell = min((box_w) / pz.cols, (box_h - label_h - 6) / pz.rows, 0.22 * inch)
                gx = bx + (box_w - cell * pz.cols) / 2
                self.draw_grid(pz, gx, by_top - label_h - 4, cell, solution=True, numbers=False)
            self.new_page()
