import path from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, realpath } from "node:fs/promises";
import {
  all,
  db,
  get,
  put,
  tasks,
  task,
  insertTask,
  updateTask,
  template,
  transaction,
  setting,
} from "./db.ts";
import {
  batchSchema,
  type Avatar,
  type Media,
  type Recipe,
  type Task,
  type BatchInput,
} from "../shared/schema.ts";
import { selectRecipe, recipeHash } from "./planner.ts";
import {
  digest,
  outputRoot,
  safeName,
  within,
  safeOutputParent,
} from "./files.ts";
import { render, recoverOutput } from "./engine.ts";
export class Conflict extends Error {
  status = 409;
}
export function planBatch(input: BatchInput) {
  const parsed = batchSchema.parse(input);
  const media = all<Media>("media");
  const existing = tasks();
  const reserved = new Set(existing.map((t) => t.recipeHash));
  const usage = new Map<string, number>();
  for (const t of existing)
    if (!["cancelled", "failed"].includes(t.status))
      for (const c of t.recipe.clips)
        usage.set(c.media.hash, (usage.get(c.media.hash) ?? 0) + 1);
  const recipes: Recipe[] = [];
  const errors: string[] = [];
  for (const aid of parsed.avatarIds)
    for (const tid of parsed.templateIds)
      for (let i = 0; i < parsed.count; i++) {
        try {
          const a = get<Avatar>("avatars", aid),
            t = template(tid);
          if (!a || !t) throw new Error("Avatar ou modèle introuvable.");
          const r = selectRecipe({
            avatar: a,
            template: t,
            media,
            seed: `${parsed.seed}:${aid}:${tid}:${i}`,
            profile: parsed.profile,
            language: parsed.language,
            demo: parsed.demo,
            reserved,
            usage,
            externalRunId: parsed.externalRunId,
            externalItemId: parsed.externalItems[`${aid}:${tid}:${i}`] || "",
          });
          reserved.add(recipeHash(r));
          recipes.push(r);
          for (const c of r.clips)
            usage.set(c.media.hash, (usage.get(c.media.hash) ?? 0) + 1);
        } catch (e) {
          errors.push(e instanceof Error ? e.message : String(e));
        }
      }
  return {
    recipes,
    errors,
    total: parsed.avatarIds.length * parsed.templateIds.length * parsed.count,
    available: recipes.length,
  };
}
export async function enqueueBatch(input: BatchInput, key: string) {
  const parsed = batchSchema.parse(input);
  if (!key || key.length > 150)
    throw new Error("Clé d’idempotence requise (1–150 caractères).");
  const hash = digest(parsed);
  const cached = db
    .prepare("SELECT inputHash,response FROM requests WHERE key=?")
    .get(key) as any;
  if (cached) {
    if (cached.inputHash !== hash)
      throw new Conflict(
        "Cette clé d’idempotence existe avec des consignes différentes.",
      );
    return JSON.parse(cached.response);
  }
  const root = await outputRoot(parsed.exportRootId);
  return transaction(() => {
    const second = db
      .prepare("SELECT inputHash,response FROM requests WHERE key=?")
      .get(key) as any;
    if (second) {
      if (second.inputHash !== hash)
        throw new Conflict("Clé d’idempotence en conflit.");
      return JSON.parse(second.response);
    }
    const plan = planBatch(parsed);
    if (plan.errors.length) throw new Conflict(plan.errors.join("\n"));
    const batchId = randomUUID();
    const now = new Date().toISOString();
    const batch = {
      id: batchId,
      name: parsed.name,
      createdAt: now,
      input: parsed,
      taskIds: [] as string[],
    };
    for (const recipe of plan.recipes) {
      const id = randomUUID();
      const t: Task = {
        id,
        batchId,
        recipeHash: recipeHash(recipe),
        recipe,
        status: "queued",
        progress: 0,
        phase: "En attente",
        attempts: 0,
        error: "",
        outputDir: path.join(
          root,
          `${safeName(parsed.name)}-${batchId.slice(0, 8)}`,
          `${safeName(recipe.avatar.name)}-${recipe.avatar.id.slice(0, 8)}`,
          `${safeName(recipe.template.name)}-${id}`,
        ),
        createdAt: now,
        updatedAt: now,
      };
      insertTask(t);
      batch.taskIds.push(id);
    }
    put("batches", batch);
    db.prepare("INSERT INTO requests VALUES(?,?,?)").run(
      key,
      hash,
      JSON.stringify(batch),
    );
    return batch;
  });
}
export class Queue {
  active = new Map<string, AbortController>();
  timer?: ReturnType<typeof setInterval>;
  stopping = false;
  async start() {
    for (const t of tasks())
      if (["preparing", "rendering", "validating"].includes(t.status))
        updateTask(t.id, {
          status: "interrupted",
          phase: "Service interrompu — relance depuis le début",
          error: "Le service a été arrêté pendant le travail.",
        });
    this.timer = setInterval(() => void this.tick(), 500);
    await this.tick();
  }
  async tick() {
    if (this.stopping || setting("paused", false)) return;
    for (const t of tasks().reverse()) {
      if (this.active.size >= setting("concurrency", 1)) break;
      if (t.status === "queued" && !this.active.has(t.id)) {
        const controller = new AbortController();
        this.active.set(t.id, controller);
        void this.execute(t, controller);
      }
    }
  }
  async execute(t: Task, controller: AbortController) {
    try {
      updateTask(t.id, {
        status: "preparing",
        phase: "Vérification des fichiers",
        attempts: t.attempts + 1,
        error: "",
      });
      const batch = get<any>("batches", t.batchId);
      const root = await outputRoot(batch.input.exportRootId);
      if (!within(t.outputDir, root))
        throw new Error("Destination hors du dossier autorisé.");
      await safeOutputParent(t.outputDir);
      const parent = await realpath(path.dirname(t.outputDir));
      if (!within(parent, root))
        throw new Error("Lien symbolique sortant dans le dossier d’export.");
      const existing = await recoverOutput(t.outputDir, t.recipe, t.id);
      if (existing) {
        updateTask(t.id, {
          status: "completed",
          progress: 100,
          phase: "Export validé retrouvé",
          result: existing,
        });
        return;
      }
      const result = await render(t.recipe, t.outputDir, t.id, {
        signal: controller.signal,
        onProgress: (p, phase) => {
          if (!controller.signal.aborted)
            updateTask(t.id, { status: "rendering", progress: p, phase });
        },
        onValidate: () => {
          if (!controller.signal.aborted)
            updateTask(t.id, {
              status: "validating",
              progress: 99,
              phase: "Contrôle du décodage et des pistes",
            });
        },
      });
      updateTask(t.id, {
        status: "completed",
        progress: 100,
        phase: "Export contrôlé",
        result,
      });
    } catch (e) {
      updateTask(t.id, {
        status: this.stopping
          ? "interrupted"
          : controller.signal.aborted
            ? "cancelled"
            : "failed",
        phase: this.stopping
          ? "Interrompu"
          : controller.signal.aborted
            ? "Annulé"
            : "Échec",
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      this.active.delete(t.id);
    }
  }
  cancel(id: string) {
    const t = task(id);
    if (!t) throw new Error("Tâche introuvable.");
    if (t.status === "completed")
      throw new Conflict("Un export terminé ne peut pas être annulé.");
    this.active.get(id)?.abort();
    if (!this.active.has(id))
      updateTask(id, { status: "cancelled", phase: "Annulé", error: "" });
  }
  retry(id: string) {
    const t = task(id);
    if (!t) throw new Error("Tâche introuvable.");
    if (
      !["failed", "interrupted", "cancelled"].includes(t.status) ||
      this.active.has(id)
    )
      throw new Conflict("Cette tâche ne peut pas être relancée maintenant.");
    if (t.attempts >= 3)
      throw new Conflict(
        "Limite de 3 tentatives atteinte. Consultez le journal et créez un nouveau lot corrigé.",
      );
    return updateTask(id, {
      status: "queued",
      phase: "Relance depuis le début",
      progress: 0,
      error: "",
    });
  }
  async stop() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    for (const c of this.active.values()) c.abort();
    while (this.active.size) await new Promise((r) => setTimeout(r, 100));
  }
}
export async function enqueuePreview(
  avatarId: string,
  templateId: string,
  seed: string,
) {
  const avatar = get<Avatar>("avatars", avatarId),
    t = template(templateId);
  if (!avatar || !t)
    throw new Error("Choisissez un avatar et enregistrez le modèle.");
  const recipe = selectRecipe({
    avatar,
    template: t,
    media: all<Media>("media"),
    seed,
    profile: "preview",
    demo: avatar.demo,
  });
  const hash = recipeHash(recipe);
  const existing = tasks().find((t) => t.recipeHash === hash);
  if (existing) return existing;
  const root = await outputRoot("default");
  return transaction(() => {
    const again = tasks().find((t) => t.recipeHash === hash);
    if (again) return again;
    const id = randomUUID(),
      batchId = randomUUID(),
      now = new Date().toISOString();
    const task: Task = {
      id,
      batchId,
      recipeHash: hash,
      recipe,
      status: "queued",
      progress: 0,
      phase: "En attente",
      attempts: 0,
      error: "",
      outputDir: path.join(root, "apercus", safeName(avatar.name), id),
      createdAt: now,
      updatedAt: now,
    };
    put("batches", {
      id: batchId,
      name: "Aperçu · " + t.name,
      input: { exportRootId: "default" },
      taskIds: [id],
      createdAt: now,
    });
    insertTask(task);
    return task;
  });
}
