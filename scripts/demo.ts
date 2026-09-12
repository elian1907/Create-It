import path from "node:path";
import { mkdir, writeFile, access } from "node:fs/promises";
import { DATA, put, saveTemplate, task } from "../server/db.ts";
import { avatarSchema, starterTemplates } from "../shared/schema.ts";
import { run, FFMPEG, diagnostics } from "../server/process.ts";
import { indexAvatar, indexOne } from "../server/media.ts";
import { enqueueBatch, Queue } from "../server/queue.ts";
export async function seedDemo() {
  const root = path.join(DATA, "imports", "Démo technique avec espaces");
  for (const role of ["before", "after", "neutral"])
    await mkdir(path.join(root, role), { recursive: true });
  const avatar = avatarSchema.parse({
    id: "demo-technique",
    name: "Démo technique",
    language: "FR",
    demo: true,
    folders: {
      before: path.join(root, "before"),
      after: path.join(root, "after"),
      neutral: path.join(root, "neutral"),
    },
  });
  put("avatars", avatar);
  for (const [role, color] of [
    ["before", "0x66588c"],
    ["after", "0x48a98d"],
  ] as const) {
    const file = path.join(root, role, `${role} test accentué.mp4`);
    await run(FFMPEG, [
      "-v",
      "error",
      "-nostdin",
      "-f",
      "lavfi",
      "-i",
      `color=c=${color}:s=360x640:r=30:d=18`,
      "-f",
      "lavfi",
      "-i",
      "testsrc2=s=160x160:r=30:d=18",
      "-filter_complex",
      "[0:v][1:v]overlay=x=100+50*sin(t):y=240:shortest=1",
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      "-y",
      file,
    ]);
  }
  await indexAvatar(avatar.id);
  const musicFile = path.join(root, "Son synthétique.wav");
  await run(FFMPEG, [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000:duration=20",
    "-af",
    "volume=0.15",
    "-y",
    musicFile,
  ]);
  const music = await indexOne(musicFile, "", "music");
  const base = starterTemplates()[0];
  const saved = saveTemplate({
    ...base,
    id: "demo-revelation",
    name: "Démo technique · Révélation 12 s",
    music: {
      mediaId: music.id,
      start: 0,
      volume: 0.5,
      fadeIn: 0.2,
      fadeOut: 0.5,
      loop: false,
      title: "Signal synthétique 440 Hz",
      sourceUrl: "",
    },
    texts: [
      {
        ...base.texts[0],
        text: "DÉMO TECHNIQUE\nDécouvre Loslo",
        size: 48,
        y: 0.68,
      },
    ],
  });
  return { avatar, template: saved, music };
}
if (process.argv[1]?.endsWith("demo.ts")) {
  try {
    await access(path.join(DATA, "service.lock"));
    throw new Error(
      "Arrêtez le service avant npm run demo, puis relancez npm start.",
    );
  } catch (e: any) {
    if (e.code !== "ENOENT") throw e;
  }
  const d = await diagnostics();
  if (!d.ok) throw new Error(JSON.stringify(d));
  await seedDemo();
  const batch = await enqueueBatch(
    {
      name: "Premier export technique",
      avatarIds: ["demo-technique"],
      templateIds: ["demo-revelation"],
      count: 1,
      seed: "premier-export",
      language: "FR",
      profile: "final",
      demo: true,
      exportRootId: "default",
      externalRunId: "",
      externalItems: {},
    },
    "demo-first-export",
  );
  const queue = new Queue();
  await queue.start();
  let t;
  do {
    await new Promise((r) => setTimeout(r, 1000));
    t = task(batch.taskIds[0]);
    process.stdout.write(`${t?.status} ${Math.round(t?.progress || 0)} %\n`);
  } while (
    t &&
    !["completed", "failed", "cancelled", "interrupted"].includes(t.status)
  );
  await queue.stop();
  if (t?.status !== "completed") throw new Error(t?.error);
  await writeFile(
    path.join(DATA, "demo-result.json"),
    JSON.stringify(t.result, null, 2),
  );
  process.stdout.write(JSON.stringify(t.result, null, 2) + "\n");
}
