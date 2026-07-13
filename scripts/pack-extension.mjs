import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const version = pkg.version;
const zipName = `chrome-md-editor-v${version}.zip`;
const distDir = resolve(root, "dist");
const manifest = resolve(distDir, "manifest.json");

if (!existsSync(manifest)) {
  console.error("dist/manifest.json missing. Run npm run build first.");
  process.exit(1);
}

const zipPath = resolve(root, zipName);
execSync(`rm -f ${JSON.stringify(zipPath)}`, { cwd: root, stdio: "inherit" });
// Nested dist/ so README "select dist folder" remains correct after unzip
execSync(`zip -r ${JSON.stringify(zipName)} dist`, { cwd: root, stdio: "inherit" });
console.log(`Packed ${zipName}`);
