import path from "path";

// A file outside the content-hashed directories keeps its name across builds, so the browser
// must revalidate it to pick up an upgrade.
export function cacheControlFor(root: string, filePath: string, hashedDirs: readonly string[]): string {
  const relativePath = path.relative(root, filePath).split(path.sep).join("/");
  return hashedDirs.some((dir) => relativePath.startsWith(dir + "/"))
    ? "public, max-age=31536000, immutable"
    : "no-cache";
}
