import { readFile, lstat, realpath } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { createHash } from "node:crypto";

/** Verify locally bundled generated strips before applying any skin. */
export async function verifyBundledAssets(root, assets) {
  const base = await realpath(root);
  for (const asset of assets) {
    if (!/^assets\/(?:atlases|generated)\/[a-z-]+\.png$/.test(asset.file)) throw Error("Invalid bundled asset path");
    const file = resolve(base, asset.file), actual = await realpath(file);
    if (relative(base, actual).startsWith("..") || (await lstat(file)).isSymbolicLink()) throw Error("Unsafe bundled asset path");
    const bytes = await readFile(file);
    if (bytes.length !== asset.bytes || createHash("sha256").update(bytes).digest("hex") !== asset.sha256) throw Error("Bundled artwork integrity check failed");
  }
}
