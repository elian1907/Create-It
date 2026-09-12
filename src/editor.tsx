import { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowLeft,
  Save,
  Copy,
  Download,
  Undo2,
  Redo2,
  Play,
  Pause,
  Plus,
  Trash2,
  Music2,
  Type,
  Film,
  SlidersHorizontal,
  Lock,
  Unlock,
  ChevronLeft,
  ChevronRight,
  VolumeX,
  Maximize,
  Flag,
  Scissors,
  RefreshCw,
  Upload,
  Eye,
  LoaderCircle,
} from "lucide-react";
import {
  api,
  download,
  mediaUrl,
  thumbUrl,
  seconds,
  type StudioState,
} from "./api";
import { Button, Field, Badge, Notice, Empty, TagInput } from "./ui";
import {
  starterTemplates,
  slotSchema,
  cropSchema,
  roleLabels,
  type Template,
  type Slot,
  type TextLayer,
  type Recipe,
  type Task,
  type Media,
} from "../shared/schema";
import { ImportModal } from "./pages";
import type { Run } from "./main";
const clone = <T,>(v: T) => structuredClone(v);
export function Editor({
  state,
  templateId,
  run,
  navigate,
  view,
}: {
  state: StudioState;
  templateId: string;
  run: Run;
  navigate: (s: string) => void;
  view: (t: Task) => void;
}) {
  const initial =
    state.templates.find((t) => t.id === templateId) || starterTemplates()[0];
  const [t, setT] = useState<Template>(clone(initial));
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [undo, setUndo] = useState<Template[]>([]),
    [redo, setRedo] = useState<Template[]>([]);
  const [avatar, setAvatar] = useState(state.avatars[0]?.id || "");
  const [selected, setSelected] = useState(0),
    [panel, setPanel] = useState("plan");
  const [frame, setFrame] = useState(0),
    [playing, setPlaying] = useState(false);
  const [recipe, setRecipe] = useState<Recipe>();
  const [problem, setProblem] = useState("");
  const [seed, setSeed] = useState("apercu-1");
  const [previewId, setPreviewId] = useState("");
  const [showSafe, setShowSafe] = useState(true);
  const [libraryRole, setLibraryRole] = useState("");
  const [importing, setImporting] = useState(false);
  const [wave, setWave] = useState<number[]>([]);
  const [versions, setVersions] = useState<Template[]>([]);
  const video = useRef<HTMLVideoElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const timeline = useRef<HTMLDivElement>(null);
  const dragIndex = useRef(-1);
  const total = t.slots.reduce((sum, s) => sum + s.frames, 0);
  const slot = t.slots[Math.min(selected, t.slots.length - 1)];
  const dirty = JSON.stringify(t) !== saved;
  const commit = (next: Template) => {
    setUndo((h) => [...h.slice(-49), clone(t)]);
    setRedo([]);
    setT(next);
  };
  const undoEdit = () => {
    if (!undo.length) return;
    setRedo((r) => [...r, clone(t)]);
    setT(undo[undo.length - 1]);
    setUndo(undo.slice(0, -1));
  };
  const redoEdit = () => {
    if (!redo.length) return;
    setUndo((h) => [...h, clone(t)]);
    setT(redo[redo.length - 1]);
    setRedo(redo.slice(0, -1));
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redoEdit() : undoEdit();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });
  const updateSlot = (patch: Partial<Slot>) =>
    commit({
      ...t,
      slots: t.slots.map((s, i) => (i === selected ? { ...s, ...patch } : s)),
    });
  const updateCrop = (patch: any) =>
    updateSlot({
      crop: {
        ...(slot.crop ??
          recipe?.clips[selected]?.media.crop ??
          cropSchema.parse({})),
        ...patch,
      },
    });
  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(() => {
      if (!avatar) {
        setRecipe(undefined);
        setProblem("Ajoutez un avatar pour prévisualiser ses ressources.");
        return;
      }
      api<Recipe>("/selection", "POST", { template: t, avatarId: avatar, seed })
        .then((r) => {
          if (!cancelled) {
            setRecipe(r);
            setProblem("");
          }
        })
        .catch((e) => {
          if (!cancelled) {
            setRecipe(undefined);
            setProblem(e.message);
          }
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [t, avatar, seed, JSON.stringify(state.media)]);
  useEffect(() => {
    const id = t.music?.mediaId;
    if (id)
      api<number[]>("/media/" + id + "/waveform")
        .then(setWave)
        .catch(() => setWave([]));
    else setWave([]);
  }, [t.music?.mediaId]);
  useEffect(() => {
    if (frame >= total) setFrame(Math.max(0, total - 1));
  }, [total]);
  useEffect(() => {
    if (!playing) return;
    const start = performance.now();
    const begin = frame;
    let id: number;
    const tick = (now: number) => {
      const next = begin + Math.floor((now - start) * 0.03);
      if (next >= total) {
        setFrame(total - 1);
        setPlaying(false);
        return;
      }
      setFrame(next);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [playing, total]);
  useEffect(() => {
    if (audio.current && t.music) audio.current.currentTime = t.music.start;
  }, [t.music?.start, t.music?.mediaId, panel]);
  const current =
    recipe?.clips.find(
      (c) => frame >= c.startFrame && frame < c.startFrame + c.slot.frames,
    ) || recipe?.clips[0];
  const currentCrop =
    current?.slot.crop ?? current?.media.crop ?? cropSchema.parse({});
  useEffect(() => {
    const el = video.current;
    if (!el || !current) return;
    const relative = (frame - current.startFrame) / 30;
    const end = Math.min(
      current.media.outPoint ?? current.media.duration,
      current.media.duration,
    );
    const sourceLength = end - current.inPoint;
    let time = current.inPoint + relative * current.speed;
    if (time >= end && current.slot.shortPolicy === "loop")
      time = current.inPoint + ((relative * current.speed) % sourceLength);
    time = Math.min(
      Math.max(current.inPoint, time),
      Math.max(current.inPoint, end - 1 / 30),
    );
    if (Math.abs(el.currentTime - time) > 0.09) el.currentTime = time;
    el.playbackRate = current.speed;
    if (playing && time < end - 1 / 30) void el.play().catch(() => {});
    else el.pause();
  }, [frame, playing, current?.media.id]);
  const save = async () => {
    const value = await run(
      () => api<Template>("/templates", "POST", t),
      "Nouvelle version enregistrée",
    );
    if (value) {
      setT(value);
      setSaved(JSON.stringify(value));
    }
    return value;
  };
  const renderPreview = async () => {
    setPlaying(false);
    const savedTemplate = dirty ? await save() : t;
    if (!savedTemplate) return;
    const result = await run(
      () =>
        api<Task>("/previews", "POST", {
          avatarId: avatar,
          templateId: savedTemplate.id,
          seed,
        }),
      "Aperçu ajouté à la file",
    );
    if (result) setPreviewId(result.id);
  };
  const preview = state.tasks.find((x) => x.id === previewId);
  const library = state.media.filter(
    (m) =>
      m.avatarId === avatar &&
      m.kind !== "audio" &&
      (!libraryRole || m.role === libraryRole),
  );
  function reorder(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || to >= t.slots.length) return;
    const slots = clone(t.slots);
    const [moved] = slots.splice(from, 1);
    slots.splice(to, 0, moved);
    slots.forEach((s, i) => {
      if (i === slots.length - 1) s.transition = { type: "cut", frames: 0 };
      if (
        s.matchSlotId &&
        !slots.slice(0, i).some((x) => x.id === s.matchSlotId)
      )
        s.matchSlotId = "";
    });
    commit({ ...t, slots });
    setSelected(to);
  }
  function resize(e: React.PointerEvent, index: number) {
    e.preventDefault();
    e.stopPropagation();
    if (index >= t.slots.length - 1) return;
    const original = clone(t);
    const x = e.clientX;
    const width = timeline.current?.clientWidth || 600;
    let latest = t;
    const move = (ev: PointerEvent) => {
      const delta = Math.round(((ev.clientX - x) / width) * total);
      const pair =
        original.slots[index].frames + original.slots[index + 1].frames;
      const first = Math.max(
        1,
        Math.min(pair - 1, original.slots[index].frames + delta),
      );
      latest = {
        ...original,
        slots: original.slots.map((s, i) =>
          i === index
            ? { ...s, frames: first }
            : i === index + 1
              ? { ...s, frames: pair - first }
              : s,
        ),
      };
      setT(latest);
    };
    const end = () => {
      setUndo((h) => [...h.slice(-49), original]);
      setRedo([]);
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", end);
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", end, { once: true });
  }
  return (
    <>
      <div className="editor-toolbar">
        <div className="editor-name">
          <button
            className="icon-button"
            aria-label="Retour aux modèles"
            onClick={() => {
              if (
                !dirty ||
                confirm("Quitter avec des modifications non enregistrées ?")
              )
                navigate("templates");
            }}
          >
            <ArrowLeft size={19} />
          </button>
          <div>
            <input
              aria-label="Nom du modèle"
              value={t.name}
              onChange={(e) => commit({ ...t, name: e.target.value })}
            />
            <small>
              Version {t.version} ·{" "}
              {dirty
                ? "Modifications non enregistrées"
                : "Toutes les modifications sont enregistrées"}
            </small>
          </div>
        </div>
        <div className="actions">
          <Button
            small
            disabled={!undo.length}
            onClick={undoEdit}
            aria-label="Annuler la modification"
          >
            <Undo2 size={17} />
          </Button>
          <Button
            small
            disabled={!redo.length}
            onClick={redoEdit}
            aria-label="Rétablir la modification"
          >
            <Redo2 size={17} />
          </Button>
          <Button
            small
            onClick={() => download(t.name + ".json", t)}
            aria-label="Exporter le modèle JSON"
          >
            <Download size={17} />
          </Button>
          <Button
            small
            onClick={async () => {
              const copy = await run(() =>
                api("/templates", "POST", {
                  ...t,
                  id: crypto.randomUUID(),
                  name: t.name + " · copie",
                  version: 1,
                }),
              );
              if (copy) navigate("editor/" + copy.id);
            }}
            aria-label="Dupliquer le modèle"
          >
            <Copy size={17} />
          </Button>
          <Button small onClick={save}>
            <Save size={16} />
            Enregistrer
          </Button>
          <Button
            primary
            small
            disabled={!avatar || !!problem}
            onClick={renderPreview}
          >
            <Play size={16} />
            Rendre l’aperçu
          </Button>
        </div>
      </div>
      <div className="editor-workspace">
        <aside className="editor-library">
          <div className="pane-title">
            <h3>Ressources</h3>
            <button
              className="icon-button"
              aria-label="Importer des ressources"
              onClick={() => setImporting(true)}
            >
              <Plus size={18} />
            </button>
          </div>
          <Field label="Prévisualiser avec">
            <select value={avatar} onChange={(e) => setAvatar(e.target.value)}>
              <option value="">Choisir un avatar</option>
              {state.avatars.map((a) => (
                <option value={a.id} key={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="segmented">
            <button
              className={!libraryRole ? "active" : ""}
              onClick={() => setLibraryRole("")}
            >
              Tous
            </button>
            {["before", "after", "neutral"].map((r) => (
              <button
                key={r}
                className={libraryRole === r ? "active" : ""}
                onClick={() => setLibraryRole(r)}
              >
                {roleLabels[r]}
              </button>
            ))}
          </div>
          <p className="tiny muted">
            Cliquez sur une ressource pour la verrouiller dans le plan
            sélectionné.
          </p>
          <div className="editor-media-list">
            {library.map((m) => (
              <button
                key={m.id}
                className={`editor-media-item ${slot.mediaId === m.id ? "selected" : ""}`}
                disabled={m.missing}
                onClick={() =>
                  updateSlot({
                    selection: "fixed",
                    mediaId: m.id,
                    role:
                      m.kind === "image" ? "image" : (m.role as Slot["role"]),
                  })
                }
              >
                <div>
                  <img src={thumbUrl(m.id)} alt={m.name} />
                  <small>
                    {m.kind === "image"
                      ? "Image"
                      : m.duration.toFixed(1) + " s"}
                  </small>
                </div>
                <strong>{m.name}</strong>
                <span>
                  {roleLabels[m.role]}
                  {m.pairId ? " · " + m.pairId : ""}
                </span>
              </button>
            ))}
            {!library.length && (
              <Empty title="Pas encore de clips">
                Importez des fichiers pour cet avatar.
              </Empty>
            )}
          </div>
        </aside>
        <section className="preview-pane">
          <div className="preview-heading">
            <Badge>Aperçu interactif</Badge>
            <button
              className={`icon-button ${showSafe ? "purple-text" : ""}`}
              onClick={() => setShowSafe(!showSafe)}
              aria-label="Afficher les marges de sécurité"
            >
              <Maximize size={17} />
            </button>
          </div>
          <div className="preview-viewport">
            <div
              className="vertical-preview"
              style={{
                aspectRatio: `${t.width}/${t.height}`,
                background: currentCrop.background,
              }}
            >
              {current ? (
                <>
                  {current.media.kind === "image" ? (
                    <img
                      src={mediaUrl(current.media.id)}
                      alt="Plan sélectionné"
                      style={{
                        objectFit:
                          currentCrop.mode === "fill" ? "cover" : "contain",
                        objectPosition: `${currentCrop.x * 100}% ${currentCrop.y * 100}%`,
                        transform: `scale(${1 + ((currentCrop.zoom - 1) * (frame - current.startFrame)) / current.renderFrames})`,
                      }}
                    />
                  ) : (
                    <video
                      ref={video}
                      key={current.media.id}
                      src={mediaUrl(current.media.id)}
                      muted
                      playsInline
                      preload="auto"
                      style={{
                        objectFit:
                          currentCrop.mode === "fill" ? "cover" : "contain",
                        objectPosition: `${currentCrop.x * 100}% ${currentCrop.y * 100}%`,
                        transform: `scale(${1 + ((currentCrop.zoom - 1) * (frame - current.startFrame)) / current.renderFrames})`,
                      }}
                    />
                  )}
                  {t.texts
                    .filter((x) => frame >= x.startFrame && frame < x.endFrame)
                    .map((x) => (
                      <div
                        key={x.id}
                        className="preview-text"
                        style={{
                          left: `${x.x * 100}%`,
                          top: `${x.y * 100}%`,
                          fontSize: `${(x.size / t.width) * 100}cqw`,
                          color: x.color,
                          WebkitTextStroke: `${(x.outlineWidth / t.width) * 100}cqw ${x.outline}`,
                          paintOrder: "stroke fill",
                          textShadow: x.shadow
                            ? "0 .3cqw .4cqw #000b"
                            : undefined,
                        }}
                      >
                        {x.text}
                      </div>
                    ))}
                </>
              ) : (
                <div className="preview-empty">
                  <Film size={32} />
                  <p>
                    Sélectionnez un avatar
                    <br />
                    avec des clips admissibles
                  </p>
                </div>
              )}
              {showSafe && (
                <div
                  className="safe-area"
                  style={{
                    top: `${t.safeArea.top * 100}%`,
                    bottom: `${t.safeArea.bottom * 100}%`,
                    left: `${t.safeArea.left * 100}%`,
                    right: `${t.safeArea.right * 100}%`,
                  }}
                >
                  <span>Zone de sécurité</span>
                </div>
              )}
              <span className="preview-label">
                {state.avatars.find((a) => a.id === avatar)?.demo
                  ? "DÉMO TECHNIQUE"
                  : roleLabels[current?.slot.role || "before"]}
              </span>
            </div>
          </div>
          <div className="preview-controls">
            <button
              className="icon-button"
              aria-label="Revenir au début"
              onClick={() => {
                setPlaying(false);
                setFrame(0);
              }}
            >
              <ChevronLeft size={19} />
            </button>
            <button
              className="round-play"
              disabled={!recipe}
              aria-label={
                playing ? "Pause de l’aperçu" : "Lire l’aperçu interactif"
              }
              onClick={() => {
                if (frame >= total - 1) setFrame(0);
                setPlaying(!playing);
              }}
            >
              {playing ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <span>
              {(frame / 30).toFixed(2)}{" "}
              <small>/ {(total / 30).toFixed(2)} s</small>
            </span>
            <Badge>
              {t.width} × {t.height}
            </Badge>
          </div>
          <p className="preview-disclaimer">
            Cadrage et texte interactifs · transitions et mixage à vérifier dans
            l’aperçu rendu.
          </p>
          {preview && (
            <div className="render-preview-status">
              <Badge tone={preview.status === "completed" ? "green" : ""}>
                {preview.status === "completed"
                  ? "Aperçu rendu disponible"
                  : preview.phase + " · " + Math.round(preview.progress) + " %"}
              </Badge>
              <Button small onClick={() => view(preview)}>
                <Eye size={15} />
                Voir
              </Button>
            </div>
          )}
          {problem && (
            <div className="editor-problem" role="alert">
              {problem}
            </div>
          )}
        </section>
        <aside className="properties">
          <div className="property-tabs">
            {[
              ["plan", Film, "Plan"],
              ["music", Music2, "Son"],
              ["text", Type, "Texte"],
              ["format", SlidersHorizontal, "Format"],
            ].map(([id, Icon, label]) => {
              const I = Icon as typeof Film;
              return (
                <button
                  key={id as string}
                  className={panel === id ? "active" : ""}
                  onClick={() => setPanel(id as string)}
                >
                  <I size={16} />
                  {label as string}
                </button>
              );
            })}
          </div>
          <div className="property-content">
            {panel === "plan" ? (
              <>
                <div className="pane-title">
                  <h3>Plan {selected + 1}</h3>
                  <Badge>{seconds(slot.frames)}</Badge>
                </div>
                <Field label="Nom du plan">
                  <input
                    value={slot.label}
                    onChange={(e) => updateSlot({ label: e.target.value })}
                  />
                </Field>
                <div className="form-grid">
                  <Field label="Ressource attendue">
                    <select
                      value={slot.role}
                      onChange={(e) =>
                        updateSlot({ role: e.target.value as Slot["role"] })
                      }
                    >
                      {["before", "after", "neutral", "any", "image"].map(
                        (r) => (
                          <option value={r} key={r}>
                            {roleLabels[r]}
                          </option>
                        ),
                      )}
                    </select>
                  </Field>
                  <Field label="Durée (s)">
                    <input
                      type="number"
                      min={1 / 30}
                      step={1 / 30}
                      value={slot.frames / 30}
                      onChange={(e) =>
                        updateSlot({
                          frames: Math.max(1, Math.round(+e.target.value * 30)),
                        })
                      }
                    />
                  </Field>
                </div>
                <Field label="Sélection">
                  <select
                    value={slot.selection}
                    onChange={(e) =>
                      updateSlot({
                        selection: e.target.value as Slot["selection"],
                      })
                    }
                  >
                    <option value="auto">Tirage automatique</option>
                    <option value="fixed">Fichier imposé</option>
                    <option value="manual">Choix manuel</option>
                  </select>
                </Field>
                {slot.selection !== "auto" && (
                  <Field label="Fichier verrouillé">
                    <select
                      value={slot.mediaId}
                      onChange={(e) => updateSlot({ mediaId: e.target.value })}
                    >
                      <option value="">Choisir une ressource</option>
                      {library.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                <Field label="Tags requis" hint="Séparez par des virgules">
                  <TagInput
                    key={slot.id}
                    value={slot.tags}
                    onCommit={(tags) => updateSlot({ tags })}
                  />
                </Field>
                <details>
                  <summary>Compatibilité des plans</summary>
                  <Field label="Paire imposée">
                    <input
                      value={slot.pairId}
                      onChange={(e) => updateSlot({ pairId: e.target.value })}
                    />
                  </Field>
                  <Field label="Groupe de variantes">
                    <input
                      value={slot.variantGroupId}
                      onChange={(e) =>
                        updateSlot({ variantGroupId: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Même paire que">
                    <select
                      value={slot.matchSlotId}
                      onChange={(e) =>
                        updateSlot({ matchSlotId: e.target.value })
                      }
                    >
                      <option value="">Aucune correspondance</option>
                      {t.slots.slice(0, selected).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                </details>
                <div className="property-separator" />
                <h4>Coupe et mouvement</h4>
                <div className="form-grid">
                  <Field label="Entrée source (s)">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Celle du média"
                      value={slot.inPoint ?? ""}
                      onChange={(e) =>
                        updateSlot({
                          inPoint:
                            e.target.value === "" ? null : +e.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field label="Vitesse">
                    <select
                      value={slot.speed}
                      onChange={(e) => updateSlot({ speed: +e.target.value })}
                    >
                      {[0.5, 0.75, 1, 1.25, 1.5, 2].map((n) => (
                        <option key={n} value={n}>
                          {n} ×
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="Si le clip est trop court">
                  <select
                    value={slot.shortPolicy}
                    onChange={(e) =>
                      updateSlot({
                        shortPolicy: e.target.value as Slot["shortPolicy"],
                      })
                    }
                  >
                    <option value="reject">Refuser le rendu</option>
                    <option value="freeze">
                      Figer la dernière image (son coupé à la fin)
                    </option>
                    <option value="loop">Boucler le passage choisi</option>
                  </select>
                </Field>
                <Field label="Cadrage">
                  <select
                    value={slot.crop?.mode || "media"}
                    onChange={(e) =>
                      e.target.value === "media"
                        ? updateSlot({ crop: null })
                        : updateCrop({ mode: e.target.value })
                    }
                  >
                    <option value="media">Réglage de la ressource</option>
                    <option value="fill">Remplir sans étirement</option>
                    <option value="contain">Contenir avec un fond</option>
                  </select>
                </Field>
                {slot.crop && (
                  <>
                    <div className="form-grid">
                      {(["x", "y"] as const).map((axis) => (
                        <Field
                          key={axis}
                          label={axis === "x" ? "Position X" : "Position Y"}
                        >
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step=".01"
                            value={slot.crop![axis]}
                            onChange={(e) =>
                              updateCrop({ [axis]: +e.target.value })
                            }
                          />
                        </Field>
                      ))}
                    </div>
                    <Field
                      label={`Zoom progressif · ${slot.crop.zoom.toFixed(2)} ×`}
                    >
                      <input
                        type="range"
                        min="1"
                        max="1.5"
                        step=".01"
                        value={slot.crop.zoom}
                        onChange={(e) => updateCrop({ zoom: +e.target.value })}
                      />
                    </Field>
                    <Field label="Couleur du fond">
                      <input
                        type="color"
                        value={slot.crop.background}
                        onChange={(e) =>
                          updateCrop({ background: e.target.value })
                        }
                      />
                    </Field>
                  </>
                )}
                <div className="property-separator" />
                <h4>Transition vers le plan suivant</h4>
                <Field label="Effet réellement rendu">
                  <select
                    disabled={selected === t.slots.length - 1}
                    value={slot.transition.type}
                    onChange={(e) =>
                      updateSlot({
                        transition: {
                          type: e.target.value as any,
                          frames: e.target.value === "cut" ? 0 : 6,
                        },
                      })
                    }
                  >
                    <option value="cut">Coupe franche</option>
                    <option value="fade">Fondu</option>
                    <option value="flash">Flash blanc</option>
                  </select>
                </Field>
                {slot.transition.type !== "cut" && (
                  <Field label="Durée de transition (images)">
                    <input
                      type="number"
                      min="1"
                      max="120"
                      value={slot.transition.frames}
                      onChange={(e) =>
                        updateSlot({
                          transition: {
                            ...slot.transition,
                            frames: +e.target.value,
                          },
                        })
                      }
                    />
                  </Field>
                )}
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={slot.originalAudio}
                    onChange={(e) =>
                      updateSlot({ originalAudio: e.target.checked })
                    }
                  />
                  Conserver le son du clip
                </label>
                <div className="actions">
                  <Button
                    small
                    disabled={selected === 0}
                    onClick={() => reorder(selected, selected - 1)}
                    aria-label="Déplacer le plan à gauche"
                  >
                    <ChevronLeft size={16} />
                  </Button>
                  <Button
                    small
                    disabled={selected === t.slots.length - 1}
                    onClick={() => reorder(selected, selected + 1)}
                    aria-label="Déplacer le plan à droite"
                  >
                    <ChevronRight size={16} />
                  </Button>
                  <Button
                    small
                    disabled={t.slots.length === 1}
                    onClick={() => {
                      const slots = t.slots
                        .filter((_, i) => i !== selected)
                        .map((s, i, arr) => ({
                          ...s,
                          matchSlotId:
                            s.matchSlotId === slot.id ? "" : s.matchSlotId,
                          transition:
                            i === arr.length - 1
                              ? { type: "cut" as const, frames: 0 }
                              : s.transition,
                        }));
                      commit({ ...t, slots });
                      setSelected(Math.max(0, selected - 1));
                    }}
                  >
                    <Trash2 size={15} />
                    Retirer
                  </Button>
                </div>
              </>
            ) : panel === "music" ? (
              <>
                <h3>Musique et repères</h3>
                <Field label="Fichier musical">
                  <select
                    value={t.music?.mediaId || ""}
                    onChange={(e) =>
                      commit({
                        ...t,
                        music: e.target.value
                          ? {
                              mediaId: e.target.value,
                              start: 0,
                              volume: 0.8,
                              fadeIn: 0,
                              fadeOut: 0,
                              loop: false,
                              title: "",
                              sourceUrl: "",
                            }
                          : null,
                      })
                    }
                  >
                    <option value="">Sans musique</option>
                    {state.media
                      .filter((m) => m.kind === "audio")
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Button small onClick={() => setImporting(true)}>
                  <Upload size={15} />
                  Importer un son
                </Button>
                {t.music && (
                  <>
                    <audio
                      ref={audio}
                      className="music-player"
                      controls
                      src={mediaUrl(t.music.mediaId)}
                      onLoadedMetadata={(e) => {
                        e.currentTarget.currentTime = t.music!.start;
                      }}
                    />
                    <div
                      className="waveform-selection"
                      onClick={(e) => {
                        const d = Math.min(
                          600,
                          state.media.find((m) => m.id === t.music?.mediaId)
                            ?.duration || 0,
                        );
                        const rect = e.currentTarget.getBoundingClientRect();
                        const start = Math.max(
                          0,
                          Math.min(
                            d - 1 / 30,
                            ((e.clientX - rect.left) / rect.width) * d,
                          ),
                        );
                        commit({
                          ...t,
                          music: {
                            ...t.music!,
                            start: Math.round(start * 100) / 100,
                          },
                        });
                      }}
                    >
                      <Waveform values={wave} />
                      <div
                        style={{
                          left: `${(t.music.start / Math.min(600, state.media.find((m) => m.id === t.music?.mediaId)?.duration || 1)) * 100}%`,
                          width: `${(total / 30 / Math.min(600, state.media.find((m) => m.id === t.music?.mediaId)?.duration || 1)) * 100}%`,
                        }}
                      />
                    </div>
                    <p className="tiny muted">
                      Cliquez sur l’onde pour déplacer le début du passage. Les
                      dix premières minutes sont affichées au maximum.
                    </p>
                    <Field label="Début du passage (s)">
                      <input
                        type="number"
                        min="0"
                        step=".01"
                        value={t.music.start}
                        onChange={(e) =>
                          commit({
                            ...t,
                            music: { ...t.music!, start: +e.target.value },
                          })
                        }
                      />
                    </Field>
                    <Field
                      label={`Volume · ${Math.round(t.music.volume * 100)} %`}
                    >
                      <input
                        type="range"
                        min="0"
                        max="2"
                        step=".01"
                        value={t.music.volume}
                        onChange={(e) =>
                          commit({
                            ...t,
                            music: { ...t.music!, volume: +e.target.value },
                          })
                        }
                      />
                    </Field>
                    <div className="form-grid">
                      <Field label="Fondu entrée (s)">
                        <input
                          type="number"
                          min="0"
                          step=".1"
                          value={t.music.fadeIn}
                          onChange={(e) =>
                            commit({
                              ...t,
                              music: { ...t.music!, fadeIn: +e.target.value },
                            })
                          }
                        />
                      </Field>
                      <Field label="Fondu sortie (s)">
                        <input
                          type="number"
                          min="0"
                          step=".1"
                          value={t.music.fadeOut}
                          onChange={(e) =>
                            commit({
                              ...t,
                              music: { ...t.music!, fadeOut: +e.target.value },
                            })
                          }
                        />
                      </Field>
                    </div>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={t.music.loop}
                        onChange={(e) =>
                          commit({
                            ...t,
                            music: { ...t.music!, loop: e.target.checked },
                          })
                        }
                      />
                      Boucler explicitement le passage
                    </label>
                    <Field label="Nom du son pour la publication">
                      <input
                        value={t.music.title}
                        onChange={(e) =>
                          commit({
                            ...t,
                            music: { ...t.music!, title: e.target.value },
                          })
                        }
                      />
                    </Field>
                    <Field label="Lien de référence (métadonnée)">
                      <input
                        value={t.music.sourceUrl}
                        onChange={(e) =>
                          commit({
                            ...t,
                            music: { ...t.music!, sourceUrl: e.target.value },
                          })
                        }
                      />
                    </Field>
                    <p className="tiny muted">
                      Le son intégré au MP4 n’associe pas automatiquement la
                      vidéo à un son natif TikTok ou Instagram.
                    </p>
                  </>
                )}
                <div className="property-separator" />
                <h4>Repères manuels</h4>
                <Button
                  small
                  onClick={() =>
                    commit({
                      ...t,
                      markers: [...new Set([...t.markers, frame])].sort(
                        (a, b) => a - b,
                      ),
                    })
                  }
                >
                  <Flag size={15} />
                  Repère à {seconds(frame)}
                </Button>
                <div className="marker-list">
                  {t.markers.map((m) => (
                    <div key={m}>
                      <button onClick={() => setFrame(m)}>{seconds(m)}</button>
                      <button
                        aria-label={"Supprimer repère " + seconds(m)}
                        onClick={() =>
                          commit({
                            ...t,
                            markers: t.markers.filter((x) => x !== m),
                          })
                        }
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            ) : panel === "text" ? (
              <>
                <div className="pane-title">
                  <h3>Textes et CTA</h3>
                  <Button
                    small
                    onClick={() =>
                      commit({
                        ...t,
                        texts: [
                          ...t.texts,
                          {
                            id: crypto.randomUUID(),
                            text: "Découvre Loslo",
                            startFrame: Math.min(frame, total - 1),
                            endFrame: total,
                            x: 0.5,
                            y: 0.65,
                            size: 54,
                            color: "#ffffff",
                            outline: "#000000",
                            outlineWidth: 4,
                            shadow: true,
                            font: "Noto Sans",
                          },
                        ],
                      })
                    }
                  >
                    <Plus size={15} />
                  </Button>
                </div>
                {!t.texts.length && (
                  <p className="muted">
                    Les textes sont facultatifs. Ajoutez votre hook ou votre
                    appel à l’action.
                  </p>
                )}
                {t.texts.map((text, i) => (
                  <TextProperties
                    key={text.id}
                    text={text}
                    total={total}
                    update={(patch) =>
                      commit({
                        ...t,
                        texts: t.texts.map((x, j) =>
                          j === i ? { ...x, ...patch } : x,
                        ),
                      })
                    }
                    remove={() =>
                      commit({ ...t, texts: t.texts.filter((_, j) => i !== j) })
                    }
                  />
                ))}
              </>
            ) : (
              <>
                <h3>Format et sélection</h3>
                <details
                  onToggle={(e) => {
                    if (e.currentTarget.open)
                      void run(async () =>
                        setVersions(
                          await api<Template[]>(
                            "/templates/" + t.id + "/versions",
                          ),
                        ),
                      );
                  }}
                >
                  <summary>Versions enregistrées</summary>
                  {versions.map((v) => (
                    <Button
                      small
                      key={v.version}
                      onClick={() => commit(clone(v))}
                    >
                      Charger la version {v.version}
                    </Button>
                  ))}
                  <p className="tiny muted">
                    Charger une version modifie le brouillon. Enregistrer crée
                    ensuite une nouvelle version et conserve les anciens lots.
                  </p>
                </details>
                <Field label="Format de sortie">
                  <select
                    value={`${t.width}x${t.height}`}
                    onChange={(e) => {
                      const [width, height] = e.target.value
                        .split("x")
                        .map(Number);
                      commit({ ...t, width, height });
                    }}
                  >
                    <option value="1080x1920">Vertical · 1080 × 1920</option>
                    <option value="1080x1080">Carré · 1080 × 1080</option>
                    <option value="1920x1080">Paysage · 1920 × 1080</option>
                    {!["1080x1920", "1080x1080", "1920x1080"].includes(
                      `${t.width}x${t.height}`,
                    ) && (
                      <option>
                        {t.width}x{t.height}
                      </option>
                    )}
                  </select>
                </Field>
                <Badge>30 images / seconde · H.264</Badge>
                <Field label="Association des ressources">
                  <select
                    value={t.pairMode}
                    onChange={(e) =>
                      commit({
                        ...t,
                        pairMode: e.target.value as Template["pairMode"],
                      })
                    }
                  >
                    <option value="free">
                      Libre parmi les ressources compatibles
                    </option>
                    <option value="paired">
                      Même paire avant / après obligatoire
                    </option>
                  </select>
                </Field>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={t.preferLeastUsed}
                    onChange={(e) =>
                      commit({ ...t, preferLeastUsed: e.target.checked })
                    }
                  />
                  Préférer les ressources moins utilisées dans les lots
                </label>
                <div className="property-separator" />
                <h4>Marges de sécurité</h4>
                <div className="form-grid">
                  {(["top", "bottom", "left", "right"] as const).map(
                    (side, i) => (
                      <Field
                        key={side}
                        label={
                          ["Haut (%)", "Bas (%)", "Gauche (%)", "Droite (%)"][i]
                        }
                      >
                        <input
                          type="number"
                          min="0"
                          max="40"
                          value={Math.round(t.safeArea[side] * 100)}
                          onChange={(e) =>
                            commit({
                              ...t,
                              safeArea: {
                                ...t.safeArea,
                                [side]: +e.target.value / 100,
                              },
                            })
                          }
                        />
                      </Field>
                    ),
                  )}
                </div>
                <p className="tiny muted">
                  Les textes hors de cette zone empêchent le rendu jusqu’à
                  correction. La police Noto Sans est embarquée sous licence
                  libre.
                </p>
                <div className="property-separator" />
                <Field label="Seed de prévisualisation">
                  <input
                    value={seed}
                    onChange={(e) => setSeed(e.target.value)}
                  />
                </Field>
                <Button small onClick={() => setSeed(crypto.randomUUID())}>
                  <RefreshCw size={15} />
                  Varier les plans non verrouillés
                </Button>
                <p className="tiny muted">
                  Les lots utilisent la seed saisie lors de leur préparation.
                  Les fichiers verrouillés restent identiques.
                </p>
              </>
            )}
          </div>
        </aside>
      </div>
      <section className="timeline-section">
        <div className="timeline-toolbar">
          <div className="actions">
            <h3>Timeline</h3>
            <Badge>
              {seconds(total)} · {total} images
            </Badge>
          </div>
          <div className="actions">
            <Button
              small
              onClick={() => {
                commit({
                  ...t,
                  slots: [
                    ...t.slots,
                    slotSchema.parse({
                      id: crypto.randomUUID(),
                      label: "Nouveau plan",
                      role: "after",
                      frames: 90,
                      transition: { type: "cut", frames: 0 },
                    }),
                  ],
                });
                setSelected(t.slots.length);
              }}
            >
              <Plus size={15} />
              Ajouter un plan
            </Button>
            <Button
              small
              onClick={() => {
                setPanel("music");
                commit({
                  ...t,
                  markers: [...new Set([...t.markers, frame])].sort(
                    (a, b) => a - b,
                  ),
                });
              }}
            >
              <Flag size={15} />
              Repère
            </Button>
          </div>
        </div>
        <div className="timeline-body">
          <div className="track-labels">
            <div />
            <div>
              <Film size={15} />
              Vidéo
            </div>
            <div>
              <Music2 size={15} />
              Musique
            </div>
            <div>
              <Type size={15} />
              Textes
            </div>
          </div>
          <div className="tracks" ref={timeline}>
            <div
              className="ruler"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setPlaying(false);
                setFrame(
                  Math.min(
                    total - 1,
                    Math.max(
                      0,
                      Math.round(
                        ((e.clientX - rect.left) / rect.width) * total,
                      ),
                    ),
                  ),
                );
              }}
            >
              {Array.from(
                { length: Math.min(13, Math.floor(total / 30) + 1) },
                (_, i) => (
                  <span
                    key={i}
                    style={{
                      left: `${(i / Math.min(12, Math.floor(total / 30))) * 100}%`,
                    }}
                  >
                    {(
                      ((i / Math.min(12, Math.floor(total / 30))) * total) /
                      30
                    ).toFixed(0)}
                    s
                  </span>
                ),
              )}
            </div>
            <div className="video-track">
              {t.slots.map((s, i) => (
                <div
                  key={s.id}
                  className={`timeline-clip ${selected === i ? "selected" : ""} role-${s.role}`}
                  style={{ width: `${(s.frames / total) * 100}%` }}
                  draggable
                  onDragStart={() => {
                    dragIndex.current = i;
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    reorder(dragIndex.current, i);
                  }}
                >
                  <button
                    onClick={() => {
                      setSelected(i);
                      setPanel("plan");
                      setFrame(
                        t.slots.slice(0, i).reduce((n, x) => n + x.frames, 0),
                      );
                    }}
                  >
                    <span>
                      {s.selection !== "auto" && <Lock size={12} />}
                      <b>
                        {String(i + 1).padStart(2, "0")} {s.label}
                      </b>
                    </span>
                    <small>
                      {seconds(s.frames)} ·{" "}
                      {s.transition.type === "cut"
                        ? "Coupe"
                        : s.transition.type === "fade"
                          ? "Fondu"
                          : "Flash"}
                    </small>
                  </button>
                  {i < t.slots.length - 1 && (
                    <span
                      tabIndex={0}
                      role="slider"
                      aria-label={"Ajuster le bord du plan " + (i + 1)}
                      aria-valuenow={s.frames}
                      aria-valuemin={1}
                      aria-valuemax={s.frames + t.slots[i + 1].frames - 1}
                      className="clip-handle"
                      onPointerDown={(e) => resize(e, i)}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                          e.preventDefault();
                          const delta = e.key === "ArrowRight" ? 1 : -1;
                          if (
                            s.frames + delta > 0 &&
                            t.slots[i + 1].frames - delta > 0
                          )
                            commit({
                              ...t,
                              slots: t.slots.map((x, j) =>
                                j === i
                                  ? { ...x, frames: x.frames + delta }
                                  : j === i + 1
                                    ? { ...x, frames: x.frames - delta }
                                    : x,
                              ),
                            });
                        }
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
            <button
              className={`music-track ${t.music ? "filled" : ""}`}
              onClick={() => setPanel("music")}
            >
              {t.music ? (
                <>
                  <Waveform
                    values={timelineWaveform(
                      wave,
                      t.music,
                      total / 30,
                      state.media.find((m) => m.id === t.music?.mediaId)
                        ?.duration || 0,
                    )}
                  />
                  <span>
                    <Music2 size={14} />
                    {state.media.find((m) => m.id === t.music?.mediaId)?.name} ·
                    dès {t.music.start} s
                  </span>
                </>
              ) : (
                <span>
                  <Plus size={15} />
                  Associer une musique
                </span>
              )}
            </button>
            <div className="text-track">
              {t.texts.map((x) => (
                <button
                  key={x.id}
                  style={{
                    left: `${(x.startFrame / total) * 100}%`,
                    width: `${((x.endFrame - x.startFrame) / total) * 100}%`,
                  }}
                  onClick={() => {
                    setPanel("text");
                    setFrame(x.startFrame);
                  }}
                >
                  <Type size={13} />
                  {x.text}
                </button>
              ))}
            </div>
            {t.markers.map((m) => (
              <button
                key={m}
                className="timeline-marker"
                style={{ left: `${(m / total) * 100}%` }}
                title={"Repère " + seconds(m)}
                aria-label={"Aller au repère " + seconds(m)}
                onClick={() => setFrame(m)}
              >
                <Flag size={12} />
              </button>
            ))}
            <div
              className="playhead"
              style={{ left: `${(frame / total) * 100}%` }}
            >
              <i />
            </div>
          </div>
        </div>
        <input
          className="timeline-scrubber"
          aria-label="Position sur la timeline (images)"
          type="range"
          min="0"
          max={total - 1}
          value={frame}
          onChange={(e) => {
            setPlaying(false);
            setFrame(+e.target.value);
          }}
        />
        <p className="timeline-help">
          Glissez les plans pour les déplacer. Ajustez les bords entre deux
          plans pour conserver la durée totale. Les repères restent fixes.
        </p>
      </section>
      {importing && (
        <ImportModal
          avatars={state.avatars}
          initialAvatar={avatar}
          initialRole={panel === "music" ? "music" : "before"}
          run={run}
          onClose={() => setImporting(false)}
          onImported={() => setImporting(false)}
        />
      )}
    </>
  );
}
function TextProperties({
  text: x,
  total,
  update,
  remove,
}: {
  text: TextLayer;
  total: number;
  update: (p: Partial<TextLayer>) => void;
  remove: () => void;
}) {
  return (
    <div className="text-properties">
      <Field label="Texte (retours à la ligne conservés)">
        <textarea
          rows={3}
          value={x.text}
          onChange={(e) => update({ text: e.target.value })}
        />
      </Field>
      <div className="form-grid">
        <Field label="Début (s)">
          <input
            type="number"
            min="0"
            max={total / 30}
            step={1 / 30}
            value={x.startFrame / 30}
            onChange={(e) =>
              update({ startFrame: Math.round(+e.target.value * 30) })
            }
          />
        </Field>
        <Field label="Fin (s)">
          <input
            type="number"
            min="0"
            max={total / 30}
            step={1 / 30}
            value={x.endFrame / 30}
            onChange={(e) =>
              update({ endFrame: Math.round(+e.target.value * 30) })
            }
          />
        </Field>
        <Field label="Police">
          <select value={x.font} onChange={() => {}}>
            <option>Noto Sans</option>
          </select>
        </Field>
        <Field label="Taille à l’export">
          <input
            type="number"
            min="12"
            max="200"
            value={x.size}
            onChange={(e) => update({ size: +e.target.value })}
          />
        </Field>
        <Field label="Couleur">
          <input
            type="color"
            value={x.color}
            onChange={(e) => update({ color: e.target.value })}
          />
        </Field>
        <Field label="Contour">
          <input
            type="color"
            value={x.outline}
            onChange={(e) => update({ outline: e.target.value })}
          />
        </Field>
        <Field label="Épaisseur du contour">
          <input
            type="number"
            min="0"
            max="12"
            value={x.outlineWidth}
            onChange={(e) => update({ outlineWidth: +e.target.value })}
          />
        </Field>
      </div>
      <div className="form-grid">
        <Field label="Position X">
          <input
            type="range"
            min="0"
            max="1"
            step=".01"
            value={x.x}
            onChange={(e) => update({ x: +e.target.value })}
          />
        </Field>
        <Field label="Position Y">
          <input
            type="range"
            min="0"
            max="1"
            step=".01"
            value={x.y}
            onChange={(e) => update({ y: +e.target.value })}
          />
        </Field>
      </div>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={x.shadow}
          onChange={(e) => update({ shadow: e.target.checked })}
        />
        Ombre simple
      </label>
      <Button small onClick={remove}>
        <Trash2 size={14} />
        Supprimer ce texte
      </Button>
    </div>
  );
}
export function Waveform({ values }: { values: number[] }) {
  const max = Math.max(0.001, ...values);
  return (
    <svg
      className="waveform"
      viewBox="0 0 800 60"
      preserveAspectRatio="none"
      role="img"
      aria-label="Forme d’onde du fichier audio"
    >
      {values.map((v, i) => (
        <line
          key={i}
          x1={(i / values.length) * 800}
          x2={(i / values.length) * 800}
          y1={30 - (v / max) * 26}
          y2={30 + (v / max) * 26}
        />
      ))}
    </svg>
  );
}

function timelineWaveform(
  values: number[],
  music: NonNullable<Template["music"]>,
  length: number,
  sourceLength: number,
) {
  const displayedLength = Math.min(600, sourceLength);
  const passageLength = sourceLength - music.start;
  return Array.from({ length: 400 }, (_, i) => {
    const offset = (i / 400) * length;
    const time =
      music.start +
      (music.loop && passageLength > 0 ? offset % passageLength : offset);
    if (time < 0 || time >= displayedLength) return 0;
    return values[Math.floor((time / displayedLength) * values.length)] || 0;
  });
}
