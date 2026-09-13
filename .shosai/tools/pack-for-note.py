#!/usr/bin/env python3
"""下書き(.md)を note.com に貼り付ける直前の形に梱包する。

使い方:
  python3 .shosai/tools/pack-for-note.py .shosai/content/drafts/<slug>.md

出力: .shosai/content/publish/<slug>/
  title.txt      … タイトル（1行）
  body.txt       … 本文。段落ごとに空行。区切り(---)は空行2つに変換。
                   有料記事なら `===有料ライン===` の位置に [ここに有料ラインを置く] を残す
  eyecatch.png   … 挿絵（frontmatterの「挿絵:」から解決）
  checklist.md   … noteで手で行う手順と、公開前チェックの写し
"""
import re, sys, shutil, pathlib

if len(sys.argv) < 2:
    sys.exit(__doc__)

src = pathlib.Path(sys.argv[1]).resolve()
text = src.read_text(encoding="utf-8")
lines = text.splitlines()

# --- title ---
title = next((l[2:].strip() for l in lines if l.startswith("# ")), src.stem)

# --- frontmatter (「- key: value」の連続。継続行はインデント) と本文の境界 ---
body_start = None
for i, l in enumerate(lines):
    if l.strip() == "---":
        body_start = i + 1
        break
if body_start is None:
    sys.exit("frontmatter の終わり(---)が見つからない")
front = "\n".join(lines[1:body_start - 1])
body_lines = lines[body_start:]

# --- 挿絵の解決 ---
m = re.search(r"挿絵:\s*`([^`]+)`", front)
eyecatch = (src.parent / m.group(1)).resolve() if m else None

# --- 種別 ---
kind = "有料" if re.search(r"種別:\s*有料", front) else "無料"

# --- 本文整形 ---
out = []
for l in body_lines:
    s = l.rstrip()
    if s == "---":
        out.append("")  # 区切りは空行に。noteで区切り線が欲しければ手で入れる
        continue
    if s == "===有料ライン===":
        out.append("")
        out.append("[ここに有料ラインを置く]")
        out.append("")
        continue
    # 注番号 注1 → （注1） にして目立たせる
    s = re.sub(r"(?<=[^（(])注(\d+)(?=[^）)])", r"（注\1）", s)
    out.append(s)
body = re.sub(r"\n{3,}", "\n\n", "\n".join(out)).strip() + "\n"

paid_marker = "[ここに有料ラインを置く]" in body
if kind == "有料" and not paid_marker:
    sys.exit("種別が有料なのに ===有料ライン=== が本文にない")
if kind == "無料" and paid_marker:
    sys.exit("種別が無料なのに ===有料ライン=== が本文にある")

# --- 出力 ---
dst = src.parents[1] / "publish" / src.stem
dst.mkdir(parents=True, exist_ok=True)
(dst / "title.txt").write_text(title + "\n", encoding="utf-8")
(dst / "body.txt").write_text(body, encoding="utf-8")
if eyecatch and eyecatch.exists():
    shutil.copy(eyecatch, dst / "eyecatch.png")

n_chars = len(re.sub(r"\s", "", body))
checklist = f"""# 投稿手順: {title}

種別: {kind} ／ 本文 {n_chars} 字 ／ 元: {src.name}

## noteで手でやること（この順）
1. note.com → 投稿 → テキスト
2. `title.txt` をタイトルに貼る
3. `body.txt` を本文に貼る（段落は空行で区切ってある。見出しは付けない）
4. 見出し画像に `eyecatch.png` を設定
{"5. `[ここに有料ラインを置く]` の行を削除し、その位置に「有料エリア設定」→ 価格 500円" if kind=="有料" else "5. 価格設定は「無料」のまま"}
6. ハッシュタグ: #ADHD #ADHDライフハック #発達障害 #ライフハック（4つまで）
7. 公開前に本文を一度スクロールして、`[` `]` や `===` が残っていないか目で確認
8. 公開 → URLを `content/published/` のテンプレに記録し、`drafts/` から移動

## 公開前チェック（content/CLAUDE.md の写し。全部✓でなければ公開しない）
- [ ] 診断・治癒・効能・因果の断定がない
- [ ] 「あなたは〜です」がない
- [ ] ゼロ・必ず・絶対 がない
- [ ] 深刻な状態に触れるなら相談窓口がある
- [ ] itoori を通した
- [ ] persona.md と矛盾しない
- [ ] 業種・店名・地名・アカウント名が出ていない
{"- [ ] 有料パートに ①実物 ②効かなかったもの ③運用ルール がある" if kind=="有料" else ""}
"""
(dst / "checklist.md").write_text(checklist, encoding="utf-8")

print(f"→ {dst}")
for f in sorted(dst.iterdir()):
    print("   ", f.name)
