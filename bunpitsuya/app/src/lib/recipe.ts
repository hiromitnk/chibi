import { readFile } from "node:fs/promises";
import path from "node:path";

// app/core/ は ../core の写し（scripts/sync-core.mjs）。Vercel ではこの写しだけが見える。
const CORE = path.resolve(process.cwd(), "core");

async function read(name: string): Promise<string> {
  return readFile(path.join(CORE, name), "utf8");
}

/** core/recipe.md + checks.md（+ 台帳）をそのままシステムプロンプトにする */
export async function buildSystemPrompt(ledger?: string): Promise<string> {
  const [recipe, checks] = await Promise.all([read("recipe.md"), read("checks.md")]);
  const parts = [
    "あなたは文章を仕立てる店の仕立て手です。以下の手順書と点検表に従い、注文票の通りに一本の文章を仕立てます。",
    "工程は客から一つずつ求められます。求められた工程だけを、見出し `# N ｜ 〈工程名〉` から書き出し、次の工程に進まないでください。",
    "各工程の中は、項目ごとに段落を分けてください（段落は空行で区切る）。付箋一枚に一段落が貼られます。",
    "",
    "=== 手順書（recipe.md） ===",
    recipe,
    "",
    "=== 点検表（checks.md） ===",
    checks,
  ];
  if (ledger?.trim()) parts.push("", "=== 書き手の台帳 ===", ledger.trim());
  else parts.push("", "=== 書き手の台帳 ===", "台帳なし。注文票の指定に従う。");
  return parts.join("\n");
}
