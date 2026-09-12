import { readFile } from "node:fs/promises";
import { API_TOKEN } from "./db.ts";
const [command, arg, key] = process.argv.slice(2);
const base = process.env.MONTAGE_URL || "http://127.0.0.1:4310";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))
  throw new Error("La CLI contacte uniquement le service local.");
async function request(url: string, method = "GET", body?: unknown) {
  const r = await fetch(base + url, {
    method,
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      "Content-Type": "application/json",
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${text}`);
  console.log(text);
}
try {
  switch (command) {
    case "validate":
      await request(
        "/api/recipes/validate",
        "POST",
        JSON.parse(await readFile(arg, "utf8")),
      );
      break;
    case "batch":
      if (!key)
        throw new Error(
          "Usage : npm run cli -- batch lot.json cle-idempotence",
        );
      await request(
        "/api/batches",
        "POST",
        JSON.parse(await readFile(arg, "utf8")),
      );
      break;
    case "status":
      await request(
        arg ? "/api/tasks/" + encodeURIComponent(arg) : "/api/state",
      );
      break;
    case "result":
      await request("/api/tasks/" + encodeURIComponent(arg) + "/result");
      break;
    case "cancel":
      await request(
        "/api/tasks/" + encodeURIComponent(arg) + "/cancel",
        "POST",
        {},
      );
      break;
    case "import":
      await request(
        "/api/scale-it/import",
        "POST",
        JSON.parse(await readFile(arg, "utf8")),
      );
      break;
    case "results":
      await request("/api/results");
      break;
    case "diagnostic":
      await request("/api/diagnostics");
      break;
    default:
      console.log(
        "Create It\nvalidate recette.json\nbatch lot.json cle-idempotence\nstatus [taskId]\nresult taskId\ncancel taskId\nimport consignes-scale-it.json\nresults\ndiagnostic",
      );
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
}
