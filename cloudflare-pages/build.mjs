/**
 * BALI NIGHTCLUB: safe static output for Cloudflare Pages.
 *
 * Cloudflare Pages project settings:
 *   Production branch: main
 *   Root directory: cloudflare-pages
 *   Build command: node build.mjs
 *   Build output directory: dist
 *
 * This keeps the repository-root /functions (Firebase Cloud Functions),
 * scripts, tests, Firestore rules and configuration outside the public site.
 * No backend or DNS changes are performed by this script.
 */
import { existsSync, mkdirSync, readdirSync, copyFileSync, rmSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = dirname(fileURLToPath(import.meta.url));
const repoDir = resolve(projectDir, "..");
const outDir = join(projectDir, "dist");

const rootExtensions = new Set([
  ".html", ".js", ".css", ".svg", ".png", ".jpg", ".jpeg",
  ".webp", ".avif", ".gif", ".ico", ".woff", ".woff2",
  ".ttf", ".otf", ".webmanifest", ".xml", ".txt", ".wasm"
]);
const publicAssetExtensions = new Set([
  ...rootExtensions, ".mp4", ".webm", ".mp3", ".ogg"
]);
const publicAssetFolders = ["assets", "generated", "images", "img", "media", "fonts", "icons"];
const excludedNames = new Set([".env", ".git", ".github", "node_modules", "functions", "scripts", "tests"]);
const isHidden = name => name.startsWith(".");
let copied = 0;

function copyAssets(sourceDir, targetDir) {
  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    if (isHidden(entry.name) || excludedNames.has(entry.name) || entry.isSymbolicLink()) continue;
    const source = join(sourceDir, entry.name);
    const target = join(targetDir, entry.name);
    if (entry.isDirectory()) {
      mkdirSync(target, { recursive: true });
      copyAssets(source, target);
    } else if (entry.isFile() && publicAssetExtensions.has(extname(entry.name).toLowerCase())) {
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(source, target);
      copied += 1;
    }
  }
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

// Copy only root-level browser files, not project files like firebase.json.
for (const item of readdirSync(repoDir, { withFileTypes: true })) {
  if (!item.isFile() || isHidden(item.name)) continue;
  if (!rootExtensions.has(extname(item.name).toLowerCase())) continue;
  if (/^(?:test-|verify-|build-)|\.(?:spec|test)\.js$/i.test(item.name)) continue;
  copyFileSync(join(repoDir, item.name), join(outDir, item.name));
  copied += 1;
}
for (const folder of publicAssetFolders) {
  const source = join(repoDir, folder);
  if (existsSync(source) && statSync(source).isDirectory()) {
    const target = join(outDir, folder);
    mkdirSync(target, { recursive: true });
    copyAssets(source, target);
  }
}
const requiredFiles = [
  "index.html", "admin.html", "director-id.html",
  "firebase-config.js", "generated/index.css", "assets/bali-favicon.svg"
];
const missing = requiredFiles.filter(file => !existsSync(join(outDir, file)));
if (missing.length) {
  throw new Error("Cloudflare Pages build is missing required public files: " + missing.join(", "));
}
console.log("BALI Cloudflare Pages static build ready: " + copied + " public files.");
