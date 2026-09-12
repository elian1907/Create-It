import {
  ENGINE_VERSION,
  templateSchema,
  recipeSchema,
  type Avatar,
  type Media,
  type Template,
  type Recipe,
  type Slot,
} from "../shared/schema.ts";
import { digest } from "./files.ts";
import { checkTexts } from "./text.ts";
export function availableFrames(media: Media, slot: Slot, fps: number) {
  const start = slot.inPoint ?? media.inPoint;
  const end = Math.min(media.outPoint ?? media.duration, media.duration);
  return Math.floor(((end - start) / slot.speed) * fps + 1e-5);
}
function admissible(m: Media, s: Slot, a: Avatar, t: Template) {
  return (
    m.avatarId === a.id &&
    m.kind !== "audio" &&
    !m.missing &&
    !m.excludedFromIndex &&
    (m.enabled || s.selection !== "auto") &&
    (s.role === "image"
      ? m.kind === "image"
      : s.role === "any" || m.role === s.role) &&
    (s.role !== "image" || s.selection !== "auto") &&
    (s.selection === "auto" || m.id === s.mediaId) &&
    s.tags.every((tag) => m.tags.includes(tag)) &&
    (!s.pairId || m.pairId === s.pairId) &&
    (!s.variantGroupId || m.variantGroupId === s.variantGroupId) &&
    (m.kind === "image" ||
      availableFrames(m, s, t.fps) >=
        s.frames +
          s.transition.frames +
          (s.transition.type === "cut" ? 0 : 1) ||
      (s.shortPolicy !== "reject" && availableFrames(m, s, t.fps) > 0))
  );
}
export function recipeHash(r: Recipe) {
  return digest({
    engine: r.engineVersion,
    output: [r.width, r.height, r.fps, r.totalFrames],
    clips: r.clips.map((c) => ({
      hash: c.media.hash,
      frames: c.slot.frames,
      renderFrames: c.renderFrames,
      start: c.inPoint,
      speed: c.speed,
      shortPolicy: c.slot.shortPolicy,
      crop: c.slot.crop ?? c.media.crop,
      transition: c.slot.transition,
      originalAudio: c.slot.originalAudio,
      trimEnd: c.media.outPoint,
    })),
    music: r.music
      ? {
          hash: r.music.media.hash,
          ...r.music.settings,
          mediaId: undefined,
          title: undefined,
          sourceUrl: undefined,
        }
      : null,
    texts: r.template.texts.map(({ id, ...t }) => t),
  });
}
export function selectRecipe(options: {
  avatar: Avatar;
  template: Template;
  media: Media[];
  seed: string;
  profile: "final" | "preview";
  language?: string;
  demo?: boolean;
  reserved?: Set<string>;
  usage?: Map<string, number>;
  externalRunId?: string;
  externalItemId?: string;
}): Recipe {
  const { avatar: a, media, seed, profile } = options;
  const replay = /^(.*)::files=([0-9]+(?:,[0-9]+)*)$/.exec(seed);
  const baseSeed = replay?.[1] ?? seed;
  const replayIndices = replay?.[2].split(",").map(Number);
  const t = templateSchema.parse(options.template);
  const textErrors = checkTexts(t);
  if (textErrors.length) throw new Error(textErrors.join("\n"));
  const totalFrames = t.slots.reduce((sum, s) => sum + s.frames, 0);
  let music: Recipe["music"] = null;
  if (t.music) {
    const m = media.find(
      (m) =>
        m.id === t.music!.mediaId &&
        m.kind === "audio" &&
        !m.missing &&
        !m.excludedFromIndex,
    );
    if (!m)
      throw new Error("Musique absente : associez un fichier audio local.");
    if (
      t.music.start >= m.duration ||
      (!t.music.loop && m.duration - t.music.start + 1e-4 < totalFrames / t.fps)
    )
      throw new Error(
        "Musique trop courte pour le passage choisi. Activez explicitement la boucle ou changez de passage.",
      );
    if (t.music.fadeIn + t.music.fadeOut > totalFrames / t.fps)
      throw new Error("Les fondus musicaux dépassent la durée du modèle.");
    music = { settings: t.music, media: m };
  }
  if (replayIndices && replayIndices.length !== t.slots.length)
    throw new Error("Seed enregistrée incompatible avec le nombre de plans.");
  const canonicalCandidates: Media[][] = [];
  const candidates = t.slots.map((s, slotIndex) => {
    if (s.selection !== "auto" && !s.mediaId)
      throw new Error(`« ${s.label} » : choisissez et verrouillez un fichier.`);
    if (s.role === "image" && s.selection === "auto")
      throw new Error(
        `« ${s.label} » : une image doit être explicitement associée.`,
      );
    const found = media.filter((m) => admissible(m, s, a, t));
    if (!found.length)
      throw new Error(
        `${a.name} · « ${s.label} » : aucune ressource admissible (rôle, tags, durée + marge, exclusion ou fichier manquant).`,
      );
    const ordered = [...found].sort((x, y) =>
      (x.hash + ":" + x.id).localeCompare(y.hash + ":" + y.id),
    );
    canonicalCandidates.push(ordered);
    if (replayIndices) {
      const fixed = ordered[replayIndices[slotIndex]];
      if (!fixed)
        throw new Error(
          "Seed enregistrée incompatible avec les ressources actuelles.",
        );
      return [fixed];
    }
    return found.sort((x, y) => {
      const usage = t.preferLeastUsed
        ? (options.usage?.get(x.hash) ?? 0) - (options.usage?.get(y.hash) ?? 0)
        : 0;
      return (
        usage ||
        digest([baseSeed, s.id, x.hash, x.id]).localeCompare(
          digest([baseSeed, s.id, y.hash, y.id]),
        )
      );
    });
  });
  let result: Recipe | undefined,
    visited = 0;
  const picked: Media[] = [];
  function search(index: number) {
    if (result || visited > 100000) return;
    visited++;
    if (index === t.slots.length) {
      let start = 0;
      const r: Recipe = {
        schemaVersion: 1,
        engineVersion: ENGINE_VERSION,
        seed: `${baseSeed}::files=${picked.map((m, i) => canonicalCandidates[i].findIndex((c) => c.id === m.id)).join(",")}`,
        avatar: { id: a.id, name: a.name, scaleItId: a.scaleItId },
        template: t,
        profile,
        width:
          profile === "preview" ? Math.round(t.width / 3 / 2) * 2 : t.width,
        height:
          profile === "preview" ? Math.round(t.height / 3 / 2) * 2 : t.height,
        fps: 30,
        totalFrames,
        language: options.language || a.language,
        demo: options.demo || a.demo,
        clips: t.slots.map((slot, i) => {
          const c = {
            slot,
            media: picked[i],
            startFrame: start,
            renderFrames:
              slot.frames +
              slot.transition.frames +
              (slot.transition.type === "cut" ? 0 : 1),
            inPoint: slot.inPoint ?? picked[i].inPoint,
            speed: slot.speed,
          };
          start += slot.frames;
          return c;
        }),
        music,
        externalRunId: options.externalRunId || "",
        externalItemId: options.externalItemId || "",
      };
      if (!options.reserved?.has(recipeHash(r))) result = r;
      return;
    }
    const s = t.slots[index];
    for (const m of candidates[index]) {
      if (
        t.pairMode === "paired" &&
        (!m.pairId || (index > 0 && m.pairId !== picked[0].pairId))
      )
        continue;
      if (s.matchSlotId) {
        const other = picked[t.slots.findIndex((x) => x.id === s.matchSlotId)];
        if (!m.pairId || m.pairId !== other?.pairId) continue;
      }
      picked.push(m);
      search(index + 1);
      picked.pop();
      if (result) return;
    }
  }
  search(0);
  if (!result)
    throw new Error(
      visited > 100000
        ? "Recherche limitée à 100 000 combinaisons. Réduisez les candidats ou verrouillez certains plans."
        : "Aucune nouvelle combinaison compatible : vérifiez les paires, ajoutez des clips ou modifiez le modèle. Les recettes déjà réservées ne sont pas reproduites.",
    );
  return result;
}
export function validateRecipeShape(value: unknown): Recipe {
  const r = recipeSchema.parse(value) as Recipe;
  if (
    !r ||
    r.schemaVersion !== 1 ||
    r.engineVersion !== ENGINE_VERSION ||
    !Array.isArray(r.clips) ||
    !r.avatar?.id
  )
    throw new Error("Recette invalide ou version du moteur incompatible.");
  const t = templateSchema.parse(r.template);
  if (
    r.fps !== 30 ||
    !["preview", "final"].includes(r.profile) ||
    r.width !==
      (r.profile === "preview" ? Math.round(t.width / 3 / 2) * 2 : t.width) ||
    r.height !==
      (r.profile === "preview" ? Math.round(t.height / 3 / 2) * 2 : t.height) ||
    r.totalFrames !== t.slots.reduce((n, s) => n + s.frames, 0) ||
    r.clips.length !== t.slots.length
  )
    throw new Error("Dimensions ou durée de recette incohérentes.");
  let start = 0;
  r.clips.forEach((c, i) => {
    if (
      c.media.avatarId !== r.avatar.id ||
      digest(c.slot) !== digest(t.slots[i]) ||
      c.startFrame !== start ||
      c.renderFrames !==
        c.slot.frames +
          c.slot.transition.frames +
          (c.slot.transition.type === "cut" ? 0 : 1) ||
      c.inPoint !== (c.slot.inPoint ?? c.media.inPoint) ||
      c.speed !== c.slot.speed
    )
      throw new Error("Recette incohérente : plan ou avatar.");
    if (!admissible(c.media, c.slot, { id: r.avatar.id } as Avatar, t))
      throw new Error("Ressource incompatible avec les contraintes du plan.");
    if (
      t.pairMode === "paired" &&
      (!c.media.pairId || c.media.pairId !== r.clips[0].media.pairId)
    )
      throw new Error("Paire incompatible.");
    if (
      c.slot.matchSlotId &&
      (!c.media.pairId ||
        c.media.pairId !==
          r.clips.find((x) => x.slot.id === c.slot.matchSlotId)?.media.pairId)
    )
      throw new Error("Correspondance de paire invalide.");
    start += c.slot.frames;
  });
  if (
    !!r.music !== !!t.music ||
    (r.music && digest(r.music.settings) !== digest(t.music))
  )
    throw new Error("Musique incohérente.");
  if (
    r.music &&
    (r.music.media.kind !== "audio" ||
      r.music.media.id !== r.music.settings.mediaId ||
      r.music.settings.start >= r.music.media.duration ||
      (!r.music.settings.loop &&
        r.music.media.duration - r.music.settings.start < r.totalFrames / 30))
  )
    throw new Error("Musique invalide ou trop courte.");
  if (checkTexts(t).length) throw new Error(checkTexts(t).join("\n"));
  return r;
}
