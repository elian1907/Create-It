import { realpath, stat, readdir } from "node:fs/promises";
import path from "node:path";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { all, DATA, setting } from "./db.ts";
import type { Avatar } from "../shared/schema.ts";
export function within(child: string, root: string) {
  const rel = path.relative(root, child);
  return (
    rel === "" ||
    (!rel.startsWith(".." + path.sep) && rel !== ".." && !path.isAbsolute(rel))
  );
}
export async function directory(input: string) {
  if (!path.isAbsolute(input))
    throw new Error("Indiquez un chemin absolu vers un dossier local.");
  const p = await realpath(input);
  if (!(await stat(p)).isDirectory())
    throw new Error("Ce chemin ne désigne pas un dossier.");
  const filesystemRoot = path.parse(p).root;
  if (p === filesystemRoot)
    throw new Error(
      "Choisissez un dossier de médias précis, pas la racine du disque.",
    );
  return p;
}
export function mediaRoots() {
  return [
    path.join(DATA, "imports"),
    ...all<Avatar>("avatars")
      .flatMap((a) => Object.values(a.folders))
      .filter(Boolean),
    ...setting<string[]>("musicRoots", []),
  ];
}
export async function checkedFile(input: string, roots: string[]) {
  const p = await realpath(input);
  const allowed = await Promise.all(
    roots.map((r) => realpath(r).catch(() => "")),
  );
  if (!allowed.some((r) => r && within(p, r)))
    throw new Error(
      "Chemin hors des dossiers autorisés (ou lien symbolique sortant).",
    );
  if (!(await stat(p)).isFile()) throw new Error("Fichier introuvable.");
  return p;
}
export async function mediaFile(input: string) {
  return checkedFile(input, mediaRoots());
}
export async function outputRoot(id: string) {
  const r = setting<{ id: string; path: string }[]>("exportRoots", []).find(
    (r) => r.id === id,
  );
  if (!r) throw new Error("Dossier d’export inconnu.");
  return directory(r.path);
}
export async function walk(root: string) {
  const result: string[] = [];
  async function visit(dir: string) {
    for (const ent of await readdir(dir, { withFileTypes: true })) {
      if (ent.name.startsWith(".")) continue;
      const p = path.join(dir, ent.name);
      if (ent.isSymbolicLink()) continue;
      if (ent.isDirectory()) await visit(p);
      else if (ent.isFile()) result.push(p);
      if (result.length > 50000)
        throw new Error(
          "Dossier trop volumineux : choisissez un sous-dossier.",
        );
    }
  }
  await visit(root);
  return result.sort();
}
export async function fingerprint(file: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
export function safeName(s: string) {
  return (
    s
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70) || "video"
  );
}
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (v && typeof v === "object")
    return (
      "{" +
      Object.keys(v)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + canonical((v as any)[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(v);
}
export const digest = (v: unknown) =>
  createHash("sha256").update(canonical(v)).digest("hex");
/** Create one directory at a time, checking every existing parent before descending. */
export async function safeOutputParent(destination: string) {
  const { mkdir, lstat } = await import("node:fs/promises");
  const roots = setting<{ path: string }[]>("exportRoots", []);
  let root = "";
  for (const r of roots) {
    const p = await realpath(r.path).catch(() => "");
    if (p && within(destination, p)) {
      root = p;
      break;
    }
  }
  if (!root || destination === root)
    throw new Error("Destination hors des dossiers d’export autorisés.");
  const relative = path.relative(root, path.dirname(destination));
  let cursor = root;
  for (const component of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, component);
    try {
      const s = await lstat(cursor);
      if (s.isSymbolicLink() || !s.isDirectory())
        throw new Error(
          "Parent d’export non autorisé (lien symbolique ou fichier).",
        );
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
      await mkdir(cursor, { mode: 0o700 });
    }
    if (!within(await realpath(cursor), root))
      throw new Error("Parent hors périmètre.");
  }
  try {
    if ((await lstat(destination)).isSymbolicLink())
      throw new Error("Sortie symbolique interdite.");
  } catch (e: any) {
    if (e.code !== "ENOENT") throw e;
  }
  return root;
}
