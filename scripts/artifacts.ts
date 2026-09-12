import path from "node:path";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { DATA, PROJECT, templates, tasks, get } from "../server/db.ts";
import { run, FFMPEG } from "../server/process.ts";
const dir = path.join(PROJECT, "examples");
await mkdir(path.join(dir, "models"), { recursive: true });
const demo = tasks().find(
  (t) =>
    t.recipe.template.id === "demo-revelation" &&
    t.recipe.profile === "final" &&
    t.status === "completed",
);
if (!demo?.result)
  throw new Error("Lancez npm run demo avant de créer les exemples.");
await copyFile(demo.result.path, path.join(dir, "first-export.mp4"));
await writeFile(
  path.join(dir, "recipe.json"),
  JSON.stringify(demo.recipe, null, 2),
);
await writeFile(
  path.join(dir, "result.json"),
  JSON.stringify(demo.result, null, 2),
);
await writeFile(
  path.join(dir, "batch.json"),
  JSON.stringify(get<any>("batches", demo.batchId).input, null, 2),
);
await writeFile(
  path.join(dir, "results.json"),
  JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      results: tasks()
        .filter((t) => t.status === "completed")
        .map((t) => t.result),
    },
    null,
    2,
  ),
);
for (const t of templates().filter((t) =>
  ["revelation-12", "avant-apres-10", "transformation-cta-15"].includes(t.id),
))
  await writeFile(
    path.join(dir, "models", t.id + ".json"),
    JSON.stringify(t, null, 2),
  );
const model = {
  id: "scale-modele-exemple",
  name: "Révélation externe 12 s",
  kind: "video",
  duration: 12,
  music: "Musique à associer · révélation à 4 s",
  cta: "Découvre Loslo",
  slots: [
    { label: "Avant", category: "before", duration: 4 },
    { label: "Révélation", category: "after", duration: 5 },
    { label: "Conclusion", category: "any", duration: 3 },
  ],
};
const envelope = {
  version: 1,
  exportedAt: new Date().toISOString(),
  run: {
    id: "scale-lot-exemple",
    kind: "video",
    modelId: model.id,
    modelName: model.name,
    modelSnapshot: model,
    items: [
      {
        id: "scale-item-exemple",
        avatarId: "scale-avatar-exemple",
        avatarName: "Avatar à associer",
        status: "simulated",
        outputIds: [],
        posts: [
          { platform: "tiktok", handle: "", status: "waiting", url: "" },
          { platform: "instagram", handle: "", status: "waiting", url: "" },
        ],
      },
    ],
    paused: true,
    demo: true,
  },
  model,
  avatars: [
    {
      id: "scale-avatar-exemple",
      name: "Avatar à associer",
      language: "FR",
      folder: "",
    },
  ],
  media: [],
  note: "Exemple technique. Associer un avatar et un modèle locaux. Ne déclenche aucun rendu à l’import.",
};
await writeFile(
  path.join(dir, "scale-it-envelope.json"),
  JSON.stringify(envelope, null, 2),
);
await run(FFMPEG, [
  "-v",
  "error",
  "-i",
  demo.result.path,
  "-vf",
  "select='eq(n,0)+eq(n,119)+eq(n,120)+eq(n,121)+eq(n,126)+eq(n,269)+eq(n,270)+eq(n,359)',scale=180:320,tile=4x2",
  "-frames:v",
  "1",
  "-y",
  path.join(dir, "timeline-contact.png"),
]);
console.log("Exemples créés dans " + dir);
