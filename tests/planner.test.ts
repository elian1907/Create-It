import { describe, it, expect } from "vitest";
import {
  avatarSchema,
  mediaSchema,
  starterTemplates,
  templateSchema,
  type Media,
  type Template,
} from "../shared/schema.ts";
import {
  selectRecipe,
  recipeHash,
  validateRecipeShape,
} from "../server/planner.ts";
import { normalizeEnvelope } from "../server/scale-it.ts";
import {
  digest,
  within,
  checkedFile,
  safeOutputParent,
} from "../server/files.ts";
import { textImage, checkTexts } from "../server/text.ts";
import { mkdtemp, writeFile, symlink, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { DATA } from "../server/db.ts";
const avatar = avatarSchema.parse({ id: "a", name: "Avatar A", folders: {} });
const model = starterTemplates()[0];
function media(id: string, role = "before", patch: Partial<Media> = {}): Media {
  return mediaSchema.parse({
    id,
    avatarId: "a",
    role,
    kind: "video",
    name: id + ".mp4",
    path: "/test/" + id + ".mp4",
    hash: digest(id),
    size: 100,
    duration: 20,
    width: 360,
    height: 640,
    fps: 30,
    audio: false,
    codec: "h264",
    pixelFormat: "yuv420p",
    colorTransfer: "",
    rotation: 0,
    orientation: "portrait",
    tags: ["salon"],
    pairId: "p1",
    variantGroupId: "v1",
    inPoint: 0,
    outPoint: null,
    enabled: true,
    missing: false,
    crop: {},
    thumbnail: "",
    indexedAt: "test",
    ...patch,
  });
}
const source = [media("before"), media("after", "after")];
const select = (
  t = model,
  m = source,
  seed = "same-seed",
  reserved?: Set<string>,
) =>
  selectRecipe({
    avatar,
    template: t,
    media: m,
    seed,
    profile: "final",
    reserved,
  });
describe("Sélection déterministe et contraintes", () => {
  it("reproduit exactement les décisions pour la même seed et les mêmes fichiers", () => {
    const m = [...source, media("before2"), media("after2", "after")];
    expect(select(model, m)).toEqual(select(model, m));
    expect(recipeHash(select(model, m))).toBe(recipeHash(select(model, m)));
  });
  it("rejoue une seed enregistrée même si l’historique a changé", () => {
    const m = [...source, media("new")];
    const r = selectRecipe({
      avatar,
      template: model,
      media: m,
      seed: "initial",
      profile: "final",
      usage: new Map([[source[0].hash, 9]]),
    });
    const replay = selectRecipe({
      avatar,
      template: model,
      media: m,
      seed: r.seed,
      profile: "final",
      usage: new Map([[m[2].hash, 50]]),
    });
    expect(replay).toEqual(r);
  });
  it("refuse les ressources d’un autre avatar", () =>
    expect(() =>
      select(
        model,
        source.map((m) => ({ ...m, avatarId: "b" })),
      ),
    ).toThrow(/aucune ressource/));
  it("refuse une ressource absente, exclue ou trop courte avec marge", () => {
    for (const patch of [
      { missing: true },
      { enabled: false },
      { duration: 4.2 },
      { outPoint: 1 },
    ])
      expect(() =>
        select(model, [media("before", "before", patch), source[1]]),
      ).toThrow(/aucune ressource/);
  });
  it("autorise un prolongement uniquement quand demandé explicitement", () => {
    const t = structuredClone(model);
    t.slots[0].shortPolicy = "freeze";
    expect(
      select(t, [media("before", "before", { duration: 1 }), source[1]])
        .clips[0].slot.shortPolicy,
    ).toBe("freeze");
  });
  it("respecte les tags requis et les groupes", () => {
    const t = structuredClone(model);
    t.slots[0].tags = ["jardin"];
    expect(() => select(t)).toThrow(/aucune ressource/);
    t.slots[0].tags = ["salon"];
    t.slots[0].variantGroupId = "autre";
    expect(() => select(t)).toThrow(/aucune ressource/);
  });
  it("associe les paires et ne remplace pas une paire incompatible", () => {
    const t = { ...model, pairMode: "paired" as const };
    expect(() =>
      select(t, [source[0], media("after", "after", { pairId: "p2" })]),
    ).toThrow(/combinaison/);
    expect(select(t).clips.every((c) => c.media.pairId === "p1")).toBe(true);
  });
  it("revient en arrière pour trouver une paire complète", () => {
    const t = { ...model, pairMode: "paired" as const };
    const r = select(t, [media("bad", "before", { pairId: "bad" }), ...source]);
    expect(r.clips[0].media.id).toBe("before");
  });
  it("respecte une correspondance explicite avec un plan précédent", () => {
    const t = structuredClone(model);
    t.slots[1].matchSlotId = t.slots[0].id;
    expect(() =>
      select(t, [source[0], media("after", "after", { pairId: "p2" })]),
    ).toThrow(/combinaison/);
  });
  it("verrouille le fichier et laisse les autres emplacements variables", () => {
    const t = structuredClone(model);
    t.slots[0].selection = "fixed";
    t.slots[0].mediaId = "before";
    expect(
      select(t, [...source, media("other")], "other seed").clips[0].media.id,
    ).toBe("before");
  });
  it("refuse une image choisie implicitement", () => {
    const t = structuredClone(model);
    t.slots[0].role = "image";
    expect(() => select(t)).toThrow(/image.*explicitement/);
  });
  it("détecte un doublon de contenu même si noms, identifiants et seed changent", () => {
    const r = select();
    const copy = structuredClone(r);
    copy.seed = "different";
    for (const c of copy.clips) {
      c.media.id += "copy";
      c.media.name = "renommé.mp4";
      c.media.path = "/elsewhere.mp4";
    }
    expect(recipeHash(copy)).toBe(recipeHash(r));
    expect(() =>
      select(model, source, "seed2", new Set([recipeHash(r)])),
    ).toThrow(/combinaison/);
  });
  it("préfère une ressource moins utilisée dans un lot", () => {
    const r = selectRecipe({
      avatar,
      template: model,
      media: [...source, media("new")],
      seed: "test",
      profile: "final",
      usage: new Map([[source[0].hash, 9]]),
    });
    expect(r.clips[0].media.id).toBe("new");
  });
  it("refuse une musique absente et trop courte, sans boucle implicite", () => {
    const t = structuredClone(model);
    t.music = {
      mediaId: "music",
      start: 0,
      volume: 1,
      fadeIn: 0,
      fadeOut: 0,
      loop: false,
      title: "",
      sourceUrl: "",
    };
    expect(() => select(t)).toThrow(/Musique absente/);
    const m = media("music", "music", {
      kind: "audio",
      avatarId: "",
      audio: true,
      duration: 4,
    });
    expect(() => select(t, [...source, m])).toThrow(/Musique trop courte/);
    t.music.loop = true;
    expect(select(t, [...source, m]).music).toBeTruthy();
  });
  it("valide les recettes complètes et rejette les champs truqués", () => {
    const r = select();
    expect(validateRecipeShape(r)).toEqual(r);
    const bad = structuredClone(r);
    bad.clips[1].media.avatarId = "b";
    expect(() => validateRecipeShape(bad)).toThrow(/avatar/);
    const invalid = structuredClone(r);
    invalid.width = 20;
    expect(() => validateRecipeShape(invalid)).toThrow(/Dimensions/);
  });
});
describe("Timeline, texte et fichiers", () => {
  it("conserve les bornes nominales et une marge de transition explicite", () => {
    const r = select();
    expect(r.totalFrames).toBe(360);
    expect(r.clips.map((c) => c.startFrame)).toEqual([0, 120, 270]);
    expect(r.clips[0].renderFrames).toBe(127);
  });
  it("rejette les durées et transitions incohérentes", () => {
    const t = structuredClone(model);
    t.slots[0].frames = 1.5;
    expect(() => templateSchema.parse(t)).toThrow();
    t.slots[0].frames = 120;
    t.slots[2].transition = { type: "fade", frames: 10 };
    expect(() => templateSchema.parse(t)).toThrow();
  });
  it("rasterise le français avec contour et signale les débordements", () => {
    const t = structuredClone(model);
    t.texts[0].text = "Été, déjà !\nDécouvre Loslo";
    t.texts[0].size = 42;
    t.texts[0].y = 0.65;
    const image = textImage(t.texts[0], t);
    expect(image.png.length).toBeGreaterThan(1000);
    expect(checkTexts(t)).toEqual([]);
    t.texts[0].x = 0.02;
    expect(checkTexts(t).length).toBe(1);
  });
  it("empêche les chemins frères et traversées de périmètre", () => {
    expect(within("/media2/a.mp4", "/media")).toBe(false);
    expect(within("/media/../secret", "/media")).toBe(false);
    expect(within("/media/a file.mp4", "/media")).toBe(true);
  });
  it("rejette un lien symbolique vers un média hors du dossier", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "montage-paths-"));
    const allowed = path.join(root, "allowed");
    await mkdir(allowed);
    const file = path.join(root, "secret.mp4");
    await writeFile(file, "secret");
    await symlink(file, path.join(allowed, "link.mp4"));
    await expect(
      checkedFile(path.join(allowed, "link.mp4"), [allowed]),
    ).rejects.toThrow(/hors/);
  });
  it("ne crée rien derrière un parent de sortie symbolique", async () => {
    const outside = await mkdtemp(path.join(os.tmpdir(), "montage-outside-"));
    await symlink(outside, path.join(DATA, "exports", "outbound"));
    await expect(
      safeOutputParent(
        path.join(DATA, "exports", "outbound", "created", "video"),
      ),
    ).rejects.toThrow(/symbolique/);
    await expect(readFile(path.join(outside, "created"))).rejects.toThrow();
  });
});
describe("Adaptateur Scale It", () => {
  function envelope() {
    const model = {
      id: "ext-model",
      name: "Scale Test",
      kind: "video",
      duration: 12,
      music: "Son à 4 s",
      cta: "Découvre Loslo",
      slots: [
        { label: "Avant", category: "before", duration: 4 },
        { label: "Après", category: "after", duration: 5 },
        { label: "Conclusion", category: "any", duration: 3 },
      ],
    };
    return {
      version: 1,
      exportedAt: "2026-09-12",
      run: {
        id: "ext-run",
        kind: "video",
        modelId: model.id,
        modelName: model.name,
        modelSnapshot: model,
        items: [
          {
            id: "item-1",
            avatarId: "a",
            avatarName: "A",
            status: "awaiting_studio",
            outputIds: [],
            posts: [{ platform: "tiktok" }, { platform: "instagram" }],
          },
        ],
        paused: true,
        demo: true,
      },
      model,
      avatars: [
        { id: "a", name: "A" },
        { id: "a", name: "A" },
      ],
      media: [{ url: "https://private.invalid/secret" }],
      note: "test",
    };
  }
  it("déduplique les avatars, conserve un contenu pour deux destinations et ne résout aucun URL", () => {
    const r = normalizeEnvelope(envelope());
    expect(r.envelope.avatars.length).toBe(1);
    expect(r.envelope.run.items.length).toBe(1);
    expect(r.proposal.slots.map((s) => s.frames)).toEqual([120, 150, 90]);
    expect(r.proposal.music).toBe(null);
    expect(r.issues.join(" ")).toMatch(/action explicite/);
  });
  it("exige une image pour une catégorie carousel", () => {
    const e = envelope();
    e.model.slots[2].category = "carousel";
    const r = normalizeEnvelope(e);
    expect(r.proposal.slots[2].role).toBe("image");
    expect(r.proposal.slots[2].selection).toBe("manual");
  });
  it("refuse une enveloppe non vidéo ou un modèle non figé incohérent", () => {
    const e = envelope();
    (e.run as any).kind = "carousel";
    expect(() => normalizeEnvelope(e)).toThrow();
    const e2 = envelope();
    e2.model = structuredClone(e2.model);
    e2.model.name = "différent";
    expect(() => normalizeEnvelope(e2)).toThrow(/copies/);
  });
});
