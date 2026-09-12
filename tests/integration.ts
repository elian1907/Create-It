/** Real FFmpeg + SQLite + HTTP tests. Uses a private temporary workspace. */
import assert from "node:assert/strict";
import {
  mkdtemp,
  writeFile,
  readFile,
  copyFile,
  unlink,
  readdir,
  stat,
  mkdir,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
const workspace = await mkdtemp(path.join(os.tmpdir(), "montage-integration-"));
process.env.MONTAGE_DATA = workspace;
const {
  DATA,
  PROJECT,
  API_TOKEN,
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
  updateTask,
} = await import("../server/db.ts");
const { seedDemo } = await import("../scripts/demo.ts");
const { run, FFMPEG, diagnostics } = await import("../server/process.ts");
const { indexAvatar, indexOne, probe, waveform } =
  await import("../server/media.ts");
const { selectRecipe, recipeHash } = await import("../server/planner.ts");
const { render, validateOutput, verifySources } =
  await import("../server/engine.ts");
const { Queue, enqueueBatch, planBatch, enqueuePreview } =
  await import("../server/queue.ts");
const { batchSchema, avatarSchema } = await import("../shared/schema.ts");
const { createApp, errors } = await import("../server/api.ts");
import type { Media, Avatar, Template, Recipe } from "../shared/schema.ts";
const runningQueues: any[] = [];
const children: any[] = [];
let httpServer: any;
let checks = 0;
const passed = (s: string) => {
  checks++;
  console.log("✓ " + s);
};
const delay = (n: number) => new Promise((r) => setTimeout(r, n));
async function eventually(fn: () => boolean, timeout = 25000) {
  const end = Date.now() + timeout;
  while (!fn()) {
    if (Date.now() > end) throw new Error("Délai de test dépassé.");
    await delay(50);
  }
}
try {
  assert.equal((await diagnostics()).ok, true);
  await assert.rejects(run("montage-binary-inexistant", []), /Impossible/);
  passed("Diagnostic réel et binaire manquant");
  const seeded = await seedDemo();
  const avatar = seeded.avatar;
  const initial = all<Media>("media");
  assert.equal(initial.length, 3);
  assert.ok(
    Math.max(...(await waveform(initial.find((m) => m.kind === "audio")!))) >
      0.005,
  );
  passed("Forme d’onde issue du signal audio réel");
  const indexed = await indexAvatar(avatar.id);
  assert.equal(indexed.added, 0);
  assert.equal(indexed.updated, 0);
  assert.equal(all<Media>("media").length, 3);
  await assert.rejects(
    indexOne(
      initial.find((m) => m.kind === "audio")!.path,
      avatar.id,
      "before",
    ),
    /rôle/,
  );
  await assert.rejects(
    indexOne(
      initial.find((m) => m.role === "before")!.path,
      "inexistant",
      "before",
    ),
    /avatar/,
  );
  passed("Deux clips analysés, rôles vérifiés et réindexation sans doublons");
  const bad = path.join(avatar.folders.before, "corrompu.mp4");
  await writeFile(bad, "not a video");
  const report = await indexAvatar(avatar.id);
  assert.equal(report.errors.length, 1);
  await unlink(bad);
  passed("Fichier corrompu refusé");
  const transient = path.join(avatar.folders.after, "fichier absent.mp4");
  await copyFile(initial.find((m) => m.role === "after")!.path, transient);
  const transientMedia = await indexOne(transient, avatar.id, "after");
  await unlink(transient);
  const missing = await indexAvatar(avatar.id);
  assert.equal(missing.missing, 1);
  assert.equal(get<Media>("media", transientMedia.id)!.missing, true);
  passed("Fichier absent signalé sans effacer son historique");
  let t: Template = {
    ...seeded.template,
    id: "integration",
    name: "Vérification des transitions",
    width: 360,
    height: 640,
    slots: seeded.template.slots.map((s, i) => ({
      ...s,
      frames: 30,
      transition: {
        type: i === 0 ? ("fade" as const) : ("cut" as const),
        frames: i === 0 ? 6 : 0,
      },
    })),
    markers: [30],
    texts: [
      {
        ...seeded.template.texts[0],
        text: "Été, déjà !\nLoslo",
        size: 24,
        startFrame: 60,
        endFrame: 90,
        y: 0.62,
      },
    ],
    music: { ...seeded.template.music!, fadeIn: 0.1, fadeOut: 0.2 },
  };
  const make = (model = t, seed = "test") =>
    selectRecipe({
      avatar,
      template: model,
      media: all<Media>("media"),
      seed,
      profile: "final",
      demo: true,
    });
  const artifacts: string[] = [];
  for (const transition of ["cut", "fade", "flash"] as const) {
    const model = structuredClone(t);
    model.slots[0].transition = {
      type: transition,
      frames: transition === "cut" ? 0 : 6,
    };
    const r = make(model);
    const dir = path.join(DATA, "exports", transition);
    let last = 0;
    const result = await render(r, dir, transition, {
      signal: new AbortController().signal,
      onProgress: (p) => (last = p),
      onValidate: () => {},
    });
    assert.equal(result.file.frames, 90);
    assert.equal(result.file.duration, 3);
    assert.equal(result.file.audioCodec, "aac");
    assert.ok(last > 0);
    assert.equal((await readdir(dir)).includes("recipe.json"), true);
    assert.ok((await stat(path.join(dir, "thumbnail.jpg"))).size > 0);
    assert.ok(
      !(await readdir(path.dirname(dir))).includes(transition + ".partial"),
    );
    artifacts.push(result.path);
    await assert.rejects(
      render(r, dir, transition, {
        signal: new AbortController().signal,
        onProgress: () => {},
        onValidate: () => {},
      }),
      /existe déjà/,
    );
    passed(
      `${transition} : 90 images exactes, texte accentué, audio AAC, sortie atomique et non-écrasement`,
    );
  }
  // Read one source-color pixel at either side of each nominal boundary.
  async function pixel(file: string, frame: number) {
    const r = await run(FFMPEG, [
      "-v",
      "error",
      "-i",
      file,
      "-vf",
      `select=eq(n\\,${frame}),crop=2:2:4:4,format=rgb24`,
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "pipe:1",
    ]);
    return [...r.buffer.subarray(0, 3)];
  }
  const red = await pixel(artifacts[0], 29),
    green = await pixel(artifacts[0], 30);
  assert.ok(red[2] > red[1]);
  assert.ok(green[1] > green[2]);
  const fadeBegin = await pixel(artifacts[1], 30),
    fadeEnd = await pixel(artifacts[1], 37);
  assert.ok(fadeBegin[2] > fadeBegin[1]);
  assert.ok(fadeEnd[1] > fadeEnd[2]);
  const flashPixels = await Promise.all(
    [31, 32, 33, 34, 35].map((f) => pixel(artifacts[2], f)),
  );
  assert.ok(flashPixels.some((p) => p.every((x) => x > 240)));
  passed(
    "Bornes visuelles : coupe à l’image 30, fondu au repère, flash blanc dans la fenêtre de transition",
  );
  // Short source handling and media trims are explicit; original audio is also rendered.
  const shortPath = path.join(avatar.folders.before, "court avec son.mp4");
  await run(FFMPEG, [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=yellow:s=160x240:r=30:d=0.5",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=660:duration=0.5",
    "-c:v",
    "libx264",
    "-c:a",
    "aac",
    "-pix_fmt",
    "yuv420p",
    "-shortest",
    "-y",
    shortPath,
  ]);
  const short = await indexOne(shortPath, avatar.id, "before");
  for (const policy of ["freeze", "loop"] as const) {
    const model = structuredClone(t);
    model.id = policy;
    model.slots[0] = {
      ...model.slots[0],
      selection: "fixed",
      mediaId: short.id,
      shortPolicy: policy,
      originalAudio: true,
      crop: {
        mode: "contain",
        x: 0.5,
        y: 0.5,
        zoom: 1.08,
        background: "#102030",
      },
    };
    model.music = null;
    const r = make(model);
    const result = await render(r, path.join(DATA, "exports", policy), policy, {
      signal: new AbortController().signal,
      onProgress: () => {},
      onValidate: () => {},
    });
    assert.equal(result.file.frames, 90);
    assert.equal(result.file.audioCodec, "aac");
    passed(`Clip court : ${policy}, son original, contenir et zoom`);
  }
  const imagePath = path.join(avatar.folders.neutral, "image fixe.png");
  await run(FFMPEG, [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=orange:s=240x240",
    "-frames:v",
    "1",
    "-y",
    imagePath,
  ]);
  const image = await indexOne(imagePath, avatar.id, "neutral");
  const imageModel = structuredClone(t);
  imageModel.slots[0] = {
    ...imageModel.slots[0],
    role: "image",
    selection: "fixed",
    mediaId: image.id,
  };
  imageModel.music = { ...imageModel.music!, start: 19, loop: true };
  const imageResult = await render(
    make(imageModel),
    path.join(DATA, "exports", "image-loop-music"),
    "image",
    {
      signal: new AbortController().signal,
      onProgress: () => {},
      onValidate: () => {},
    },
  );
  assert.equal(imageResult.file.frames, 90);
  passed("Image explicitement associée et passage musical bouclé à la demande");
  const immutable = make();
  const sourcePath = immutable.clips[0].media.path;
  const original = await readFile(sourcePath);
  await writeFile(sourcePath, "changed");
  await assert.rejects(verifySources(immutable), /changé/);
  await writeFile(sourcePath, original);
  passed("Empreintes vérifiées avant rendu");
  const saved = saveTemplate({
    ...t,
    slots: t.slots.map((s) => ({
      ...s,
      selection: "fixed" as const,
      mediaId: initial.find((m) => m.role === s.role)!.id,
    })),
  });
  const input = batchSchema.parse({
    name: "Lot de test",
    avatarIds: [avatar.id],
    templateIds: [saved.id],
    count: 1,
    seed: "seed",
  });
  const pair = await Promise.all([
    enqueueBatch(input, "same-key"),
    enqueueBatch(input, "same-key"),
  ]);
  assert.equal(pair[0].id, pair[1].id);
  assert.equal(tasks().length, 1);
  await assert.rejects(
    enqueueBatch({ ...input, name: "Autres consignes" }, "same-key"),
    /consignes différentes/,
  );
  await assert.rejects(
    enqueueBatch({ ...input, seed: "different" }, "new-key"),
    /combinaison/,
  );
  passed(
    "Idempotence, conflit et réservation des doublons dans des demandes simultanées",
  );
  const q = new Queue();
  runningQueues.push(q);
  setSetting("paused", true);
  await q.start();
  await delay(650);
  assert.equal(task(pair[0].taskIds[0])!.status, "queued");
  setSetting("paused", false);
  await q.tick();
  await eventually(() => task(pair[0].taskIds[0])!.status === "rendering");
  q.cancel(pair[0].taskIds[0]);
  await eventually(() => q.active.size === 0);
  assert.equal(task(pair[0].taskIds[0])!.status, "cancelled");
  q.retry(pair[0].taskIds[0]);
  await q.tick();
  await eventually(
    () =>
      task(pair[0].taskIds[0])!.status === "completed" ||
      task(pair[0].taskIds[0])!.status === "failed",
  );
  assert.equal(
    task(pair[0].taskIds[0])!.status,
    "completed",
    task(pair[0].taskIds[0])!.error,
  );
  await q.stop();
  passed(
    "Pause de la file, annulation du processus et relance depuis le début",
  );
  const current = task(pair[0].taskIds[0])!;
  updateTask(current.id, { status: "interrupted" });
  const qRecovery = new Queue();
  runningQueues.push(qRecovery);
  qRecovery.retry(current.id);
  await qRecovery.start();
  await eventually(() => task(current.id)!.status === "completed");
  assert.equal(task(current.id)!.phase, "Export validé retrouvé");
  await qRecovery.stop();
  passed("Un export déjà validé est retrouvé avant de réencoder");
  // HTTP auth, origin, path scope and API result contract with real server middleware.
  const port = 44319;
  const httpQueue = new Queue();
  runningQueues.push(httpQueue);
  const app = createApp(httpQueue, port);
  app.use(errors);
  const server = app.listen(port, "127.0.0.1");
  httpServer = server;
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${port}`;
  const auth = {
    Authorization: `Bearer ${API_TOKEN}`,
    "Content-Type": "application/json",
  };
  assert.equal((await fetch(base + "/api/state")).status, 401);
  assert.equal(
    (
      await fetch(base + "/api/state", {
        headers: { ...auth, Origin: "https://evil.invalid" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(base + "/api/session", {
        method: "POST",
        headers: { "X-Studio-Client": "1", Origin: "https://evil.invalid" },
      })
    ).status,
    403,
  );
  const resultResponse = await fetch(
    base + "/api/tasks/" + current.id + "/result",
    { headers: auth },
  );
  assert.equal(resultResponse.status, 200);
  assert.equal(((await resultResponse.json()) as any).status, "completed");
  const range = await fetch(base + "/api/tasks/" + current.id + "/video", {
    headers: { ...auth, Range: "bytes=0-99" },
  });
  assert.equal(range.status, 206);
  assert.equal((await range.arrayBuffer()).byteLength, 100);
  const denied = await fetch(base + "/api/media/path", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      path: "/etc/passwd",
      avatarId: avatar.id,
      role: "before",
    }),
  });
  assert.equal(denied.status, 400);
  const valid = await fetch(base + "/api/recipes/validate", {
    method: "POST",
    headers: auth,
    body: JSON.stringify(current.recipe),
  });
  assert.equal(valid.status, 200);
  passed(
    "API protégée, origine tierce refusée, lecture MP4 partielle et contrat résultat",
  );
  const scaleTemplate = saveTemplate({
    ...t,
    id: "scale-local",
    name: "Modèle Scale It vérifié",
    texts: [{ ...t.texts[0], text: "Été · Scale It" }],
  });
  const old = {
    id: "scale-model",
    name: "Modèle externe",
    kind: "video",
    duration: 3,
    music: "Son à associer",
    cta: "Loslo",
    slots: [
      { label: "Avant", category: "before", duration: 1 },
      { label: "Après", category: "after", duration: 2 },
    ],
  };
  const envelope = {
    version: 1,
    exportedAt: new Date().toISOString(),
    run: {
      id: "scale-run",
      kind: "video",
      modelId: old.id,
      modelName: old.name,
      modelSnapshot: old,
      items: [
        {
          id: "scale-item",
          avatarId: "scale-avatar",
          avatarName: "Avatar externe",
          status: "simulated",
          outputIds: [],
          posts: [{ platform: "tiktok" }, { platform: "instagram" }],
        },
      ],
      paused: true,
      demo: true,
    },
    model: old,
    avatars: [
      { id: "scale-avatar", name: "Avatar externe" },
      { id: "scale-avatar", name: "Avatar externe" },
    ],
    media: [{ url: "https://private.invalid/protected" }],
    note: "Test",
  };
  const countBefore = tasks().length;
  const imported = await fetch(base + "/api/scale-it/import", {
    method: "POST",
    headers: auth,
    body: JSON.stringify(envelope),
  });
  assert.equal(imported.status, 200);
  const draft: any = await imported.json();
  assert.equal(tasks().length, countBefore);
  const scaleOptions = {
    templateId: scaleTemplate.id,
    avatarMap: { "scale-avatar": avatar.id },
    confirmProduction: false,
    seed: "scale",
    exportRootId: "default",
    demo: true,
  };
  const enqueueURL = base + "/api/scale-it/" + draft.id + "/enqueue";
  assert.equal(
    (
      await fetch(enqueueURL, {
        method: "POST",
        headers: { ...auth, "Idempotency-Key": "scale-key" },
        body: JSON.stringify(scaleOptions),
      })
    ).status,
    400,
  );
  scaleOptions.confirmProduction = true;
  const scaleResponses = await Promise.all(
    [1, 2].map(() =>
      fetch(enqueueURL, {
        method: "POST",
        headers: { ...auth, "Idempotency-Key": "scale-key" },
        body: JSON.stringify(scaleOptions),
      }),
    ),
  );
  assert.equal(scaleResponses[0].status, 200);
  assert.equal(scaleResponses[1].status, 200);
  const scaleBatch: any = await scaleResponses[0].json();
  assert.equal(scaleBatch.taskIds.length, 1);
  assert.equal(((await scaleResponses[1].json()) as any).id, scaleBatch.id);
  await httpQueue.start();
  await eventually(() =>
    ["completed", "failed"].includes(task(scaleBatch.taskIds[0])!.status),
  );
  assert.equal(
    task(scaleBatch.taskIds[0])!.status,
    "completed",
    task(scaleBatch.taskIds[0])!.error,
  );
  const scaleResult = task(scaleBatch.taskIds[0])!.result!;
  assert.equal(scaleResult.externalRunId, "scale-run");
  assert.equal(scaleResult.externalItemId, "scale-item");
  assert.equal("outputId" in scaleResult, false);
  await httpQueue.stop();
  server.close();
  passed(
    "Scale It de bout en bout : import inerte, confirmation explicite, idempotence, un rendu pour deux destinations et identifiants externes",
  );
  // Crash the actual service while encoding, then restart the same SQLite workspace.
  const longModel = saveTemplate({
    ...t,
    id: "restart-test",
    name: "Reprise après arrêt",
    slots: t.slots.map((s) => ({
      ...s,
      frames: 300,
      selection: "fixed" as const,
      mediaId: initial.find((m) => m.role === s.role)!.id,
    })),
    texts: [],
    markers: [],
    music: null,
    width: 1080,
    height: 1920,
  });
  const restartBatch = await enqueueBatch(
    batchSchema.parse({
      name: "Interruption",
      avatarIds: [avatar.id],
      templateIds: [longModel.id],
      count: 1,
      seed: "restart",
    }),
    "restart-key",
  );
  function service() {
    const p = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
      cwd: PROJECT,
      env: { ...process.env, MONTAGE_DATA: DATA, PORT: "44320" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    p.stdout.on("data", () => {});
    p.stderr.on("data", () => {});
    children.push(p);
    return p;
  }
  let child = service();
  await eventually(() => task(restartBatch.taskIds[0])!.status === "rendering");
  child.kill("SIGKILL");
  await new Promise((resolve) => child.once("close", resolve));
  child = service();
  await eventually(() => tasks().some((t) => t.status === "interrupted"));
  const restartStatus = await (async () => {
    for (let i = 0; i < 100; i++) {
      try {
        return await fetch(
          "http://127.0.0.1:44320/api/tasks/" + restartBatch.taskIds[0],
          { headers: auth },
        );
      } catch {
        await delay(50);
      }
    }
    throw new Error("Serveur non redémarré");
  })();
  assert.equal(((await restartStatus.json()) as any).status, "interrupted");
  const retry = await fetch(
    "http://127.0.0.1:44320/api/tasks/" + restartBatch.taskIds[0] + "/retry",
    { method: "POST", headers: auth, body: "{}" },
  );
  assert.equal(retry.status, 200);
  await eventually(
    () =>
      task(restartBatch.taskIds[0])!.status === "completed" ||
      task(restartBatch.taskIds[0])!.status === "failed",
    60000,
  );
  assert.equal(
    task(restartBatch.taskIds[0])!.status,
    "completed",
    task(restartBatch.taskIds[0])!.error,
  );
  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("close", resolve));
  passed(
    "Arrêt brutal (SIGKILL) et redémarrage réels du service : recette persistée, tâche interrompue puis relancée",
  );
  const finalReport = {
    checks,
    ffmpeg: (await diagnostics()).ffmpeg,
    node: process.version,
    platform: process.platform,
    workspace,
    artifacts,
    completedAt: new Date().toISOString(),
  };
  await writeFile(
    path.join(PROJECT, "examples", "integration-report.json"),
    JSON.stringify(finalReport, null, 2),
  );
  console.log(
    `\n${checks} vérifications d’intégration réussies.\nRapport : examples/integration-report.json`,
  );
} catch (e) {
  console.error("ÉCHEC", e);
  console.error("Données de diagnostic conservées : " + workspace);
  process.exitCode = 1;
} finally {
  httpServer?.close();
  for (const q of runningQueues) await q.stop();
  for (const child of children)
    if (child.exitCode === null && !child.killed) child.kill("SIGTERM");
}
