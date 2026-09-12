import path from "node:path";
import { stat, mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { all, put, DATA, get } from "./db.ts";
import { checkedFile, mediaFile, walk, fingerprint } from "./files.ts";
import { run, FFMPEG, FFPROBE } from "./process.ts";
import { mediaSchema, type Avatar, type Media } from "../shared/schema.ts";
const videoExtensions = new Set([".mp4", ".mov", ".mkv", ".webm", ".m4v"]);
const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const audioExtensions = new Set([
  ".mp3",
  ".wav",
  ".m4a",
  ".aac",
  ".flac",
  ".ogg",
]);
export async function probe(file: string, count = false) {
  const r = await run(FFPROBE, [
    "-v",
    "error",
    "-protocol_whitelist",
    "file,pipe",
    ...(count ? ["-count_frames"] : []),
    "-show_streams",
    "-show_format",
    "-of",
    "json",
    file,
  ]);
  return JSON.parse(r.stdout);
}
export async function analyze(
  file: string,
  avatarId: string,
  role: Media["role"],
  previous?: Media,
): Promise<Media> {
  const p = await mediaFile(file);
  const ext = path.extname(p).toLowerCase();
  const kind = imageExtensions.has(ext)
    ? "image"
    : audioExtensions.has(ext)
      ? "audio"
      : videoExtensions.has(ext)
        ? "video"
        : null;
  if (!kind) throw new Error("Extension non prise en charge.");
  if ((role === "music") !== (kind === "audio"))
    throw new Error(
      "Choisissez le rôle Musique pour un fichier audio, et un rôle d’avatar pour une vidéo ou une image.",
    );
  if (role !== "music" && !get<Avatar>("avatars", avatarId))
    throw new Error("Choisissez un avatar local existant.");
  const [info, fileStat, hash] = await Promise.all([
    probe(p),
    stat(p),
    fingerprint(p),
  ]);
  const v = info.streams.find(
    (s: any) => s.codec_type === "video" && !s.disposition?.attached_pic,
  );
  const a = info.streams.some((s: any) => s.codec_type === "audio");
  if ((kind !== "audio" && !v) || (kind === "audio" && !a))
    throw new Error("Aucune piste média utilisable.");
  const transfer = v?.color_transfer || "";
  if (
    ["smpte2084", "arib-std-b67"].includes(transfer) ||
    /bt2020/.test(v?.color_primaries || "") ||
    /10|12|16/.test(v?.pix_fmt || "")
  )
    throw new Error(
      "Source HDR ou profondeur > 8 bits non prise en charge : convertir explicitement en SDR 8 bits.",
    );
  const rotation = Number(
    v?.side_data_list?.find((x: any) => x.rotation !== undefined)?.rotation ||
      v?.tags?.rotate ||
      0,
  );
  const swapped = Math.abs(rotation) % 180 === 90;
  const width = Number((swapped ? v?.height : v?.width) || 0),
    height = Number((swapped ? v?.width : v?.height) || 0);
  const fraction = String(v?.avg_frame_rate || "0/1")
    .split("/")
    .map(Number);
  const fps = fraction[1] ? fraction[0] / fraction[1] : 0;
  const id = previous?.id || randomUUID();
  const thumb = kind === "audio" ? "" : path.join(DATA, "cache", id + ".jpg");
  if (thumb)
    await run(FFMPEG, [
      "-v",
      "error",
      "-nostdin",
      "-protocol_whitelist",
      "file,pipe",
      "-i",
      p,
      "-frames:v",
      "1",
      "-vf",
      "scale=240:426:force_original_aspect_ratio=decrease",
      "-y",
      thumb,
    ]);
  return mediaSchema.parse({
    id,
    avatarId,
    role,
    kind,
    name: path.basename(p),
    path: p,
    hash,
    size: fileStat.size,
    duration:
      kind === "image" ? 0 : Number(v?.duration || info.format.duration || 0),
    width,
    height,
    fps,
    audio: a,
    codec: v?.codec_name || info.streams[0]?.codec_name || "",
    pixelFormat: v?.pix_fmt || "",
    colorTransfer: transfer,
    rotation,
    orientation:
      width === height ? "carré" : width > height ? "paysage" : "portrait",
    tags:
      previous?.tags ||
      path
        .basename(p, path.extname(p))
        .split(/[-_ ]+/)
        .filter(Boolean)
        .slice(0, 20),
    pairId: previous?.pairId || "",
    variantGroupId: previous?.variantGroupId || "",
    inPoint: previous?.inPoint || 0,
    outPoint: previous?.outPoint ?? null,
    enabled: previous?.enabled ?? true,
    missing: false,
    excludedFromIndex: previous?.excludedFromIndex ?? false,
    crop: previous?.crop || {},
    thumbnail: thumb,
    indexedAt: new Date().toISOString(),
  });
}
export async function indexAvatar(avatarId: string) {
  const avatar = get<Avatar>("avatars", avatarId);
  if (!avatar) throw new Error("Avatar introuvable.");
  const errors: { path: string; error: string }[] = [];
  let added = 0,
    updated = 0,
    missing = 0;
  const seen = new Set<string>();
  const existing = all<Media>("media").filter((m) => m.avatarId === avatarId);
  for (const [role, folder] of Object.entries(avatar.folders)) {
    if (!folder) continue;
    let files: string[] = [];
    try {
      files = await walk(folder);
    } catch (e) {
      errors.push({ path: folder, error: String(e) });
      continue;
    }
    for (const f of files) {
      if (
        ![...videoExtensions, ...imageExtensions].includes(
          path.extname(f).toLowerCase(),
        )
      )
        continue;
      try {
        const p = await checkedFile(f, [folder]);
        if (seen.has(p)) continue;
        seen.add(p);
        const old = existing.find((m) => m.path === p);
        const hash = await fingerprint(p);
        if (old && hash === old.hash) {
          if (old.missing) put("media", { ...old, missing: false });
          continue;
        }
        const m = await analyze(p, avatarId, role as Media["role"], old);
        put("media", m);
        old ? updated++ : added++;
      } catch (e) {
        const old = existing.find((m) => m.path === f);
        if (old) put("media", { ...old, missing: true });
        errors.push({ path: f, error: String(e) });
      }
    }
  }
  for (const old of existing) {
    try {
      await mediaFile(old.path);
    } catch {
      if (!old.missing) {
        put("media", { ...old, missing: true });
        missing++;
      }
    }
  }
  return { added, updated, missing, errors };
}
export async function indexOne(
  file: string,
  avatarId: string,
  role: Media["role"],
) {
  const real = await mediaFile(file);
  const old = all<Media>("media").find(
    (m) => m.path === real && m.avatarId === avatarId,
  );
  const m = await analyze(real, avatarId, role, old);
  put("media", m);
  return m;
}
export async function waveform(media: Media) {
  if (!media.audio && media.kind !== "audio")
    throw new Error("Ce fichier ne contient pas de son.");
  const p = await mediaFile(media.path);
  const result = await run(
    FFMPEG,
    [
      "-v",
      "error",
      "-nostdin",
      "-protocol_whitelist",
      "file,pipe",
      "-i",
      p,
      "-t",
      "600",
      "-vn",
      "-ac",
      "1",
      "-ar",
      "8000",
      "-f",
      "f32le",
      "pipe:1",
    ],
    { binary: true },
  );
  const b = result.buffer;
  const samples = new Float32Array(
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
  );
  const bins = 400;
  return Array.from({ length: bins }, (_, i) => {
    let max = 0;
    for (
      let j = Math.floor((i * samples.length) / bins);
      j < Math.floor(((i + 1) * samples.length) / bins);
      j++
    )
      max = Math.max(max, Math.abs(samples[j]));
    return max;
  });
}
