import path from "node:path";
import {
  mkdir,
  writeFile,
  rename,
  rm,
  readFile,
  stat,
  access,
} from "node:fs/promises";
import { constants, createWriteStream } from "node:fs";
import type { Recipe, Result } from "../shared/schema.ts";
import {
  mediaFile,
  fingerprint,
  safeOutputParent,
  checkedFile,
} from "./files.ts";
import { run, FFMPEG, diagnostics } from "./process.ts";
import { probe } from "./media.ts";
import { textImage } from "./text.ts";
import { validateRecipeShape, recipeHash } from "./planner.ts";
export async function verifySources(recipe: Recipe) {
  validateRecipeShape(recipe);
  const checked = new Set<string>();
  for (const media of [
    ...recipe.clips.map((c) => c.media),
    ...(recipe.music ? [recipe.music.media] : []),
  ]) {
    if (checked.has(media.path)) continue;
    const p = await mediaFile(media.path);
    if ((await fingerprint(p)) !== media.hash)
      throw new Error(
        `Le fichier a changé depuis la création de la recette : ${media.name}. Réindexez puis créez un nouveau lot.`,
      );
    checked.add(p);
  }
}
export async function validateOutput(
  file: string,
  r: Recipe,
  signal?: AbortSignal,
): Promise<Result["file"]> {
  const s = await stat(file);
  if (!s.size) throw new Error("Export vide.");
  const p = await probe(file, true),
    v = p.streams.find((s: any) => s.codec_type === "video"),
    a = p.streams.find((s: any) => s.codec_type === "audio");
  const expectedAudio =
    !!r.music || r.clips.some((c) => c.slot.originalAudio && c.media.audio);
  const frames = Number(v?.nb_read_frames);
  const duration = Number(v?.duration || p.format.duration);
  if (
    !v ||
    v.width !== r.width ||
    v.height !== r.height ||
    v.codec_name !== "h264" ||
    v.pix_fmt !== "yuv420p" ||
    frames !== r.totalFrames ||
    Math.abs(duration - r.totalFrames / r.fps) > 1 / r.fps + 0.0001 ||
    (expectedAudio && a?.codec_name !== "aac")
  )
    throw new Error(
      "Export invalide : " +
        JSON.stringify({
          width: v?.width,
          height: v?.height,
          codec: v?.codec_name,
          pix: v?.pix_fmt,
          frames,
          duration,
          audio: a?.codec_name,
          expectedAudio,
          expectedFrames: r.totalFrames,
        }),
    );
  if (
    expectedAudio &&
    Math.abs(Number(a.duration ?? p.format.duration) - r.totalFrames / r.fps) >
      1 / r.fps + 0.001
  )
    throw new Error("Durée de la piste audio incorrecte.");
  const [num, den] = String(v.avg_frame_rate).split("/").map(Number);
  if (Math.abs(num / den - r.fps) > 0.0001)
    throw new Error("Cadence de sortie incorrecte.");
  await run(
    FFMPEG,
    [
      "-v",
      "error",
      "-xerror",
      "-nostdin",
      "-protocol_whitelist",
      "file,pipe",
      "-i",
      file,
      "-map",
      "0:v:0",
      "-map",
      "0:a?",
      "-f",
      "null",
      "-",
    ],
    { signal },
  );
  return {
    size: s.size,
    duration,
    width: v.width,
    height: v.height,
    fps: num / den,
    frames,
    videoCodec: v.codec_name,
    audioCodec: a?.codec_name || null,
    hash: await fingerprint(file),
  };
}
export async function recoverOutput(
  finalDir: string,
  r: Recipe,
  taskId: string,
) {
  try {
    const root = await safeOutputParent(finalDir);
    const recipeFile = await checkedFile(path.join(finalDir, "recipe.json"), [
      root,
    ]);
    const resultFile = await checkedFile(path.join(finalDir, "result.json"), [
      root,
    ]);
    const videoFile = await checkedFile(path.join(finalDir, "video.mp4"), [
      root,
    ]);
    const stored = JSON.parse(await readFile(recipeFile, "utf8"));
    if (recipeHash(stored) !== recipeHash(r))
      throw new Error("Recette de sortie différente.");
    const result = JSON.parse(await readFile(resultFile, "utf8")) as Result;
    if (result.taskId !== taskId)
      throw new Error("Identifiant de sortie différent.");
    await validateOutput(videoFile, r);
    return result;
  } catch {
    return null;
  }
}
export async function render(
  r: Recipe,
  finalDir: string,
  taskId: string,
  options: {
    signal: AbortSignal;
    onProgress: (p: number, phase: string) => void;
    onValidate: () => void;
  },
): Promise<Result> {
  await safeOutputParent(finalDir);
  const diag = await diagnostics();
  if (!diag.ok)
    throw new Error(
      `Dépendances indisponibles : ${diag.missing?.join(", ")}. ${diag.help}`,
    );
  await verifySources(r);
  if (options.signal.aborted) throw new Error("Annulé.");
  const temp = finalDir + ".partial";
  await mkdir(path.dirname(finalDir), { recursive: true });
  await rm(temp, { recursive: true, force: true });
  await mkdir(temp, { recursive: false });
  let logs = "";
  const log = (s: string) => {
    logs = (logs + s).slice(-200000);
  };
  try {
    await writeFile(path.join(temp, "recipe.json"), JSON.stringify(r, null, 2));
    const args = [
      "-hide_banner",
      "-nostdin",
      "-y",
      "-filter_complex_threads",
      "1",
    ];
    const filters: string[] = [];
    let inputs = 0;
    const fps = r.fps;
    const duration = r.totalFrames / fps;
    for (const [i, c] of r.clips.entries()) {
      const media = c.media,
        slot = c.slot;
      const span =
        Math.min(media.outPoint ?? media.duration, media.duration) - c.inPoint;
      const isImage = media.kind === "image";
      if (isImage) args.push("-loop", "1", "-framerate", String(fps));
      args.push("-protocol_whitelist", "file,pipe", "-i", media.path);
      inputs++;
      // Loop only the explicitly trimmed region, never unrelated material outside the trim.
      let f = isImage
        ? ""
        : `trim=start=${c.inPoint}:end=${Math.min(media.outPoint ?? media.duration, media.duration)},setpts=PTS-STARTPTS,`;
      if (!isImage && slot.shortPolicy === "loop") {
        // loop uses normalized frames from the chosen trim
        f += `fps=${fps},loop=loop=-1:size=${Math.max(1, Math.floor(span * fps))}:start=0,setpts=N/(${fps}*TB),`;
      }
      f += `setpts=(PTS-STARTPTS)/${c.speed},fps=${fps},scale=w='trunc(iw*sar/2)*2':h=ih,setsar=1,`;
      if (!isImage && slot.shortPolicy === "freeze")
        f += `tpad=stop_mode=clone:stop_duration=${c.renderFrames / fps},`;
      const crop = slot.crop ?? media.crop;
      if (crop.mode === "fill")
        f += `scale=${r.width}:${r.height}:force_original_aspect_ratio=increase:force_divisible_by=2,crop=${r.width}:${r.height}:(iw-ow)*${crop.x}:(ih-oh)*${crop.y},`;
      else
        f += `scale=${r.width}:${r.height}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${r.width}:${r.height}:(ow-iw)*${crop.x}:(oh-ih)*${crop.y}:color=${crop.background},`;
      f += `setsar=1,format=yuv420p,`;
      if (crop.zoom > 1)
        f += `zoompan=z='1+${crop.zoom - 1}*on/${Math.max(1, c.renderFrames - 1)}':x='(iw-iw/zoom)*${crop.x}':y='(ih-ih/zoom)*${crop.y}':d=1:s=${r.width}x${r.height}:fps=${fps},`;
      f += `trim=end_frame=${c.renderFrames},setpts=N/(${fps}*TB),settb=1/30`;
      filters.push(`[${i}:v:0]${f}[v${i}]`);
    }
    let current = "v0";
    for (let i = 1; i < r.clips.length; i++) {
      const prev = r.clips[i - 1];
      const next = `join${i}`;
      if (prev.slot.transition.type === "cut")
        filters.push(
          `[${current}][v${i}]concat=n=2:v=1:a=0,settb=1/30[${next}]`,
        );
      else
        filters.push(
          `[${current}][v${i}]xfade=transition=${prev.slot.transition.type === "flash" ? "fadewhite" : "fade"}:duration=${prev.slot.transition.frames / fps}:offset=${r.clips[i].startFrame / fps},settb=1/30[${next}]`,
        );
      const joinEnd = r.clips[i].startFrame + r.clips[i].renderFrames;
      filters.push(
        `[${next}]trim=end_frame=${joinEnd},setpts=N/(${fps}*TB)[bounded${i}]`,
      );
      current = `bounded${i}`;
    }
    const audioLabels: string[] = [];
    for (const [i, c] of r.clips.entries()) {
      if (c.slot.originalAudio && c.media.audio) {
        const label = `a${i}`;
        const sourceEnd = Math.min(
          c.media.outPoint ?? c.media.duration,
          c.media.duration,
        );
        let filter = `atrim=start=${c.inPoint}:end=${sourceEnd},asetpts=PTS-STARTPTS,atempo=${c.speed},aresample=48000,aformat=channel_layouts=stereo,`;
        if (c.slot.shortPolicy === "loop")
          filter += `aloop=loop=-1:size=${Math.max(1, Math.floor(((sourceEnd - c.inPoint) / c.speed) * 48000))},`;
        filter += `apad,atrim=duration=${c.slot.frames / fps},adelay=${Math.round((c.startFrame / fps) * 48000)}S:all=1`;
        filters.push(`[${i}:a:0]${filter}[${label}]`);
        audioLabels.push(label);
      }
    }
    if (r.music) {
      const { media, settings: m } = r.music;
      args.push("-protocol_whitelist", "file,pipe", "-i", media.path);
      let f = `atrim=start=${m.start},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,`;
      if (m.loop)
        f += `aloop=loop=-1:size=${Math.max(1, Math.floor((media.duration - m.start) * 48000))},`;
      f += `atrim=duration=${duration},volume=${m.volume}`;
      if (m.fadeIn) f += `,afade=t=in:st=0:d=${m.fadeIn}`;
      if (m.fadeOut)
        f += `,afade=t=out:st=${duration - m.fadeOut}:d=${m.fadeOut}`;
      filters.push(`[${inputs++}:a:0]${f}[music]`);
      audioLabels.push("music");
    }
    for (const [i, text] of r.template.texts.entries()) {
      const filename = `text-${i}.png`;
      await writeFile(
        path.join(temp, filename),
        textImage(text, r.template, r.width, r.height).png,
      );
      args.push("-loop", "1", "-framerate", String(fps), "-i", filename);
      const label = `texted${i}`;
      filters.push(
        `[${current}][${inputs++}:v]overlay=0:0:enable='gte(n,${text.startFrame})*lt(n,${text.endFrame})':shortest=1[${label}]`,
      );
      current = label;
    }
    filters.push(
      `[${current}]trim=end_frame=${r.totalFrames},setpts=N/(${fps}*TB),format=yuv420p[outv]`,
    );
    if (audioLabels.length)
      filters.push(
        `${audioLabels.map((s) => `[${s}]`).join("")}amix=inputs=${audioLabels.length}:normalize=0:duration=longest,apad,atrim=duration=${duration}[outa]`,
      );
    await writeFile(path.join(temp, "filter.txt"), filters.join(";\n"));
    args.push("-filter_complex", filters.join(";"), "-map", "[outv]");
    if (audioLabels.length)
      args.push(
        "-map",
        "[outa]",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-ar",
        "48000",
      );
    else args.push("-an");
    args.push(
      "-c:v",
      "libx264",
      "-preset",
      r.profile === "preview" ? "ultrafast" : "veryfast",
      "-crf",
      r.profile === "preview" ? "26" : "20",
      "-threads",
      "2",
      "-pix_fmt",
      "yuv420p",
      "-r",
      String(fps),
      "-frames:v",
      String(r.totalFrames),
      "-t",
      String(duration),
      "-movflags",
      "+faststart",
      "-progress",
      "pipe:1",
      "-nostats",
      "video.mp4",
    );
    log(
      JSON.stringify(
        { engine: r.engineVersion, ffmpeg: diag.ffmpeg, args },
        null,
        2,
      ) + "\n",
    );
    options.onProgress(0, "Encodage FFmpeg");
    await run(FFMPEG, args, {
      cwd: temp,
      signal: options.signal,
      onLog: log,
      onProgress: (s) =>
        options.onProgress(
          Math.min(99, Math.max(0, (s / duration) * 100)),
          "Encodage FFmpeg",
        ),
    });
    options.onValidate();
    const metadata = await validateOutput(
      path.join(temp, "video.mp4"),
      r,
      options.signal,
    );
    if (options.signal.aborted) throw new Error("Annulé.");
    await run(
      FFMPEG,
      [
        "-v",
        "error",
        "-nostdin",
        "-ss",
        String(Math.min(4.5, duration / 2)),
        "-i",
        path.join(temp, "video.mp4"),
        "-frames:v",
        "1",
        "-vf",
        "scale=360:-2",
        "-y",
        path.join(temp, "thumbnail.jpg"),
      ],
      { signal: options.signal },
    );
    const result: Result = {
      taskId,
      externalRunId: r.externalRunId,
      externalItemId: r.externalItemId,
      avatar: r.avatar,
      template: {
        id: r.template.id,
        version: r.template.version,
        name: r.template.name,
      },
      status: "completed",
      demo: r.demo,
      profile: r.profile,
      path: path.join(finalDir, "video.mp4"),
      thumbnail: path.join(finalDir, "thumbnail.jpg"),
      recipePath: path.join(finalDir, "recipe.json"),
      file: metadata,
      validatedAt: new Date().toISOString(),
    };
    await writeFile(
      path.join(temp, "result.json"),
      JSON.stringify(result, null, 2),
    );
    await writeFile(path.join(temp, "render.log"), logs);
    for (let i = 0; i < r.template.texts.length; i++)
      await rm(path.join(temp, `text-${i}.png`));
    await rm(path.join(temp, "filter.txt"));
    try {
      await access(finalDir, constants.F_OK);
      throw new Error(
        "Le dossier de sortie existe déjà : aucun écrasement autorisé.",
      );
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
    }
    if (options.signal.aborted) throw new Error("Annulé.");
    await rename(temp, finalDir);
    return result;
  } catch (e) {
    await writeFile(
      path.join(path.dirname(finalDir), path.basename(finalDir) + ".error.log"),
      logs + "\n" + String(e),
    ).catch(() => {});
    throw e;
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
