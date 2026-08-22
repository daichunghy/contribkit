/** Convert a glob with `*` / `**` / `?` to a regex matching the whole path. */
export function globToRegExp(glob: string): RegExp {
  let i = 0;
  let out = "^";
  while (i < glob.length) {
    const rest = glob.slice(i);
    if (rest.startsWith("**/")) {
      out += "(?:.*/)?";
      i += 3;
      continue;
    }
    if (rest.startsWith("**")) {
      out += ".*";
      i += 2;
      continue;
    }
    const ch = glob[i];
    if (ch === undefined) break;
    if (ch === "*") {
      out += "[^/]*";
      i += 1;
      continue;
    }
    if (ch === "?") {
      out += "[^/]";
      i += 1;
      continue;
    }
    if (".$^+{}()|[]\\".includes(ch)) {
      out += `\\${ch}`;
    } else {
      out += ch;
    }
    i += 1;
  }
  out += "$";
  return new RegExp(out);
}

function posix(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\//, "");
}

/** Repo-root glob (ignorePaths, forbidden paths). */
export function matchGlob(pattern: string, filePath: string): boolean {
  const file = posix(filePath);
  let pat = pattern.replace(/\\/g, "/");
  if (pat.startsWith("/")) pat = pat.slice(1);
  return globToRegExp(pat).test(file);
}

/**
 * GitHub CODEOWNERS subset: leading `/` anchors at repo root; a pattern
 * without `/` matches in any directory; trailing `/` is a directory prefix.
 */
export function matchCodeownersPattern(pattern: string, filePath: string): boolean {
  const file = posix(filePath);
  let pat = pattern.replace(/\\/g, "/");
  const anchored = pat.startsWith("/");
  if (anchored) pat = pat.slice(1);
  const directory = pat.endsWith("/");
  if (directory) {
    const prefix = pat;
    if (anchored || pat.includes("/")) {
      return file === pat.slice(0, -1) || file.startsWith(prefix);
    }
    return file.startsWith(prefix) || file.includes(`/${prefix}`);
  }
  if (pat === "*") return true;
  const regex = globToRegExp(pat);
  if (anchored || pat.includes("/")) {
    return regex.test(file);
  }
  const base = file.split("/").pop() ?? file;
  return regex.test(file) || regex.test(base);
}

export function pathIgnored(path: string, ignore: readonly string[] | undefined): boolean {
  if (!ignore || ignore.length === 0) return false;
  return ignore.some((glob) => matchGlob(glob, path));
}
