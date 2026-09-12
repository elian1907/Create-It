import express from "express";
import multer from "multer";
import { z } from "zod";
import path from "node:path";
import { randomUUID, timingSafeEqual } from "node:crypto";
import {
  mkdir,
  rename,
  rm,
  readFile,
  writeFile,
  realpath,
} from "node:fs/promises";
import {
  API_TOKEN,
  DATA,
  PROJECT,
  all,
  get,
  put,
  tasks,
  task,
  templates,
  template,
  saveTemplate,
  setting,
  setSetting,
  db,
  transaction,
} from "./db.ts";
import {
  avatarSchema,
  mediaSchema,
  templateSchema,
  batchSchema,
  roleSchema,
  type Avatar,
  type Media,
} from "../shared/schema.ts";
import {
  directory,
  checkedFile,
  mediaFile,
  outputRoot,
  within,
  safeName,
  digest,
} from "./files.ts";
import { indexAvatar, indexOne, waveform } from "./media.ts";
import { diagnostics, run } from "./process.ts";
import { Queue, planBatch, enqueueBatch, enqueuePreview } from "./queue.ts";
import { checkTexts, textImage } from "./text.ts";
import { validateRecipeShape, selectRecipe } from "./planner.ts";
import { verifySources } from "./engine.ts";
import { importEnvelope, enqueueImport } from "./scale-it.ts";
const upload = multer({
  dest: path.join(DATA, "tmp"),
  limits: { fileSize: 512 * 1024 * 1024, files: 30 },
});
const safeEqual = (a: string, b: string) =>
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
export function createApp(queue: Queue, port: number) {
  const app = express();
  app.disable("x-powered-by");
  const origins = new Set([
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
  ]);
  app.use((req, res, next) => {
    if (!origins.has(`http://${req.headers.host}`))
      return res.status(403).json({ error: "Hôte local non autorisé." });
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cross-Origin-Resource-Policy": "same-origin",
      "X-Frame-Options": "DENY",
    });
    if (req.path.startsWith("/api")) res.set("Cache-Control", "no-store");
    next();
  });
  app.use("/api", (req, res, next) => {
    const origin = req.headers.origin;
    const site = req.headers["sec-fetch-site"];
    if ((origin && !origins.has(origin)) || site === "cross-site")
      return res.status(403).json({ error: "Origine non autorisée." });
    const bearer = req.headers.authorization?.replace(/^Bearer /, "");
    const authorized = !!bearer && safeEqual(bearer, API_TOKEN);
    if (req.path === "/session" && req.method === "POST") {
      if (
        req.headers["x-studio-client"] !== "1" ||
        (!origin && site !== "same-origin" && !authorized)
      )
        return res
          .status(403)
          .json({ error: "Session à ouvrir depuis Create It." });
      res.cookie("studio_session", API_TOKEN, {
        httpOnly: true,
        sameSite: "strict",
        path: "/",
        maxAge: 30 * 24 * 3600000,
      });
      return res.json({ ok: true });
    }
    const cookie =
      req.headers.cookie
        ?.split(";")
        .map((s) => s.trim())
        .find((s) => s.startsWith("studio_session="))
        ?.slice(15) || "";
    if (!authorized && !safeEqual(cookie, API_TOKEN))
      return res.status(401).json({
        error: "Ouvrez Create It pour établir la session locale.",
      });
    if (
      !authorized &&
      !["GET", "HEAD"].includes(req.method) &&
      req.headers["x-studio-client"] !== "1"
    )
      return res.status(403).json({ error: "En-tête de protection manquant." });
    next();
  });
  app.use(express.json({ limit: "8mb" }));
  app.get("/api/state", (_req, res) =>
    res.json({
      avatars: all<Avatar>("avatars"),
      media: all<Media>("media").filter((m) => !m.excludedFromIndex),
      templates: templates(),
      tasks: tasks(),
      batches: all("batches"),
      imports: all("scaleImports"),
      settings: {
        paused: setting("paused", false),
        concurrency: setting("concurrency", 1),
        exportRoots: setting("exportRoots", []),
        musicRoots: setting("musicRoots", []),
      },
    }),
  );
  app.get("/api/diagnostics", async (_req, res) =>
    res.json(await diagnostics(true)),
  );
  app.post("/api/avatars", async (req, res) => {
    const a = avatarSchema.parse({
      ...req.body,
      id: req.body.id || randomUUID(),
    });
    for (const role of ["before", "after", "neutral"] as const)
      if (a.folders[role]) a.folders[role] = await directory(a.folders[role]);
    put("avatars", a);
    res.json(a);
  });
  app.post("/api/avatars/:id/index", async (req, res) =>
    res.json(await indexAvatar(req.params.id)),
  );
  app.post("/api/pick-folder", async (_req, res) => {
    if (process.platform === "darwin") {
      const r = await run("osascript", [
        "-e",
        'POSIX path of (choose folder with prompt "Choisir un dossier de médias pour Create It")',
      ]);
      return res.json({ path: r.stdout.trim() });
    }
    if (process.platform === "win32") {
      const r = await run("powershell.exe", [
        "-NoProfile",
        "-STA",
        "-Command",
        'Add-Type -AssemblyName System.Windows.Forms; $dialog = New-Object System.Windows.Forms.FolderBrowserDialog; if ($dialog.ShowDialog() -eq "OK") { [Console]::Write($dialog.SelectedPath) }',
      ]);
      return res.json({ path: r.stdout.trim() });
    }
    res.status(501).json({
      error: "Sélecteur natif indisponible. Saisissez un chemin absolu.",
    });
  });
  app.post("/api/media/path", async (req, res) => {
    const v = z
      .object({
        path: z.string(),
        avatarId: z.string(),
        role: z.enum(["before", "after", "neutral", "music"]),
      })
      .parse(req.body);
    res.json(await indexOne(v.path, v.avatarId, v.role));
  });
  app.post("/api/media/import", upload.array("files", 30), async (req, res) => {
    const files = req.files as Express.Multer.File[];
    try {
      const role = z
        .enum(["before", "after", "neutral", "music"])
        .parse(req.body.role);
      const aid = z
        .string()
        .max(120)
        .parse(req.body.avatarId || "");
      if (role !== "music" && !get("avatars", aid))
        throw new Error("Choisissez un avatar.");
      const target = path.join(
        DATA,
        "imports",
        role === "music" ? "musique" : safeName(aid),
        role,
      );
      await mkdir(target, { recursive: true });
      if (
        !within(
          await realpath(target),
          await realpath(path.join(DATA, "imports")),
        )
      )
        throw new Error("Dossier d’import non autorisé.");
      const results = [];
      const errors = [];
      for (const f of files) {
        const destination = path.join(
          target,
          randomUUID() +
            "-" +
            safeName(path.parse(f.originalname).name) +
            path.extname(f.originalname).toLowerCase(),
        );
        try {
          await rename(f.path, destination);
          results.push(
            await indexOne(destination, role === "music" ? "" : aid, role),
          );
        } catch (e) {
          await rm(destination, { force: true });
          errors.push({ name: f.originalname, error: String(e) });
        }
      }
      res.json({ media: results, errors });
    } finally {
      await Promise.all((files || []).map((f) => rm(f.path, { force: true })));
    }
  });
  app.patch("/api/media/:id", async (req, res) => {
    const old = get<Media>("media", req.params.id);
    if (!old) throw new Error("Média introuvable.");
    const patch = mediaSchema
      .pick({
        role: true,
        tags: true,
        pairId: true,
        variantGroupId: true,
        inPoint: true,
        outPoint: true,
        enabled: true,
        crop: true,
      })
      .partial()
      .parse(req.body);
    const m = mediaSchema.parse({ ...old, ...patch });
    if (
      (m.role === "music" && m.kind !== "audio") ||
      (m.kind === "audio" && m.role !== "music")
    )
      throw new Error("Classement incompatible avec le type de fichier.");
    if (
      m.kind !== "image" &&
      (m.inPoint >= m.duration ||
        (m.outPoint !== null &&
          (m.outPoint <= m.inPoint || m.outPoint > m.duration)))
    )
      throw new Error("Points d’entrée/sortie invalides.");
    put("media", m);
    res.json(m);
  });
  app.delete("/api/media/:id", (req, res) => {
    const m = get<Media>("media", req.params.id);
    if (!m) throw new Error("Média introuvable.");
    put("media", { ...m, enabled: false, excludedFromIndex: true });
    res.json({ ok: true, originalUnchanged: true });
  });
  app.get("/api/media/:id/file", async (req, res) => {
    const m = get<Media>("media", req.params.id);
    if (!m) throw new Error("Média introuvable.");
    res.sendFile(await mediaFile(m.path));
  });
  app.get("/api/media/:id/thumbnail", async (req, res) => {
    const m = get<Media>("media", req.params.id);
    if (!m?.thumbnail) return res.sendStatus(404);
    res.sendFile(await checkedFile(m.thumbnail, [path.join(DATA, "cache")]));
  });
  app.get("/api/media/:id/waveform", async (req, res) => {
    const m = get<Media>("media", req.params.id);
    if (!m) throw new Error("Média introuvable.");
    res.json(await waveform(m));
  });
  app.post("/api/selection", (req, res) => {
    const t = templateSchema.parse(req.body.template);
    const avatar = get<Avatar>("avatars", z.string().parse(req.body.avatarId));
    if (!avatar) throw new Error("Choisissez un avatar.");
    res.json(
      selectRecipe({
        avatar,
        template: t,
        media: all<Media>("media"),
        seed: z.string().parse(req.body.seed),
        profile: "preview",
      }),
    );
  });
  app.post("/api/previews", async (req, res) => {
    const v = z
      .object({
        avatarId: z.string(),
        templateId: z.string(),
        seed: z.string(),
      })
      .parse(req.body);
    res.json(await enqueuePreview(v.avatarId, v.templateId, v.seed));
  });
  app.post("/api/templates", (req, res) => {
    const t = templateSchema.parse(req.body);
    res.json(saveTemplate(t));
  });
  app.get("/api/templates/:id/versions", (req, res) =>
    res.json(
      (
        db
          .prepare(
            "SELECT json FROM templates WHERE id=? ORDER BY version DESC",
          )
          .all(req.params.id) as any[]
      ).map((x) => JSON.parse(x.json)),
    ),
  );
  app.post("/api/templates/check", (req, res) => {
    const t = templateSchema.parse(req.body);
    res.json({ errors: checkTexts(t) });
  });
  app.post("/api/text-preview", (req, res) => {
    const t = templateSchema.parse(req.body);
    res.type("image/png").send(textImage(t.texts[0], t).png);
  });
  app.post("/api/batches/plan", (req, res) => {
    const p = planBatch(batchSchema.parse(req.body));
    res.json({ ...p, recipes: undefined });
  });
  app.post("/api/batches", async (req, res) =>
    res
      .status(201)
      .json(
        await enqueueBatch(
          batchSchema.parse(req.body),
          String(req.headers["idempotency-key"] || ""),
        ),
      ),
  );
  app.post("/api/tasks", async (req, res) => {
    const v = z
      .object({
        avatarId: z.string(),
        templateId: z.string(),
        seed: z.string(),
        profile: z.enum(["preview", "final"]).default("final"),
        demo: z.boolean().default(false),
      })
      .parse(req.body);
    const b = await enqueueBatch(
      batchSchema.parse({
        name: "Tâche API",
        avatarIds: [v.avatarId],
        templateIds: [v.templateId],
        count: 1,
        seed: v.seed,
        profile: v.profile,
        demo: v.demo,
      }),
      String(req.headers["idempotency-key"] || ""),
    );
    res.status(201).json(task(b.taskIds[0]));
  });
  app.get("/api/tasks/:id", (req, res) => {
    const t = task(req.params.id);
    if (!t) return res.sendStatus(404);
    res.json(t);
  });
  app.post("/api/tasks/:id/cancel", (req, res) => {
    queue.cancel(req.params.id);
    res.json(task(req.params.id));
  });
  app.post("/api/tasks/:id/retry", (req, res) =>
    res.json(queue.retry(req.params.id)),
  );
  app.get("/api/tasks/:id/result", (req, res) => {
    const t = task(req.params.id);
    if (t?.status !== "completed")
      return res
        .status(409)
        .json({ error: "Export non terminé.", status: t?.status });
    res.json(t.result);
  });
  app.get("/api/tasks/:id/recipe", (req, res) => {
    const t = task(req.params.id);
    if (!t) return res.sendStatus(404);
    res.json(t.recipe);
  });
  app.get("/api/tasks/:id/:asset", async (req, res) => {
    const t = task(req.params.id);
    if (!t) return res.sendStatus(404);
    const names: Record<string, string> = {
      video: "video.mp4",
      thumbnail: "thumbnail.jpg",
      log: "render.log",
    };
    const name = names[req.params.asset];
    if (!name) return res.sendStatus(404);
    const roots = setting<{ path: string }[]>("exportRoots", []).map(
      (r) => r.path,
    );
    if (t.status !== "completed") {
      if (name !== "render.log") return res.sendStatus(409);
      const errorFile = t.outputDir + ".error.log";
      try {
        return res
          .type("text/plain")
          .send(await readFile(await checkedFile(errorFile, roots), "utf8"));
      } catch {
        return res
          .type("text/plain")
          .send(t.error || "Journal disponible à la fin du rendu.");
      }
    }
    res.sendFile(await checkedFile(path.join(t.outputDir, name), roots));
  });
  app.post("/api/tasks/:id/open-folder", async (req, res) => {
    const t = task(req.params.id);
    if (t?.status !== "completed") throw new Error("Export non terminé.");
    await checkedFile(
      path.join(t.outputDir, "video.mp4"),
      setting<{ path: string }[]>("exportRoots", []).map((r) => r.path),
    );
    if (process.platform === "darwin") await run("open", [t.outputDir]);
    else if (process.platform === "win32")
      await run("explorer.exe", [t.outputDir]);
    else await run("xdg-open", [t.outputDir]);
    res.json({ ok: true });
  });
  app.get("/api/results", (_req, res) =>
    res.json({
      version: 1,
      exportedAt: new Date().toISOString(),
      results: tasks().map(
        (t) =>
          t.result || {
            taskId: t.id,
            externalRunId: t.recipe.externalRunId,
            externalItemId: t.recipe.externalItemId,
            avatar: t.recipe.avatar,
            template: {
              id: t.recipe.template.id,
              version: t.recipe.template.version,
            },
            status: t.status,
            error: t.error,
          },
      ),
    }),
  );
  app.post("/api/recipes/validate", async (req, res) => {
    const r = validateRecipeShape(req.body);
    await verifySources(r);
    res.json({ valid: true });
  });
  app.post("/api/settings", async (req, res) => {
    const s = z
      .object({
        paused: z.boolean().optional(),
        concurrency: z.number().int().min(1).max(3).optional(),
        musicRoot: z.string().optional(),
        exportRoot: z
          .object({ name: z.string().min(1), path: z.string() })
          .optional(),
      })
      .parse(req.body);
    if (s.paused !== undefined) setSetting("paused", s.paused);
    if (s.concurrency !== undefined) setSetting("concurrency", s.concurrency);
    if (s.musicRoot) {
      const p = await directory(s.musicRoot);
      setSetting("musicRoots", [
        ...new Set([...setting<string[]>("musicRoots", []), p]),
      ]);
    }
    if (s.exportRoot) {
      const p = await directory(s.exportRoot.path);
      const roots = setting<any[]>("exportRoots", []);
      if (!roots.some((r) => r.path === p))
        setSetting("exportRoots", [
          ...roots,
          { id: randomUUID(), name: s.exportRoot.name, path: p },
        ]);
    }
    res.json({ ok: true });
  });
  app.get("/api/backup", (_req, res) =>
    res.json({
      version: 1,
      exportedAt: new Date().toISOString(),
      templates: (db.prepare("SELECT json FROM templates").all() as any[]).map(
        (r) => JSON.parse(r.json),
      ),
      avatars: all("avatars"),
      settings: all("settings").filter((s: any) =>
        ["exportRoots", "musicRoots", "concurrency"].includes(s.id),
      ),
    }),
  );
  app.post("/api/backup/restore", async (req, res) => {
    const b = z
      .object({
        version: z.literal(1),
        templates: z.array(templateSchema),
        avatars: z.array(avatarSchema),
        settings: z.array(z.object({ id: z.string(), value: z.unknown() })),
      })
      .parse(req.body);
    for (const a of b.avatars)
      for (const p of Object.values(a.folders)) if (p) await directory(p);
    const music = b.settings.find((s) => s.id === "musicRoots")?.value;
    if (music)
      for (const p of z.array(z.string()).parse(music)) await directory(p);
    const exports = b.settings.find((s) => s.id === "exportRoots")?.value;
    if (exports)
      for (const r of z
        .array(z.object({ id: z.string(), name: z.string(), path: z.string() }))
        .parse(exports))
        await directory(r.path);
    transaction(() => {
      for (const a of b.avatars) put("avatars", a);
      for (const t of b.templates) saveTemplate(t);
      if (music) setSetting("musicRoots", music);
      if (exports) {
        const combined = [
          ...setting<any[]>("exportRoots", []),
          ...(exports as any[]),
        ];
        setSetting("exportRoots", [
          ...new Map(combined.map((r) => [r.id, r])).values(),
        ]);
      }
    });
    res.json({ ok: true });
  });
  app.post("/api/scale-it/import", (req, res) =>
    res.json(importEnvelope(req.body)),
  );
  app.post("/api/scale-it/:id/enqueue", async (req, res) => {
    const v = z
      .object({
        templateId: z.string(),
        avatarMap: z.record(z.string(), z.string()),
        confirmProduction: z.boolean(),
        seed: z.string().min(1),
        exportRootId: z.string().default("default"),
        demo: z.boolean().default(false),
      })
      .parse(req.body);
    res.json(
      await enqueueImport(
        req.params.id,
        v,
        String(req.headers["idempotency-key"] || ""),
      ),
    );
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Route introuvable." }),
  );
  return app;
}
export const errors: express.ErrorRequestHandler = (e, _req, res, _next) => {
  res.status(e instanceof z.ZodError ? 400 : e.status || 400).json({
    error:
      e instanceof z.ZodError
        ? e.issues.map((i) => `${i.path.join(".")} : ${i.message}`).join("\n")
        : e.message || String(e),
  });
};
