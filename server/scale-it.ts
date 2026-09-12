import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  id,
  templateSchema,
  starterTemplates,
  type Template,
  type Avatar,
} from "../shared/schema.ts";
import { all, get, put, template, transaction, db, insertTask } from "./db.ts";
import { digest, outputRoot, safeName } from "./files.ts";
import { selectRecipe, recipeHash } from "./planner.ts";
import { tasks } from "./db.ts";
import type { Media, Task } from "../shared/schema.ts";
import { Conflict } from "./queue.ts";
import path from "node:path";
const oldModel = z.object({
  id,
  name: z.string().min(1).max(100),
  kind: z.literal("video"),
  duration: z.number().positive().max(600),
  music: z.string().max(3000),
  cta: z.string().max(3000),
  slots: z
    .array(
      z.object({
        label: z.string().min(1).max(80),
        category: z.enum(["before", "after", "any", "carousel"]),
        duration: z.number().positive().max(600),
      }),
    )
    .min(1)
    .max(35),
});
export const envelopeSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  run: z.object({
    id,
    kind: z.literal("video"),
    modelId: id,
    modelName: z.string(),
    modelSnapshot: oldModel,
    items: z
      .array(
        z.object({
          id,
          avatarId: id,
          avatarName: z.string(),
          status: z.enum(["awaiting_studio", "ready", "simulated"]),
          outputIds: z.array(z.string()),
          posts: z.array(z.unknown()).max(2),
        }),
      )
      .min(1)
      .max(100),
    paused: z.boolean(),
    demo: z.boolean(),
  }),
  model: oldModel,
  avatars: z
    .array(
      z
        .object({
          id,
          name: z.string(),
          language: z.string().optional(),
          folder: z.string().optional(),
        })
        .passthrough(),
    )
    .max(500),
  media: z.array(z.unknown()).max(5000),
  note: z.string().optional(),
});
export function normalizeEnvelope(value: unknown) {
  const e = envelopeSchema.parse(value);
  if (
    e.run.modelSnapshot.id !== e.run.modelId ||
    digest(e.model) !== digest(e.run.modelSnapshot)
  )
    throw new Error("Les deux copies du modèle Scale It ne correspondent pas.");
  if (new Set(e.run.items.map((i) => i.id)).size !== e.run.items.length)
    throw new Error("Identifiants d’items dupliqués.");
  const model = e.run.modelSnapshot;
  const summed = model.slots.reduce(
    (s, x) => s + Math.round(x.duration * 30),
    0,
  );
  if (Math.abs(summed - Math.round(model.duration * 30)) > 1)
    throw new Error(
      "La somme des plans Scale It ne correspond pas à la durée annoncée. Corrigez les consignes.",
    );
  const avatars = [...new Map(e.avatars.map((a) => [a.id, a])).values()];
  for (const item of e.run.items)
    if (!avatars.some((a) => a.id === item.avatarId))
      avatars.push({ id: item.avatarId, name: item.avatarName });
  const base = starterTemplates()[0];
  const proposal = templateSchema.parse({
    ...base,
    id: "scale-" + randomUUID(),
    name: model.name,
    version: 1,
    music: null,
    texts: [],
    markers: [],
    slots: model.slots.map((s, i) => ({
      id: `plan-${i + 1}`,
      label: s.label,
      role: s.category === "carousel" ? "image" : s.category,
      frames: Math.round(s.duration * 30),
      selection: s.category === "carousel" ? "manual" : "auto",
      transition: { type: "cut", frames: 0 },
    })),
  });
  const issues = [
    "Associez et vérifiez un modèle local enrichi avant la mise en file.",
    "Associez chaque avatar à ses dossiers locaux.",
  ];
  if (model.music)
    issues.push(
      `Musique à résoudre : « ${model.music} » est une indication, pas un fichier audio.`,
    );
  if (model.cta) issues.push(`CTA à placer dans l’éditeur : « ${model.cta} ».`);
  if (model.slots.some((s) => s.category === "carousel"))
    issues.push(
      "Les plans carrousel exigent une image explicitement verrouillée.",
    );
  if (e.media.length)
    issues.push(
      "Les URL de médias ne sont pas téléchargées : associez les fichiers locaux.",
    );
  if (e.run.paused || e.run.demo)
    issues.push(
      "Lot en pause ou démonstration : une action explicite est requise pour produire.",
    );
  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    envelope: { ...e, avatars },
    proposal,
    issues,
  };
}
export function importEnvelope(value: unknown) {
  const result = normalizeEnvelope(value);
  put("scaleImports", result);
  return result;
}
export async function enqueueImport(
  importId: string,
  options: {
    templateId: string;
    avatarMap: Record<string, string>;
    confirmProduction: boolean;
    seed: string;
    exportRootId: string;
    demo: boolean;
  },
  key: string,
) {
  const record = get<ReturnType<typeof normalizeEnvelope>>(
    "scaleImports",
    importId,
  );
  if (!record) throw new Error("Import introuvable.");
  if (!options.confirmProduction)
    throw new Error(
      "Vérifiez le modèle et les ressources, puis confirmez explicitement la génération.",
    );
  if (!key || key.length > 150) throw new Error("Clé d’idempotence requise.");
  const hash = digest({ importId, options });
  const cached = db
    .prepare("SELECT * FROM requests WHERE key=?")
    .get(key) as any;
  if (cached) {
    if (cached.inputHash !== hash)
      throw new Conflict("Clé d’idempotence en conflit.");
    return JSON.parse(cached.response);
  }
  const root = await outputRoot(options.exportRootId);
  const t = template(options.templateId);
  if (!t) throw new Error("Associez un modèle local.");
  return transaction(() => {
    const existing = db
      .prepare("SELECT * FROM requests WHERE key=?")
      .get(key) as any;
    if (existing) {
      if (existing.inputHash !== hash)
        throw new Conflict("Clé d’idempotence en conflit.");
      return JSON.parse(existing.response);
    }
    const reserved = new Set(tasks().map((t) => t.recipeHash));
    const batchId = randomUUID(),
      now = new Date().toISOString();
    const batch = {
      id: batchId,
      name: `Scale It · ${record.envelope.run.modelName}`,
      createdAt: now,
      input: { exportRootId: options.exportRootId },
      taskIds: [] as string[],
      externalRunId: record.envelope.run.id,
    };
    for (const item of record.envelope.run.items) {
      const a = get<Avatar>("avatars", options.avatarMap[item.avatarId]);
      if (!a) throw new Error(`Associez l’avatar ${item.avatarName}.`);
      const r = selectRecipe({
        avatar: a,
        template: t,
        media: all<Media>("media"),
        seed: options.seed + ":" + item.id,
        profile: "final",
        demo: options.demo,
        reserved,
        externalRunId: record.envelope.run.id,
        externalItemId: item.id,
      });
      reserved.add(recipeHash(r));
      const id = randomUUID();
      const task: Task = {
        id,
        batchId,
        recipeHash: recipeHash(r),
        recipe: r,
        status: "queued",
        progress: 0,
        phase: "En attente",
        attempts: 0,
        error: "",
        outputDir: path.join(
          root,
          `scale-${safeName(record.envelope.run.id)}-${batchId.slice(0, 8)}`,
          `${safeName(a.name)}-${a.id.slice(0, 8)}`,
          id,
        ),
        createdAt: now,
        updatedAt: now,
      };
      insertTask(task);
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
