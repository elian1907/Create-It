import { useState, useEffect, useRef } from "react";
import {
  Plus,
  FolderOpen,
  RefreshCw,
  Upload,
  Download,
  Search,
  Film,
  Image,
  Music2,
  Copy,
  ArrowUpRight,
  MoreHorizontal,
  Trash2,
  CheckCircle2,
  HardDrive,
  ShieldCheck,
  Terminal,
  Lock,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { api, download, mediaUrl, thumbUrl, type StudioState } from "./api";
import {
  Button,
  Field,
  Modal,
  Empty,
  Badge,
  Notice,
  fmtDate,
  TagInput,
} from "./ui";
import {
  avatarSchema,
  starterTemplates,
  roleLabels,
  type Avatar,
  type Media,
} from "../shared/schema";
import type { Run } from "./main";
export function Avatars({ state, run }: { state: StudioState; run: Run }) {
  const [edit, setEdit] = useState<Avatar>();
  const [report, setReport] = useState<any>();
  const [busy, setBusy] = useState("");
  const scan = async (a: Avatar) => {
    setBusy(a.id);
    const r = await run(
      () => api(`/avatars/${a.id}/index`, "POST", {}),
      "Indexation terminée",
    );
    if (r) setReport(r);
    setBusy("");
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">RESSOURCES ET IDENTITÉS</div>
          <h1>Vos avatars</h1>
          <p>
            Un avatar, ses clips, ses repères. Les originaux restent à leur
            place.
          </p>
        </div>
        <Button
          primary
          onClick={() =>
            setEdit(
              avatarSchema.parse({
                id: crypto.randomUUID(),
                name: "Nouvel avatar",
                folders: {},
              }),
            )
          }
        >
          <Plus size={18} />
          Ajouter un avatar
        </Button>
      </div>
      {report && (
        <Notice>
          <b>
            {report.added} ajout(s) · {report.updated} mise(s) à jour ·{" "}
            {report.missing} absent(s)
          </b>
          {report.errors?.map((e: any, i: number) => (
            <p key={i}>
              {e.path} : {e.error}
            </p>
          ))}
        </Notice>
      )}
      {!state.avatars.length ? (
        <Empty
          title="Bienvenue à votre premier avatar"
          action={
            <Button
              primary
              onClick={() =>
                setEdit(
                  avatarSchema.parse({
                    id: crypto.randomUUID(),
                    name: "Nouvel avatar",
                    folders: {},
                  }),
                )
              }
            >
              Ajouter un avatar
            </Button>
          }
        >
          Associez des dossiers existants ou importez des fichiers depuis la
          médiathèque.
        </Empty>
      ) : (
        <div className="avatar-grid">
          {state.avatars.map((a, i) => {
            const media = state.media.filter((m) => m.avatarId === a.id);
            return (
              <article className="avatar-card" key={a.id}>
                <div className={`avatar-banner tone-${i % 3}`}>
                  <span className="large-initial">{a.name.slice(0, 1)}</span>
                  <Badge>{a.language}</Badge>
                </div>
                <div className="avatar-body">
                  <div className="section-heading">
                    <h2>{a.name}</h2>
                    {a.demo && <Badge>Démo technique</Badge>}
                  </div>
                  <div className="role-stats">
                    {["before", "after", "neutral"].map((role) => (
                      <div key={role}>
                        <strong>
                          {
                            media.filter((m) => m.role === role && !m.missing)
                              .length
                          }
                        </strong>
                        <small>{roleLabels[role]}</small>
                      </div>
                    ))}
                  </div>
                  {media.some((m) => m.missing) && (
                    <Notice error>Des fichiers sont manquants.</Notice>
                  )}
                  <p className="folder-summary">
                    <FolderOpen size={15} />
                    {Object.values(a.folders).filter(Boolean).length
                      ? Object.values(a.folders).filter(Boolean).length +
                        " dossiers associés"
                      : "Import direct de fichiers"}
                  </p>
                  <div className="actions">
                    <Button small onClick={() => setEdit(structuredClone(a))}>
                      Modifier
                    </Button>
                    <Button
                      small
                      disabled={
                        busy === a.id || !Object.values(a.folders).some(Boolean)
                      }
                      onClick={() => scan(a)}
                    >
                      <RefreshCw
                        size={14}
                        className={busy === a.id ? "spin" : ""}
                      />
                      Réindexer
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {edit && (
        <Modal
          title="Ressources de l’avatar"
          onClose={() => setEdit(undefined)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const a = await run(
                () => api("/avatars", "POST", edit),
                "Avatar enregistré",
              );
              if (a) {
                setEdit(undefined);
                if (Object.values(a.folders).some(Boolean)) await scan(a);
              }
            }}
          >
            <div className="form-grid">
              <Field label="Nom">
                <input
                  required
                  value={edit.name}
                  onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                />
              </Field>
              <Field label="Langue par défaut">
                <select
                  value={edit.language}
                  onChange={(e) =>
                    setEdit({ ...edit, language: e.target.value })
                  }
                >
                  {["FR", "EN", "ES", "DE", "PT", "IT"].map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Identifiant Scale It (facultatif)">
              <input
                value={edit.scaleItId}
                onChange={(e) =>
                  setEdit({ ...edit, scaleItId: e.target.value })
                }
              />
            </Field>
            <p className="muted">
              Le service local peut lire les dossiers que vous associez ici. Vos
              fichiers ne sont ni déplacés ni supprimés.
            </p>
            {(["before", "after", "neutral"] as const).map((role) => (
              <Field key={role} label={"Dossier " + roleLabels[role]}>
                <div className="input-action">
                  <input
                    placeholder="Chemin absolu (facultatif)"
                    value={edit.folders[role]}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        folders: { ...edit.folders, [role]: e.target.value },
                      })
                    }
                  />
                  <Button
                    type="button"
                    aria-label={"Choisir le dossier " + roleLabels[role]}
                    onClick={async () => {
                      const r = await run(() =>
                        api("/pick-folder", "POST", {}),
                      );
                      if (r?.path)
                        setEdit({
                          ...edit,
                          folders: { ...edit.folders, [role]: r.path },
                        });
                    }}
                  >
                    <FolderOpen size={17} />
                  </Button>
                </div>
              </Field>
            ))}
            <label className="checkbox">
              <input
                type="checkbox"
                checked={edit.demo}
                onChange={(e) => setEdit({ ...edit, demo: e.target.checked })}
              />
              Médias techniques de démonstration
            </label>
            <div className="modal-footer">
              <Button type="button" onClick={() => setEdit(undefined)}>
                Annuler
              </Button>
              <Button primary type="submit">
                Enregistrer et indexer
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
export function MediaLibrary({ state, run }: { state: StudioState; run: Run }) {
  const [avatar, setAvatar] = useState("");
  const [role, setRole] = useState("");
  const [search, setSearch] = useState("");
  const [edit, setEdit] = useState<Media>();
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<any>();
  const filtered = state.media.filter(
    (m) =>
      (!avatar || m.avatarId === avatar) &&
      (!role || m.role === role) &&
      (!search ||
        [m.name, ...m.tags, m.pairId]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase())),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">VOTRE MATIÈRE PREMIÈRE</div>
          <h1>
            Médiathèque{" "}
            <span className="title-count">{state.media.length}</span>
          </h1>
          <p>
            Retrouvez vos plans, ajustez leurs tags et préparez les bonnes
            associations.
          </p>
        </div>
        <Button primary onClick={() => setImporting(true)}>
          <Upload size={18} />
          Importer des fichiers
        </Button>
      </div>
      <div className="filter-bar">
        <div className="search">
          <Search size={17} />
          <input
            placeholder="Rechercher un fichier, un tag, une paire…"
            aria-label="Rechercher les ressources"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          aria-label="Filtrer par avatar"
          value={avatar}
          onChange={(e) => setAvatar(e.target.value)}
        >
          <option value="">Tous les avatars</option>
          {state.avatars.map((a) => (
            <option value={a.id} key={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filtrer par rôle"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          <option value="">Tous les rôles</option>
          {["before", "after", "neutral", "music"].map((r) => (
            <option value={r} key={r}>
              {roleLabels[r]}
            </option>
          ))}
        </select>
      </div>
      {report && (
        <Notice>
          {report.media?.length} fichier(s) importé(s).{" "}
          {report.errors?.map((x: any) => `${x.name} : ${x.error}`).join("\n")}
        </Notice>
      )}
      {!filtered.length ? (
        <Empty
          title="Aucune ressource pour le moment"
          action={
            <Button onClick={() => setImporting(true)}>
              Importer des fichiers
            </Button>
          }
        >
          Ajoutez des fichiers ou réindexez les dossiers d’un avatar.
        </Empty>
      ) : (
        <div className="media-grid">
          {filtered.map((m) => (
            <button
              className={`media-card ${!m.enabled ? "disabled-media" : ""}`}
              key={m.id}
              onClick={() => setEdit(structuredClone(m))}
            >
              <div className="media-cover">
                {m.thumbnail ? (
                  <img src={thumbUrl(m.id)} alt={m.name} loading="lazy" />
                ) : (
                  <Music2 size={44} />
                )}
                <Badge>
                  {m.kind === "image" ? "Image" : m.duration.toFixed(1) + " s"}
                </Badge>
                {m.missing && (
                  <span className="missing-tag">Fichier manquant</span>
                )}
                {!m.enabled && (
                  <span className="missing-tag">Exclu du tirage</span>
                )}
              </div>
              <div className="media-info">
                <strong title={m.name}>{m.name}</strong>
                <p>
                  {state.avatars.find((a) => a.id === m.avatarId)?.name ||
                    "Sons communs"}{" "}
                  · {roleLabels[m.role]}
                </p>
                <div className="tags">
                  {m.tags.slice(0, 3).map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      {importing && (
        <ImportModal
          avatars={state.avatars}
          initialAvatar={avatar}
          run={run}
          onClose={() => setImporting(false)}
          onImported={(r) => {
            setReport(r);
            setImporting(false);
          }}
        />
      )}
      {edit && (
        <Modal
          title="Propriétés de la ressource"
          wide
          onClose={() => setEdit(undefined)}
        >
          <div className="media-edit-grid">
            <div className="source-preview">
              {edit.kind === "audio" ? (
                <audio controls src={mediaUrl(edit.id)} />
              ) : edit.kind === "image" ? (
                <img src={mediaUrl(edit.id)} alt={edit.name} />
              ) : (
                <video controls playsInline src={mediaUrl(edit.id)} />
              )}
              <h3>{edit.name}</h3>
              <p>
                {edit.width} × {edit.height} · {edit.fps.toFixed(2)} i/s ·{" "}
                {edit.codec}
              </p>
              <p>
                {edit.orientation} · {edit.audio ? "Avec audio" : "Sans audio"}
              </p>
              <code>{edit.path}</code>
              <small>SHA-256 : {edit.hash.slice(0, 20)}…</small>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const r = await run(
                  () => api("/media/" + edit.id, "PATCH", edit),
                  "Métadonnées enregistrées",
                );
                if (r) setEdit(undefined);
              }}
            >
              <Field label="Rôle">
                <select
                  value={edit.role}
                  disabled={edit.kind === "audio"}
                  onChange={(e) =>
                    setEdit({ ...edit, role: e.target.value as Media["role"] })
                  }
                >
                  {(edit.kind === "audio"
                    ? ["music"]
                    : ["before", "after", "neutral"]
                  ).map((r) => (
                    <option value={r} key={r}>
                      {roleLabels[r]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Tags"
                hint="Séparez les tags par des virgules : salon, robe, face…"
              >
                <TagInput
                  key={edit.id}
                  value={edit.tags}
                  onCommit={(tags) => setEdit({ ...edit, tags })}
                />
              </Field>
              <div className="form-grid">
                <Field label="Paire avant / après">
                  <input
                    value={edit.pairId}
                    placeholder="ex. salon-01"
                    onChange={(e) =>
                      setEdit({ ...edit, pairId: e.target.value })
                    }
                  />
                </Field>
                <Field label="Groupe de variantes">
                  <input
                    value={edit.variantGroupId}
                    onChange={(e) =>
                      setEdit({ ...edit, variantGroupId: e.target.value })
                    }
                  />
                </Field>
              </div>
              {edit.kind !== "image" && (
                <div className="form-grid">
                  <Field label="Point d’entrée (s)">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={edit.inPoint}
                      onChange={(e) =>
                        setEdit({ ...edit, inPoint: +e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Point de sortie (s)">
                    <input
                      type="number"
                      min="0"
                      max={edit.duration}
                      step="0.01"
                      placeholder={String(edit.duration)}
                      value={edit.outPoint ?? ""}
                      onChange={(e) =>
                        setEdit({
                          ...edit,
                          outPoint:
                            e.target.value === "" ? null : +e.target.value,
                        })
                      }
                    />
                  </Field>
                </div>
              )}
              <Field label="Cadrage par défaut">
                <select
                  value={edit.crop.mode}
                  onChange={(e) =>
                    setEdit({
                      ...edit,
                      crop: {
                        ...edit.crop,
                        mode: e.target.value as "fill" | "contain",
                      },
                    })
                  }
                >
                  <option value="fill">Remplir (recadrage)</option>
                  <option value="contain">Contenir (fond)</option>
                </select>
              </Field>
              <div className="form-grid">
                {(["x", "y"] as const).map((axis) => (
                  <Field
                    key={axis}
                    label={
                      axis === "x"
                        ? "Position horizontale"
                        : "Position verticale"
                    }
                  >
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step=".01"
                      value={edit.crop[axis]}
                      onChange={(e) =>
                        setEdit({
                          ...edit,
                          crop: { ...edit.crop, [axis]: +e.target.value },
                        })
                      }
                    />
                  </Field>
                ))}
              </div>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={edit.enabled}
                  onChange={(e) =>
                    setEdit({ ...edit, enabled: e.target.checked })
                  }
                />
                Autoriser la sélection automatique
              </label>
              <div className="modal-footer">
                <Button
                  type="button"
                  className="danger-text"
                  onClick={async () => {
                    if (
                      confirm(
                        "Retirer cette ressource de l’index ? Le fichier original sera conservé.",
                      )
                    ) {
                      await run(() => api("/media/" + edit.id, "DELETE"));
                      setEdit(undefined);
                    }
                  }}
                >
                  <Trash2 size={15} />
                  Retirer de l’index
                </Button>
                <Button primary type="submit">
                  Enregistrer
                </Button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </>
  );
}
export function ImportModal({
  avatars,
  initialAvatar = "",
  initialRole = "before",
  run,
  onClose,
  onImported,
}: {
  avatars: Avatar[];
  initialAvatar?: string;
  initialRole?: string;
  run: Run;
  onClose: () => void;
  onImported: (r: any) => void;
}) {
  const [avatar, setAvatar] = useState(initialAvatar || avatars[0]?.id || "");
  const [role, setRole] = useState(initialRole);
  const [mode, setMode] = useState("copy");
  const [localPath, setLocalPath] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Importer vos fichiers" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (mode === "path") {
            setBusy(true);
            const r = await run(
              () =>
                api("/media/path", "POST", {
                  path: localPath,
                  avatarId: role === "music" ? "" : avatar,
                  role,
                }),
              "Fichier référencé",
            );
            setBusy(false);
            if (r) onImported({ media: [r], errors: [] });
            return;
          }
          if (!files) return;
          setBusy(true);
          const form = new FormData();
          form.append("avatarId", avatar);
          form.append("role", role);
          for (const f of Array.from(files)) form.append("files", f);
          const r = await run(
            () => api("/media/import", "POST", form),
            "Import terminé",
          );
          setBusy(false);
          if (r) onImported(r);
        }}
      >
        <div className="segmented">
          <button
            type="button"
            className={mode === "copy" ? "active" : ""}
            onClick={() => setMode("copy")}
          >
            Importer une copie
          </button>
          <button
            type="button"
            className={mode === "path" ? "active" : ""}
            onClick={() => setMode("path")}
          >
            Référencer un chemin local
          </button>
        </div>
        <p>
          {mode === "copy"
            ? "Une copie est enregistrée dans le dossier d’import du studio. Les originaux restent intacts."
            : "Le fichier doit être dans un dossier associé à un avatar ou dans un dossier de sons configuré dans les réglages."}
        </p>
        <div className="form-grid">
          <Field label="Rôle">
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {["before", "after", "neutral", "music"].map((r) => (
                <option value={r} key={r}>
                  {roleLabels[r]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Avatar">
            <select
              disabled={role === "music"}
              value={avatar}
              onChange={(e) => setAvatar(e.target.value)}
            >
              <option value="">Choisir un avatar</option>
              {avatars.map((a) => (
                <option value={a.id} key={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {mode === "path" ? (
          <Field label="Chemin absolu du fichier">
            <input
              required
              value={localPath}
              onChange={(e) => setLocalPath(e.target.value)}
            />
          </Field>
        ) : (
          <label className="upload-zone">
            <Upload size={30} />
            <strong>Choisir les fichiers</strong>
            <small>
              MP4, MOV, WebM, MKV, images et sons · 512 Mo/fichier · 30 fichiers
            </small>
            <input
              type="file"
              multiple
              accept="video/*,image/png,image/jpeg,image/webp,audio/*"
              onChange={(e) => setFiles(e.target.files)}
            />
          </label>
        )}
        <div className="modal-footer">
          <Button type="button" onClick={onClose}>
            Annuler
          </Button>
          <Button
            primary
            disabled={
              busy ||
              (mode === "copy" ? !files?.length : !localPath) ||
              (role !== "music" && !avatar)
            }
          >
            {busy
              ? "Analyse en cours…"
              : mode === "path"
                ? "Référencer le fichier"
                : `Importer${files ? " " + files.length + " fichier(s)" : ""}`}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export function Templates({
  state,
  run,
  navigate,
}: {
  state: StudioState;
  run: Run;
  navigate: (s: string) => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  const create = async () => {
    const base = starterTemplates()[0];
    const t = await run(() =>
      api("/templates", "POST", {
        ...base,
        id: crypto.randomUUID(),
        name: "Nouveau modèle",
      }),
    );
    if (t) navigate("editor/" + t.id);
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">VOS FORMATS SIGNATURES</div>
          <h1>Bibliothèque de modèles</h1>
          <p>
            Une structure que vous maîtrisez, des variations que vous
            choisissez.
          </p>
        </div>
        <div className="actions">
          <Button onClick={() => file.current?.click()}>
            <Upload size={17} />
            Importer JSON
          </Button>
          <Button primary onClick={create}>
            <Plus size={18} />
            Créer un modèle
          </Button>
        </div>
      </div>
      <input
        hidden
        ref={file}
        type="file"
        accept=".json"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f)
            void run(async () => {
              const raw = JSON.parse(await f.text());
              const r = await api("/templates", "POST", {
                ...raw,
                id: crypto.randomUUID(),
                version: 1,
              });
              navigate("editor/" + r.id);
            }, "Modèle importé");
          e.target.value = "";
        }}
      />
      <div className="template-grid">
        {state.templates.map((t, i) => (
          <article className="template-card" key={t.id}>
            <button
              className={`template-art tone-${i % 3}`}
              onClick={() => navigate("editor/" + t.id)}
            >
              <span className="template-number">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="template-art-layout">
                <div>AVANT</div>
                <span>→</span>
                <div>APRÈS</div>
              </div>
              <div className="template-strip">
                {t.slots.map((s) => (
                  <span key={s.id} style={{ flex: s.frames }} />
                ))}
              </div>
              <Badge>
                {t.slots.reduce((n, s) => n + s.frames, 0) / 30} secondes
              </Badge>
            </button>
            <div className="template-info">
              <div className="section-heading">
                <h2>{t.name}</h2>
                <Badge>v{t.version}</Badge>
              </div>
              <p>
                {t.slots.length} plans · {t.width} × {t.height} ·{" "}
                {t.texts.length ? "Avec texte" : "Sans texte"}
              </p>
              <div className="tags">
                <span>{t.music ? "Musique associée" : "Son à associer"}</span>
                {t.slots.some((s) => s.transition.type !== "cut") && (
                  <span>Transition</span>
                )}
              </div>
              <div className="actions">
                <Button
                  primary
                  small
                  onClick={() => navigate("editor/" + t.id)}
                >
                  Ouvrir l’éditeur
                  <ArrowUpRight size={15} />
                </Button>
                <Button
                  small
                  aria-label={"Dupliquer " + t.name}
                  onClick={async () => {
                    const r = await run(
                      () =>
                        api("/templates", "POST", {
                          ...t,
                          id: crypto.randomUUID(),
                          name: t.name + " · copie",
                          version: 1,
                        }),
                      "Modèle dupliqué",
                    );
                    if (r) navigate("editor/" + r.id);
                  }}
                >
                  <Copy size={16} />
                </Button>
                <Button
                  small
                  aria-label={"Exporter " + t.name}
                  onClick={() => download(t.name + ".json", t)}
                >
                  <Download size={16} />
                </Button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
export function SettingsPage({ state, run }: { state: StudioState; run: Run }) {
  const [diag, setDiag] = useState<any>();
  const [folder, setFolder] = useState("");
  const [name, setName] = useState("Exports");
  const [music, setMusic] = useState("");
  const restore = useRef<HTMLInputElement>(null);
  useEffect(() => {
    api("/diagnostics")
      .then(setDiag)
      .catch((e) => setDiag({ ok: false, error: e.message }));
  }, []);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">LE STUDIO, À VOTRE FAÇON</div>
          <h1>Réglages</h1>
          <p>Stockage, moteur de rendu et sauvegardes.</p>
        </div>
      </div>
      <div className="settings-grid">
        <section className="panel">
          <div className="section-heading">
            <h2>
              <ShieldCheck size={20} />
              Diagnostic du moteur
            </h2>
            <Button
              small
              onClick={async () =>
                setDiag(await run(() => api("/diagnostics")))
              }
            >
              <RefreshCw size={14} />
              Vérifier
            </Button>
          </div>
          {!diag ? (
            <p>Vérification en cours…</p>
          ) : (
            <>
              <Badge tone={diag.ok ? "green" : "red"}>
                {diag.ok ? "Le moteur est prêt" : "Installation nécessaire"}
              </Badge>
              <p>{diag.ffmpeg}</p>
              <p>{diag.ffprobe}</p>
              <small>
                Node {diag.node} · {diag.platform}
              </small>
              {!diag.ok && (
                <Notice error>
                  {diag.error} {diag.missing?.join(", ")}
                  <p>{diag.help}</p>
                </Notice>
              )}
              <details>
                <summary>Capacités vérifiées</summary>
                <p>{diag.filters?.join(", ")}</p>
              </details>
            </>
          )}
        </section>
        <section className="panel">
          <h2>
            <SlidersHorizontal size={20} />
            File de rendu
          </h2>
          <Field
            label="Rendus simultanés"
            hint="Un rendu utilise du processeur et de la mémoire. Commencez par 1."
          >
            <select
              value={state.settings.concurrency}
              onChange={(e) =>
                void run(() =>
                  api("/settings", "POST", { concurrency: +e.target.value }),
                )
              }
            >
              {[1, 2, 3].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </Field>
          <p className="muted">
            Fermer l’onglet laisse les exports continuer. Arrêter le service ou
            éteindre l’ordinateur interrompt les tâches ; leur relance
            recommence au début.
          </p>
        </section>
        <section className="panel">
          <h2>
            <FolderOpen size={20} />
            Dossiers d’export
          </h2>
          {state.settings.exportRoots.map((r) => (
            <div className="path-row" key={r.id}>
              <strong>{r.name}</strong>
              <code>{r.path}</code>
            </div>
          ))}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await run(
                () =>
                  api("/settings", "POST", {
                    exportRoot: { name, path: folder },
                  }),
                "Dossier ajouté",
              );
              if (r) setFolder("");
            }}
          >
            <Field label="Nom du dossier">
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="Chemin absolu d’un dossier existant">
              <input
                required
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                placeholder="/Volumes/… ou C:\Vidéos\Exports"
              />
            </Field>
            <Button type="submit">Ajouter ce dossier</Button>
          </form>
        </section>
        <section className="panel">
          <h2>
            <Music2 size={20} />
            Sons communs
          </h2>
          <p className="muted">
            Associez un dossier pour référencer une musique par chemin. L’import
            de fichiers est également disponible dans la médiathèque.
          </p>
          {state.settings.musicRoots.map((r) => (
            <code className="path-row" key={r}>
              {r}
            </code>
          ))}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await run(
                () => api("/settings", "POST", { musicRoot: music }),
                "Dossier de sons ajouté",
              );
              if (r) setMusic("");
            }}
          >
            <Field label="Dossier de sons existant">
              <input
                required
                value={music}
                onChange={(e) => setMusic(e.target.value)}
              />
            </Field>
            <Button type="submit">Associer le dossier</Button>
          </form>
        </section>
        <section className="panel">
          <h2>
            <Download size={20} />
            Sauvegardes
          </h2>
          <p>
            Exportez les avatars, leurs dossiers, les réglages et toutes les
            versions des modèles. Les médias et l’historique complet se
            sauvegardent avec le dossier « data » après arrêt du service.
          </p>
          <div className="actions">
            <Button
              onClick={() =>
                void run(async () =>
                  download("create-it-sauvegarde.json", await api("/backup")),
                )
              }
            >
              Exporter les réglages
            </Button>
            <Button onClick={() => restore.current?.click()}>
              Restaurer un JSON
            </Button>
          </div>
          <input
            ref={restore}
            hidden
            type="file"
            accept=".json"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (
                f &&
                confirm(
                  "Restaurer ces avatars et réglages ? Les modèles seront ajoutés en nouvelles versions.",
                )
              )
                void run(
                  async () =>
                    api("/backup/restore", "POST", JSON.parse(await f.text())),
                  "Sauvegarde restaurée",
                );
              e.target.value = "";
            }}
          />
        </section>
        <section className="panel">
          <h2>
            <Terminal size={20} />
            Intégration locale
          </h2>
          <p>
            La CLI et l’API fonctionnent avec le même moteur que l’interface.
          </p>
          <code className="code-block">
            npm run cli -- diagnostic
            <br />
            npm run cli -- status
            <br />
            npm run cli -- batch lot.json ma-cle-unique
          </code>
          <p>
            La clé locale est stockée dans <code>data/api-token</code>. Elle
            n’est pas affichée ni journalisée. Le service écoute uniquement sur
            la boucle locale.
          </p>
          <p className="muted">
            L’import Scale It est disponible dans « Génération par lots ». Le
            raccordement au serveur hébergé demandera un agent local
            authentifié.
          </p>
        </section>
      </div>
    </>
  );
}
