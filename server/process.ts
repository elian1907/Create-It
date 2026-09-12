import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
export const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
export const FFPROBE = process.env.FFPROBE_PATH || "ffprobe";
export function run(
  command: string,
  args: string[],
  options: {
    signal?: AbortSignal;
    onProgress?: (seconds: number) => void;
    onLog?: (s: string) => void;
    binary?: boolean;
    cwd?: string;
  } = {},
): Promise<{ stdout: string; stderr: string; buffer: Buffer }> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) return reject(new Error("Annulé."));
    const p = fork(
      fileURLToPath(new URL("./subprocess.mjs", import.meta.url)),
      [command, JSON.stringify(args)],
      {
        execArgv: [],
        cwd: options.cwd,
        stdio: ["ignore", "pipe", "pipe", "ipc"],
      },
    );
    let stdout: Buffer[] = [];
    let bytes = 0;
    let stderr = "";
    let progress = "";
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const abort = () => {
      p.kill("SIGTERM");
      killTimer = setTimeout(() => p.kill("SIGKILL"), 4000);
    };
    options.signal?.addEventListener("abort", abort, { once: true });
    p.stdout!.on("data", (data: Buffer) => {
      bytes += data.length;
      if (bytes < 64 * 1024 * 1024) stdout.push(data);
      if (options.onProgress) {
        progress += data.toString();
        const lines = progress.split("\n");
        progress = lines.pop() || "";
        for (const line of lines) {
          const m = /^out_time_us=(\d+)/.exec(line);
          if (m) options.onProgress(+m[1] / 1e6);
        }
      }
    });
    p.stderr!.on("data", (d: Buffer) => {
      stderr = (stderr + d.toString()).slice(-32000);
      options.onLog?.(d.toString());
    });
    const clean = () => {
      options.signal?.removeEventListener("abort", abort);
      if (killTimer) clearTimeout(killTimer);
    };
    p.on("error", (e) => {
      clean();
      reject(new Error(`Impossible de lancer ${command} : ${e.message}`));
    });
    p.on("close", (code) => {
      clean();
      if (options.signal?.aborted) return reject(new Error("Annulé."));
      if (code !== 0)
        return reject(
          new Error(`${command} (${code}) : ${stderr.slice(-5000)}`),
        );
      const buffer = Buffer.concat(stdout);
      resolve({
        stdout: options.binary ? "" : buffer.toString(),
        stderr,
        buffer,
      });
    });
  });
}
let diagnosticsCache: any;
export async function diagnostics(refresh = false) {
  if (diagnosticsCache && !refresh) return diagnosticsCache;
  try {
    const [v, p, e, f, x] = await Promise.all([
      run(FFMPEG, ["-version"]),
      run(FFPROBE, ["-version"]),
      run(FFMPEG, ["-hide_banner", "-encoders"]),
      run(FFMPEG, ["-hide_banner", "-filters"]),
      run(FFMPEG, ["-hide_banner", "-h", "filter=xfade"]),
    ]);
    const required = [
      "scale",
      "crop",
      "pad",
      "fps",
      "setpts",
      "setsar",
      "settb",
      "trim",
      "xfade",
      "concat",
      "overlay",
      "zoompan",
      "format",
      "tpad",
      "loop",
      "aloop",
      "atrim",
      "asetpts",
      "aresample",
      "aformat",
      "amix",
      "adelay",
      "apad",
      "atempo",
      "volume",
      "afade",
    ];
    const filters = required.filter((n) =>
      new RegExp("\\s" + n + "\\s").test(f.stdout + f.stderr),
    );
    const missing = required.filter((n) => !filters.includes(n));
    if (!/\blibx264\b/.test(e.stdout + e.stderr))
      missing.push("encodeur libx264");
    if (!/\baac\b/.test(e.stdout + e.stderr)) missing.push("encodeur AAC");
    if (!/fadewhite/.test(x.stdout + x.stderr))
      missing.push("transition fadewhite");
    return (diagnosticsCache = {
      ok: missing.length === 0,
      ffmpeg: v.stdout.split("\n")[0],
      ffprobe: p.stdout.split("\n")[0],
      missing,
      filters,
      node: process.version,
      platform: process.platform,
      help: "macOS : brew install ffmpeg. Windows : winget install Gyan.FFmpeg puis rouvrir le terminal. Vous pouvez définir FFMPEG_PATH et FFPROBE_PATH.",
    });
  } catch (e) {
    return (diagnosticsCache = {
      ok: false,
      error: String(e),
      missing: ["FFmpeg / FFprobe"],
      help: "macOS : brew install ffmpeg. Windows : winget install Gyan.FFmpeg. Les deux binaires doivent être dans PATH, ou définis par FFMPEG_PATH / FFPROBE_PATH.",
    });
  }
}
