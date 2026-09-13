// ../core/*.md を app/core/ に写す。手順書の原本は ../core にあり、こちらは配布用の写し。
// Vercel はこのディレクトリ（app）だけを見るので、写しを git に含める。
import { cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
const src = path.resolve("..", "core");
const dst = path.resolve("core");
if (!existsSync(src)) { console.log("[sync-core] ../core が無いので写しをそのまま使う"); process.exit(0); }
mkdirSync(dst, { recursive: true });
for (const f of ["recipe.md", "checks.md", "ledger-template.md"]) cpSync(path.join(src, f), path.join(dst, f));
console.log("[sync-core] core/*.md を更新");
