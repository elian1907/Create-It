import type { Avatar, Media, Template, Task } from "../shared/schema";
export type StudioState = {
  avatars: Avatar[];
  media: Media[];
  templates: Template[];
  tasks: Task[];
  batches: any[];
  imports: any[];
  settings: {
    paused: boolean;
    concurrency: number;
    exportRoots: { id: string; name: string; path: string }[];
    musicRoots: string[];
  };
};
export async function api<T = any>(
  url: string,
  method = "GET",
  body?: unknown,
  extra?: Record<string, string>,
): Promise<T> {
  const r = await fetch("/api" + url, {
    method,
    credentials: "same-origin",
    headers: {
      "X-Studio-Client": "1",
      ...(body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...extra,
    },
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  });
  if (!r.ok) {
    let error;
    try {
      error = (await r.json()).error;
    } catch {
      error = `Erreur ${r.status}`;
    }
    throw new Error(error);
  }
  return r.json();
}
export function download(name: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const mediaUrl = (id: string) =>
  `/api/media/${encodeURIComponent(id)}/file`;
export const thumbUrl = (id: string) =>
  `/api/media/${encodeURIComponent(id)}/thumbnail`;
export const taskUrl = (id: string, asset = "video") =>
  `/api/tasks/${encodeURIComponent(id)}/${asset}`;
export const seconds = (frames: number) =>
  `${(frames / 30).toFixed(2).replace(/\.00$/, "")} s`;
