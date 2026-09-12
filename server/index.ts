import express from "express";
import path from "node:path";
import { writeFile, unlink, readFile, open } from "node:fs/promises";
import { createApp, errors } from "./api.ts";
import { Queue } from "./queue.ts";
import { PROJECT, DATA } from "./db.ts";
const port = Number(process.env.PORT || 4310);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("PORT invalide.");
const lock = path.join(DATA, "service.lock");
try {
  const pid = Number(await readFile(lock, "utf8"));
  try {
    process.kill(pid, 0);
    throw new Error(`Un service utilise déjà ces données (PID ${pid}).`);
  } catch (e: any) {
    if (e.code !== "ESRCH") throw e;
  }
  await unlink(lock);
} catch (e: any) {
  if (e.code !== "ENOENT") throw e;
}
const handle = await open(lock, "wx", 0o600);
await handle.writeFile(String(process.pid));
await handle.close();
const queue = new Queue();
const app = createApp(queue, port);
if (process.argv.includes("--dev")) {
  const { createServer } = await import("vite");
  const vite = await createServer({
    root: PROJECT,
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.join(PROJECT, "dist")));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(path.join(PROJECT, "dist", "index.html")),
  );
}
app.use(errors);
const server = app.listen(port, "127.0.0.1", async () => {
  await queue.start();
  console.log(
    `Create It : http://127.0.0.1:${port}\nDonnées locales : ${DATA}`,
  );
});
server.on("error", async (e) => {
  await unlink(lock).catch(() => {});
  console.error(e.message);
  process.exit(1);
});
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  server.close();
  await queue.stop();
  await unlink(lock).catch(() => {});
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
