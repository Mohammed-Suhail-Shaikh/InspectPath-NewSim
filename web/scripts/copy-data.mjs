// Copies the repo-root data/ folder into web/public/data/ so Vite serves it at
// /data (matching VITE_DATA_BASE_URL's default). Runs automatically before
// `npm run dev` and `npm run build` via the predev/prebuild hooks.
//
// Licensing: CODEBRIM images must not be published. When PUBLIC_DEPLOY=true,
// the images/ subtree is skipped so a public build contains JSON only.
// Local dev (PUBLIC_DEPLOY unset) copies everything.

import { cp, rm, mkdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(webRoot, "..");

const SRC = path.join(repoRoot, "data");
const DEST = path.join(webRoot, "public", "data");

const publicDeploy = process.env.PUBLIC_DEPLOY === "true";

async function isDir(p) {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}

async function main() {
  // No data/ yet (teammates haven't produced outputs). Nothing to copy; the
  // dashboard falls back to mocks. Not an error.
  if (!existsSync(SRC)) {
    console.log("[copy-data] No repo-root data/ folder found; skipping (using mocks).");
    return;
  }

  // Start from a clean destination so stale files never linger.
  if (existsSync(DEST)) {
    await rm(DEST, { recursive: true, force: true });
  }
  await mkdir(DEST, { recursive: true });

  const skipImages = publicDeploy;

  // Windows: Node's cp passes the source with an extended-length prefix
  // (\\?\...). Strip it so path comparisons against SRC work.
  const stripPrefix = (p) => p.replace(/^\\\\\?\\/, "");
  const srcNorm = stripPrefix(SRC);

  // Never serve local-only subtrees. data/external/ (KU Leuven FEM source,
  // CC BY-NC-SA) and data/datasets/ are gitignored and must not be published,
  // even in local dev. data/images/ (CODEBRIM) is additionally skipped on a
  // public deploy. The derived geometry (data/structures/) and generated plans
  // (data/plans/) ARE served.
  const alwaysSkipTop = new Set(["external", "datasets"]);
  const filter = (source) => {
    const rel = path.relative(srcNorm, stripPrefix(source));
    // rel is "" for SRC itself, "<name>" for a top dir, "<name>/<...>" below it.
    const top = rel.split(path.sep)[0];
    if (alwaysSkipTop.has(top)) return false;
    if (skipImages && top === "images") return false;
    return true;
  };

  await cp(SRC, DEST, { recursive: true, filter });

  if (skipImages) {
    console.log(
      "[copy-data] PUBLIC_DEPLOY=true: copied JSON only; skipped data/external/, " +
        "data/datasets/, and data/images/ (local-only / not published)."
    );
  } else if (await isDir(path.join(SRC, "images"))) {
    console.log(
      "[copy-data] Copied data/ (including images) to web/public/data/; " +
        "skipped data/external/ and data/datasets/ (local-only)."
    );
  } else {
    console.log(
      "[copy-data] Copied data/ to web/public/data/; skipped data/external/ " +
        "and data/datasets/ (local-only)."
    );
  }
}

main().catch((err) => {
  console.error("[copy-data] failed:", err);
  process.exit(1);
});
