import { z } from "zod";
export const ENGINE_VERSION = "montage-1.0.0";
export const id = z.string().min(1).max(120);
export const roleSchema = z.enum(["before", "after", "neutral"]);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const cropSchema = z.object({
  mode: z.enum(["fill", "contain"]).default("fill"),
  x: z.number().min(0).max(1).default(0.5),
  y: z.number().min(0).max(1).default(0.5),
  zoom: z.number().min(1).max(1.5).default(1),
  background: color.default("#111118"),
});
export const avatarSchema = z.object({
  id,
  name: z.string().trim().min(1).max(80),
  language: z.string().min(2).max(10).default("FR"),
  scaleItId: z.string().max(120).default(""),
  folders: z.object({
    before: z.string().max(4096).default(""),
    after: z.string().max(4096).default(""),
    neutral: z.string().max(4096).default(""),
  }),
  demo: z.boolean().default(false),
});
export const mediaSchema = z.object({
  id,
  avatarId: z.string(),
  role: z.enum(["before", "after", "neutral", "music"]),
  kind: z.enum(["video", "image", "audio"]),
  name: z.string(),
  path: z.string(),
  hash: z.string(),
  size: z.number(),
  duration: z.number(),
  width: z.number(),
  height: z.number(),
  fps: z.number(),
  audio: z.boolean(),
  codec: z.string(),
  pixelFormat: z.string(),
  colorTransfer: z.string(),
  rotation: z.number(),
  orientation: z.string(),
  tags: z.array(z.string().max(80)).max(40),
  pairId: z.string().max(120),
  variantGroupId: z.string().max(120),
  inPoint: z.number().min(0),
  outPoint: z.number().min(0).nullable(),
  enabled: z.boolean(),
  missing: z.boolean(),
  excludedFromIndex: z.boolean().default(false),
  crop: cropSchema,
  thumbnail: z.string(),
  indexedAt: z.string(),
});
export const slotSchema = z.object({
  id,
  label: z.string().min(1).max(80),
  role: z.enum(["before", "after", "neutral", "any", "image"]),
  frames: z.number().int().min(1).max(18000),
  tags: z.array(z.string().max(80)).max(40).default([]),
  selection: z.enum(["auto", "fixed", "manual"]).default("auto"),
  mediaId: z.string().default(""),
  matchSlotId: z.string().default(""),
  pairId: z.string().default(""),
  variantGroupId: z.string().default(""),
  inPoint: z.number().min(0).max(36000).nullable().default(null),
  speed: z.number().min(0.5).max(2).default(1),
  shortPolicy: z.enum(["reject", "freeze", "loop"]).default("reject"),
  crop: cropSchema.nullable().default(null),
  transition: z.object({
    type: z.enum(["cut", "fade", "flash"]),
    frames: z.number().int().min(0).max(120),
  }),
  originalAudio: z.boolean().default(false),
});
export const textSchema = z.object({
  id,
  text: z.string().min(1).max(500),
  startFrame: z.number().int().min(0),
  endFrame: z.number().int().min(1),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  size: z.number().min(12).max(200),
  color: color,
  outline: color,
  outlineWidth: z.number().min(0).max(12),
  shadow: z.boolean(),
  font: z.literal("Noto Sans"),
});
export const musicSchema = z.object({
  mediaId: id,
  start: z.number().min(0).max(36000),
  volume: z.number().min(0).max(2),
  fadeIn: z.number().min(0).max(60),
  fadeOut: z.number().min(0).max(60),
  loop: z.boolean(),
  title: z.string().max(200),
  sourceUrl: z.string().max(1000),
});
export const templateSchema = z
  .object({
    id,
    version: z.number().int().min(1),
    name: z.string().trim().min(1).max(100),
    fps: z.literal(30),
    width: z
      .number()
      .int()
      .min(240)
      .max(1920)
      .refine((n) => n % 2 === 0),
    height: z
      .number()
      .int()
      .min(240)
      .max(1920)
      .refine((n) => n % 2 === 0),
    slots: z.array(slotSchema).min(1).max(35),
    music: musicSchema.nullable(),
    texts: z.array(textSchema).max(20),
    markers: z.array(z.number().int().min(0)).max(100),
    safeArea: z.object({
      top: z.number().min(0).max(0.4),
      bottom: z.number().min(0).max(0.4),
      left: z.number().min(0).max(0.4),
      right: z.number().min(0).max(0.4),
    }),
    pairMode: z.enum(["free", "paired"]),
    preferLeastUsed: z.boolean(),
    createdAt: z.string().optional(),
  })
  .superRefine((t, c) => {
    const total = t.slots.reduce((a, s) => a + s.frames, 0);
    if (total > 18000)
      c.addIssue({ code: "custom", message: "Durée maximale : 10 minutes." });
    if (new Set(t.slots.map((s) => s.id)).size !== t.slots.length)
      c.addIssue({
        code: "custom",
        message: "Identifiants de plans dupliqués.",
      });
    t.slots.forEach((s, i) => {
      if (
        (i === t.slots.length - 1 || s.transition.type === "cut") &&
        s.transition.frames !== 0
      )
        c.addIssue({
          code: "custom",
          message:
            "La dernière transition et les coupes doivent avoir 0 image.",
        });
      if (
        s.transition.type !== "cut" &&
        (s.transition.frames < 1 ||
          s.transition.frames > Math.min(s.frames, t.slots[i + 1]?.frames ?? 0))
      )
        c.addIssue({
          code: "custom",
          message: "Transition trop longue ou vide.",
        });
      if (
        s.matchSlotId &&
        !t.slots.slice(0, i).some((x) => x.id === s.matchSlotId)
      )
        c.addIssue({
          code: "custom",
          message: "Une correspondance doit viser un plan précédent.",
        });
    });
    for (const text of t.texts)
      if (text.endFrame > total || text.endFrame <= text.startFrame)
        c.addIssue({
          code: "custom",
          message: "Durée du texte hors timeline.",
        });
    if (t.markers.some((m) => m >= total))
      c.addIssue({ code: "custom", message: "Repère hors timeline." });
  });
export const batchSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    avatarIds: z.array(id).min(1).max(100),
    templateIds: z.array(id).min(1).max(40),
    count: z.number().int().min(1).max(100),
    seed: z.string().min(1).max(100),
    language: z.string().min(2).max(10).default("FR"),
    profile: z.enum(["final", "preview"]).default("final"),
    demo: z.boolean().default(false),
    exportRootId: z.string().default("default"),
    externalRunId: z.string().default(""),
    externalItems: z.record(z.string(), z.string()).default({}),
  })
  .refine(
    (b) =>
      new Set(b.avatarIds).size === b.avatarIds.length &&
      new Set(b.templateIds).size === b.templateIds.length,
    { message: "Sélections dupliquées." },
  )
  .refine((b) => b.avatarIds.length * b.templateIds.length * b.count <= 500, {
    message: "Maximum 500 vidéos par lot.",
  });
export const statuses = [
  "queued",
  "preparing",
  "rendering",
  "validating",
  "completed",
  "failed",
  "cancelled",
  "interrupted",
] as const;
export type Avatar = z.infer<typeof avatarSchema>;
export type Media = z.infer<typeof mediaSchema>;
export type Template = z.infer<typeof templateSchema>;
export type Slot = z.infer<typeof slotSchema>;
export type TextLayer = z.infer<typeof textSchema>;
export type BatchInput = z.infer<typeof batchSchema>;
export type Recipe = {
  schemaVersion: 1;
  engineVersion: string;
  seed: string;
  avatar: Pick<Avatar, "id" | "name" | "scaleItId">;
  template: Template;
  profile: "final" | "preview";
  width: number;
  height: number;
  fps: 30;
  totalFrames: number;
  language: string;
  demo: boolean;
  clips: {
    slot: Slot;
    media: Media;
    startFrame: number;
    renderFrames: number;
    inPoint: number;
    speed: number;
  }[];
  music: { settings: z.infer<typeof musicSchema>; media: Media } | null;
  externalRunId: string;
  externalItemId: string;
};
export type Task = {
  id: string;
  batchId: string;
  recipeHash: string;
  recipe: Recipe;
  status: (typeof statuses)[number];
  progress: number;
  phase: string;
  attempts: number;
  error: string;
  outputDir: string;
  createdAt: string;
  updatedAt: string;
  result?: Result;
};
export type Result = {
  taskId: string;
  externalRunId: string;
  externalItemId: string;
  avatar: Recipe["avatar"];
  template: { id: string; version: number; name: string };
  status: "completed";
  demo: boolean;
  profile: string;
  path: string;
  thumbnail: string;
  recipePath: string;
  file: {
    size: number;
    duration: number;
    width: number;
    height: number;
    fps: number;
    frames: number;
    videoCodec: string;
    audioCodec: string | null;
    hash: string;
  };
  validatedAt: string;
};
export const duration = (t: Template) =>
  t.slots.reduce((n, s) => n + s.frames, 0) / t.fps;
export const roleLabels: Record<string, string> = {
  before: "Avant",
  after: "Après",
  neutral: "Neutre",
  any: "Libre",
  image: "Image",
  music: "Musique",
};
export const statusLabels: Record<Task["status"], string> = {
  queued: "En attente",
  preparing: "Préparation",
  rendering: "Rendu",
  validating: "Validation",
  completed: "Terminé",
  failed: "Échec",
  cancelled: "Annulé",
  interrupted: "Interrompu",
};
export function starterTemplates(): Template[] {
  return [
    ["revelation-12", "Révélation 12 s", [120, 150, 90], true],
    ["avant-apres-10", "Avant / Après 10 s", [90, 210], false],
    [
      "transformation-cta-15",
      "Transformation avec CTA 15 s",
      [120, 210, 120],
      true,
    ],
  ].map(([id, name, lengths, cta]) =>
    templateSchema.parse({
      id,
      version: 1,
      name,
      fps: 30,
      width: 1080,
      height: 1920,
      slots: (lengths as number[]).map((frames, i, arr) => ({
        id: `plan-${i + 1}`,
        label:
          i === 0 ? "Avant" : i === 1 ? "Révélation" : "Après · conclusion",
        role: i === 0 ? "before" : "after",
        frames,
        transition: {
          type: i === 0 && id === "revelation-12" ? "flash" : "cut",
          frames: i === 0 && id === "revelation-12" ? 6 : 0,
        },
      })),
      music: null,
      texts: cta
        ? [
            {
              id: "cta",
              text: "Découvre Loslo",
              startFrame: (lengths as number[]).reduce((a, b) => a + b) - 90,
              endFrame: (lengths as number[]).reduce((a, b) => a + b),
              x: 0.5,
              y: 0.72,
              size: 62,
              color: "#ffffff",
              outline: "#000000",
              outlineWidth: 4,
              shadow: true,
              font: "Noto Sans",
            },
          ]
        : [],
      markers: [(lengths as number[])[0]],
      safeArea: { top: 0.08, bottom: 0.18, left: 0.08, right: 0.08 },
      pairMode: "free",
      preferLeastUsed: true,
    }),
  );
}
export const recipeSchema = z.object({
  schemaVersion: z.literal(1),
  engineVersion: z.literal(ENGINE_VERSION),
  seed: z.string().min(1).max(1000),
  avatar: avatarSchema.pick({ id: true, name: true, scaleItId: true }),
  template: templateSchema,
  profile: z.enum(["final", "preview"]),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.literal(30),
  totalFrames: z.number().int().positive(),
  language: z.string().min(2).max(10),
  demo: z.boolean(),
  clips: z
    .array(
      z.object({
        slot: slotSchema,
        media: mediaSchema,
        startFrame: z.number().int().min(0),
        renderFrames: z.number().int().positive(),
        inPoint: z.number().min(0),
        speed: z.number().min(0.5).max(2),
      }),
    )
    .min(1)
    .max(35),
  music: z.object({ settings: musicSchema, media: mediaSchema }).nullable(),
  externalRunId: z.string().max(120),
  externalItemId: z.string().max(120),
});
