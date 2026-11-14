import path from "path";

export function cacheControlFor(root: string, filePath: string, hashedDirs: readonly string[]): string {
  const relativePath = path.relative(root, filePath).split(path.sep).join("/");
  return hashedDirs.some((dir) => relativePath.startsWith(dir + "/"))
    ? "public, max-age=31536000, immutable"
    : "no-cache";
}
