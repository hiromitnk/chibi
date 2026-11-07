# puzzle-press — お酒テーマのクロスワード本（Amazon KDP / .com 向け）

1冊につき1種類のお酒をテーマにした、英語のクロスワード本の**本文 PDF** を作るツール。

| フォルダ | 本 |
|---|---|
| `books/beer` | Beer Crossword Puzzles |
| `books/wine` | Wine Crossword Puzzles |
| `books/whisky` | Whiskey Crossword Puzzles |
| `books/gin` | Gin Crossword Puzzles |
| `books/sake` | Sake Crossword Puzzles |

## できること / できないこと

- できる：単語リストから盤面を自動で組み、問題ページ・解答ページ・扉・目次まで入った **KDP 入稿用の本文 PDF**（8.5 x 11 インチ、塗り足しなし、フォント埋め込み）を作る
- できる：表紙に必要な背幅と表紙全体の寸法の目安を出す（`report.md`）
- できない：**表紙のデザイン**（Hiromi さんの担当）
- できない：**KDP へのアップロード**（KDP には一般向けの出版 API がないため手作業。ブラウザ操作の自動化は規約違反のおそれがあるので作らない）

## 使い方

```bash
cd puzzle-press
pip install reportlab          # 初回だけ（PDF を作るライブラリ）

python3 build.py beer --check  # 単語リストの検査だけ
python3 build.py beer          # output/beer/ に本を作る
python3 build.py --all         # 5冊まとめて
```

出力（`output/<本>/`、git には入れない）

| ファイル | 中身 |
|---|---|
| `interior.pdf` | KDP にアップロードする本文 |
| `report.md` | ページ数、背幅、表紙寸法、単語の使用回数、注意点 |
| `puzzles.json` | 全問題の盤面と答え（確認用） |

同じ設定なら、何度作り直しても同じ本になる（`seed` で固定）。

## 本の構成

1. 扉（タイトル・サブタイトル・著者名）
2. 権利表記（著作権、飲酒年齢の注意、AI 利用の開示文）
3. How to Play と目次
4. 問題 50 問（1ページ1問。前から 1/3 ずつ Easy → Medium → Hard）
5. Solutions の扉
6. 解答（1ページ6問）

## 設定（`books/<本>/book.json`）

| 項目 | 意味 | 初期値 |
|---|---|---|
| `title` / `subtitle` | 扉に出る文字（`\n` で改行） | |
| `topic` | How to Play の文中に入るテーマ名 | |
| `author` | 著者名（**要変更**） | `AUTHOR NAME` |
| `puzzles` | 問題数 | 50 |
| `words_per_puzzle` | 1問に入れる単語数の目標 | 18 |
| `min_words` | これ未満しか置けなかったら警告 | 14 |
| `max_grid` | 盤面の最大マス数（縦横） | 17 |
| `seed` | 乱数の種。変えると別の盤面になる | |
| `paper` | `white` か `cream`（背幅の計算に使う） | white |
| `disclosure` | 権利表記ページに入れる AI 利用の開示文 | |

## 単語リスト（`books/<本>/words.json`）

```json
{"answer": "PALE ALE", "clue": "Hoppy, golden-to-amber top-fermented style", "category": "Styles", "difficulty": 1}
```

- `answer`：A〜Z、スペース、ハイフンのみ。文字数（スペースとハイフンを除く）は 3〜13。複数語の答えは、ヒントの後ろに `(4,3)` が自動で付く
- `difficulty`：1＝気軽に飲む人 / 2＝好きな人 / 3＝マニア
- `--check` で検査される内容：文字種、文字数、重複、ヒントに答えが入っていないか、ヒントの長さ

**単語とヒントは AI（Claude）が下書きしたもの。** 出版前に必ず人が全部読んで確認すること。とくに次の点。

- 事実として正しいか（数字、法律上の定義、歴史）
- 答えが1つに決まるヒントか
- 商標やブランド名が入っていないか（入れない方針で作っている）
- `sake` の日本語ローマ字表記（Hiromi さんが一番確認しやすい本）

直したら `python3 build.py <本> --check` で検査し、もう一度作り直す。

## KDP に出すときの手順（手作業）

1. `author` を著者名に変えて `python3 build.py <本>`
2. `output/<本>/report.md` の背幅と表紙寸法で表紙を作る。寸法は **KDP の表紙計算ツールで最終確認**する
3. KDP で「ペーパーバック」を新規作成。判型 8.5 x 11 in、塗り足しなし、本文は白黒
4. 本文に `interior.pdf`、表紙 PDF をアップロード → プレビューアーで確認
5. **AI 生成コンテンツの質問には「はい」と答える**（ヒントの文章を AI で下書きしているため）。KDP の現在のルールは出版時に確認する
6. 価格を決めて出版

### 注意

- 似た本を短期間に大量に出すと、低品質・重複コンテンツとして出版停止になるおそれがある。5冊はテーマが別々なので問題ないはずだが、同じテーマで問題だけ変えた本の量産はしない
- 1日に出版できるタイトル数に上限がある（2023年時点で1日3タイトルまで。現在の数字は KDP のヘルプで確認）
- タイトル・サブタイトル・キーワードにブランド名を入れない

## 中身

| ファイル | 役割 |
|---|---|
| `build.py` | コマンド本体（検査 → 問題生成 → PDF → レポート） |
| `press/crossword.py` | 盤面の生成（クリスクロス型。単語同士が横に接しないように置く） |
| `press/wordbank.py` | 単語リストの読み込みと検査、問題ごとの単語選び（使用回数が均等になるように） |
| `press/layout.py` | PDF のレイアウト |
| `fonts/` | Caladea（見出し）と Carlito（本文）。どちらも SIL Open Font License で、PDF への埋め込みと同梱が可能 |
