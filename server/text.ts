import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import path from "node:path";
import { PROJECT } from "./db.ts";
import type { Template, TextLayer } from "../shared/schema.ts";
if (
  !GlobalFonts.registerFromPath(
    path.join(PROJECT, "public/fonts/NotoSans.ttf"),
    "Studio Noto",
  )
)
  throw new Error(
    "Police Noto Sans absente. Réinstaller les fichiers public/fonts.",
  );
export function textImage(
  t: TextLayer,
  model: Template,
  width = model.width,
  height = model.height,
) {
  const canvas = createCanvas(width, height),
    c = canvas.getContext("2d"),
    scale = width / model.width;
  const size = t.size * scale,
    lineHeight = size * 1.3;
  c.font = `600 ${size}px "Studio Noto"`;
  c.textAlign = "center";
  c.textBaseline = "top";
  const lines = t.text.split("\n");
  const maxWidth = Math.max(...lines.map((l) => c.measureText(l).width));
  const h = lines.length * lineHeight;
  const cx = t.x * width,
    cy = t.y * height;
  const margin = (t.outlineWidth + (t.shadow ? 8 : 0)) * scale;
  const bounds = {
    left: cx - maxWidth / 2 - margin,
    right: cx + maxWidth / 2 + margin,
    top: cy - margin,
    bottom: cy + h + margin,
  };
  const safe = model.safeArea;
  const overflow =
    bounds.left < safe.left * width ||
    bounds.right > (1 - safe.right) * width ||
    bounds.top < safe.top * height ||
    bounds.bottom > (1 - safe.bottom) * height;
  c.lineJoin = "round";
  c.lineWidth = t.outlineWidth * 2 * scale;
  c.strokeStyle = t.outline;
  c.fillStyle = t.color;
  if (t.shadow) {
    c.shadowColor = "#000000bb";
    c.shadowBlur = 4 * scale;
    c.shadowOffsetY = 3 * scale;
  }
  lines.forEach((line, i) => {
    if (t.outlineWidth) c.strokeText(line, cx, cy + i * lineHeight);
    c.fillText(line, cx, cy + i * lineHeight);
  });
  return { png: canvas.toBuffer("image/png"), overflow, bounds };
}
export function checkTexts(t: Template) {
  return t.texts
    .filter((x) => textImage(x, t).overflow)
    .map(
      (x) =>
        `Le texte « ${x.text.slice(0, 40)} » dépasse les marges de sécurité. Réduisez sa taille, déplacez-le ou ajoutez un retour à la ligne.`,
    );
}
