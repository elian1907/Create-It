import { useState, useRef, useEffect } from "react";
import {
  Clapperboard,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
  Upload,
  Download,
  Play,
  Pause,
  Plus,
  Film,
  RefreshCw,
  X,
  FolderOpen,
  Copy,
  FileJson,
  FileText,
  Eye,
  ChevronRight,
  Layers3,
} from "lucide-react";
import { api, download, taskUrl, type StudioState } from "./api";
import { Button, Field, Badge, Empty, Notice, Modal, fmtDate } from "./ui";
import {
  batchSchema,
  statusLabels,
  type Task,
  type BatchInput,
} from "../shared/schema";
import type { Run } from "./main";
export function Batches({
  state,
  run,
  navigate,
}: {
  state: StudioState;
  run: Run;
  navigate: (s: string) => void;
}) {
  const [tab, setTab] = useState("create");
  const preset = useRef(
    (() => {
      try {
        return JSON.parse(sessionStorage.getItem("new-variant") || "null");
      } catch {
        return null;
      }
    })(),
  );
  const [form, setForm] = useState<BatchInput>(() =>
    batchSchema.parse({
      name: "Nouveau lot",
      avatarIds: preset.current?.avatarIds || [
        state.avatars[0]?.id || "avatar",
      ],
      templateIds: preset.current?.templateIds || [
        state.templates[0]?.id || "model",
      ],
      count: 1,
      seed: crypto.randomUUID().slice(0, 12),
    }),
  );
  const [plan, setPlan] = useState<any>();
  const [busy, setBusy] = useState(false);
  const idempotency = useRef(crypto.randomUUID());
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    sessionStorage.removeItem("new-variant");
  }, []);
  const change = (patch: Partial<BatchInput>) => {
    setForm((f) => ({ ...f, ...patch }));
    setPlan(undefined);
    idempotency.current = crypto.randomUUID();
  };
  const toggle = (key: "avatarIds" | "templateIds", id: string) =>
    change({
      [key]: form[key].includes(id)
        ? form[key].filter((x) => x !== id)
        : [...form[key], id],
    });
  const total =
    form.avatarIds.filter((id) => state.avatars.some((a) => a.id === id))
      .length *
    form.templateIds.length *
    form.count;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">DE L’IDÉE À LA SÉRIE</div>
          <h1>Génération par lots</h1>
          <p>
            Préparez les consignes. Vérifiez les ressources. Lancez vos exports.
          </p>
        </div>
        <Button onClick={() => input.current?.click()}>
          <Upload size={17} />
          Importer Scale It
        </Button>
      </div>
      <input
        hidden
        ref={input}
        type="file"
        accept=".json"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f)
            void run(async () => {
              const r = await api(
                "/scale-it/import",
                "POST",
                JSON.parse(await f.text()),
              );
              setTab("scale");
              return r;
            }, "Consignes importées, aucun rendu déclenché");
          e.target.value = "";
        }}
      />
      <div className="page-tabs">
        <button
          className={tab === "create" ? "active" : ""}
          onClick={() => setTab("create")}
        >
          Créer un lot
        </button>
        <button
          className={tab === "scale" ? "active" : ""}
          onClick={() => setTab("scale")}
        >
          Consignes Scale It <Badge>{state.imports.length}</Badge>
        </button>
        <button
          className={tab === "history" ? "active" : ""}
          onClick={() => setTab("history")}
        >
          Historique des lots
        </button>
      </div>
      {tab === "create" ? (
        <div className="batch-layout">
          <div>
            <section className="panel">
              <div className="step-title">
                <span>01</span>
                <div>
                  <h2>Choisissez vos avatars</h2>
                  <p>
                    Chaque vidéo utilisera uniquement les ressources de son
                    avatar.
                  </p>
                </div>
              </div>
              {!state.avatars.length ? (
                <Empty
                  title="Ajoutez d’abord un avatar"
                  action={
                    <Button onClick={() => navigate("avatars")}>
                      Ajouter un avatar
                    </Button>
                  }
                />
              ) : (
                <div className="selection-grid">
                  {state.avatars.map((a) => (
                    <label
                      key={a.id}
                      className={`selection-card ${form.avatarIds.includes(a.id) ? "selected" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={form.avatarIds.includes(a.id)}
                        onChange={() => toggle("avatarIds", a.id)}
                      />
                      <span className="avatar-initial">{a.name[0]}</span>
                      <div>
                        <strong>{a.name}</strong>
                        <small>
                          {
                            state.media.filter(
                              (m) =>
                                m.avatarId === a.id && !m.missing && m.enabled,
                            ).length
                          }{" "}
                          ressources · {a.language}
                        </small>
                        {a.demo && <Badge>Démo technique</Badge>}
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </section>
            <section className="panel">
              <div className="step-title">
                <span>02</span>
                <div>
                  <h2>Associez les modèles</h2>
                  <p>
                    Une recette sera figée pour chaque couple et chaque
                    variante.
                  </p>
                </div>
              </div>
              <div className="model-select-list">
                {state.templates.map((t) => (
                  <label
                    key={t.id}
                    className={`selection-card ${form.templateIds.includes(t.id) ? "selected" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={form.templateIds.includes(t.id)}
                      onChange={() => toggle("templateIds", t.id)}
                    />
                    <span className="stat-icon">
                      <Layers3 size={18} />
                    </span>
                    <div>
                      <strong>{t.name}</strong>
                      <small>
                        {t.slots.reduce((n, s) => n + s.frames, 0) / 30} s ·{" "}
                        {t.slots.length} plans · v{t.version}
                      </small>
                    </div>
                    <Badge>{t.music ? "Avec musique" : "Sans musique"}</Badge>
                  </label>
                ))}
              </div>
            </section>
            <section className="panel">
              <div className="step-title">
                <span>03</span>
                <div>
                  <h2>Réglez votre série</h2>
                  <p>
                    Le nombre demandé doit correspondre aux combinaisons
                    disponibles.
                  </p>
                </div>
              </div>
              <div className="form-grid">
                <Field label="Nom du lot">
                  <input
                    value={form.name}
                    onChange={(e) => change({ name: e.target.value })}
                  />
                </Field>
                <Field label="Variantes par avatar / modèle">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={form.count}
                    onChange={(e) => change({ count: +e.target.value })}
                  />
                </Field>
                <Field
                  label="Langue des consignes"
                  hint="Métadonnée ; les textes ne sont pas traduits automatiquement."
                >
                  <select
                    value={form.language}
                    onChange={(e) => change({ language: e.target.value })}
                  >
                    {["FR", "EN", "ES", "DE", "PT", "IT"].map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Qualité de sortie">
                  <select
                    value={form.profile}
                    onChange={(e) => change({ profile: e.target.value as any })}
                  >
                    <option value="final">
                      Export final · format du modèle
                    </option>
                    <option value="preview">Aperçu · résolution réduite</option>
                  </select>
                </Field>
                <Field label="Dossier de destination">
                  <select
                    value={form.exportRootId}
                    onChange={(e) => change({ exportRootId: e.target.value })}
                  >
                    {state.settings.exportRoots.map((r) => (
                      <option value={r.id} key={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Seed de départ du lot">
                  <input
                    value={form.seed}
                    onChange={(e) => change({ seed: e.target.value })}
                  />
                </Field>
              </div>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={form.demo}
                  onChange={(e) => change({ demo: e.target.checked })}
                />
                Identifier tout le lot comme démonstration
              </label>
            </section>
          </div>
          <aside className="batch-summary panel">
            <Badge tone="purple">Votre série</Badge>
            <div className="batch-total">
              {total}
              <span>vidéo{total > 1 ? "s" : ""}</span>
            </div>
            <div className="summary-line">
              <span>Avatars</span>
              <b>{form.avatarIds.length}</b>
            </div>
            <div className="summary-line">
              <span>Modèles</span>
              <b>{form.templateIds.length}</b>
            </div>
            <div className="summary-line">
              <span>Variantes par couple</span>
              <b>{form.count}</b>
            </div>
            <div className="summary-line">
              <span>Profil</span>
              <b>{form.profile === "final" ? "Final" : "Aperçu"}</b>
            </div>
            <p className="muted tiny">
              Un MP4 peut servir sur TikTok et Instagram. Les destinations
              sociales ne multiplient pas les rendus.
            </p>
            <Button
              disabled={!total || busy}
              onClick={async () => {
                setBusy(true);
                const r = await run(() => api("/batches/plan", "POST", form));
                if (r) setPlan(r);
                setBusy(false);
              }}
            >
              <CheckCircle2 size={17} />
              {busy ? "Vérification…" : "Vérifier les ressources"}
            </Button>
            {plan && (
              <div className="preflight">
                <Badge tone={plan.errors.length ? "red" : "green"}>
                  {plan.available} / {plan.total} recettes préparables
                </Badge>
                {plan.errors.length ? (
                  <Notice error>
                    {[...new Set(plan.errors)].map((s: any, i) => (
                      <p key={i}>{s}</p>
                    ))}
                  </Notice>
                ) : (
                  <p>
                    <CheckCircle2 size={16} />
                    Les contraintes sont satisfaites.
                  </p>
                )}
              </div>
            )}
            <Button
              primary
              disabled={!plan || !!plan.errors.length || busy}
              onClick={async () => {
                setBusy(true);
                const r = await run(
                  () =>
                    api("/batches", "POST", form, {
                      "Idempotency-Key": idempotency.current,
                    }),
                  "Lot créé",
                );
                setBusy(false);
                if (r) navigate("queue");
              }}
            >
              <Clapperboard size={18} />
              Générer les vidéos
            </Button>
            {state.settings.paused && (
              <Notice>
                La file est en pause. Les tâches seront enregistrées en attente.
              </Notice>
            )}
            <small>
              Les rendus continuent si vous fermez cet onglet et laissez le
              service en marche.
            </small>
          </aside>
        </div>
      ) : tab === "scale" ? (
        state.imports.length ? (
          <div className="imports-list">
            {state.imports.map((r) => (
              <ScaleImport
                key={r.id}
                record={r}
                state={state}
                run={run}
                navigate={navigate}
              />
            ))}
          </div>
        ) : (
          <Empty
            title="Importez les consignes de Scale It"
            action={
              <Button onClick={() => input.current?.click()}>
                Choisir l’enveloppe JSON
              </Button>
            }
          >
            Le modèle et les identifiants externes sont conservés. L’import ne
            lance aucun rendu.
          </Empty>
        )
      ) : state.batches.length ? (
        <div className="panel">
          {state.batches.map((b) => (
            <div className="batch-history-row" key={b.id}>
              <span className="stat-icon">
                <Clapperboard size={20} />
              </span>
              <div>
                <h3>{b.name}</h3>
                <p>
                  {fmtDate(b.createdAt)} · {b.taskIds.length} vidéo(s)
                </p>
              </div>
              <Badge tone="green">
                {
                  state.tasks.filter(
                    (t) => t.batchId === b.id && t.status === "completed",
                  ).length
                }{" "}
                terminé(s)
              </Badge>
              <Button
                small
                onClick={() => {
                  sessionStorage.setItem("queue-batch", b.id);
                  navigate("queue");
                }}
              >
                Voir les tâches
                <ChevronRight size={15} />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <Empty title="Aucun lot créé" />
      )}
    </>
  );
}
function ScaleImport({
  record: r,
  state,
  run,
  navigate,
}: {
  record: any;
  state: StudioState;
  run: Run;
  navigate: (s: string) => void;
}) {
  const [model, setModel] = useState("");
  const [map, setMap] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      r.envelope.avatars.map((a: any) => [
        a.id,
        state.avatars.find((x) => x.scaleItId === a.id || x.id === a.id)?.id ||
          "",
      ]),
    ),
  );
  const [confirmed, setConfirmed] = useState(false);
  const [demo, setDemo] = useState(r.envelope.run.demo);
  const [root, setRoot] = useState("default");
  const key = useRef(crypto.randomUUID());
  return (
    <section className="panel scale-import">
      <div className="section-heading">
        <div>
          <Badge tone="purple">Scale It · consignes importées</Badge>
          <h2>{r.envelope.run.modelName}</h2>
          <p>
            {r.envelope.run.items.length} contenu(s) · {r.envelope.run.id}
          </p>
        </div>
        <Badge>
          {r.envelope.run.demo
            ? "Démo"
            : r.envelope.run.paused
              ? "En pause"
              : "À associer"}
        </Badge>
      </div>
      <details open>
        <summary>Points à résoudre avant le rendu</summary>
        <ul>
          {r.issues.map((x: string, i: number) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      </details>
      <div className="form-grid">
        <Field label="Modèle local enrichi">
          <select
            value={model}
            onChange={(e) => {
              setModel(e.target.value);
              setConfirmed(false);
            }}
          >
            <option value="">Choisir un modèle vérifié</option>
            {state.templates.map((t) => (
              <option value={t.id} key={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Destination">
          <select value={root} onChange={(e) => setRoot(e.target.value)}>
            {state.settings.exportRoots.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Button
        small
        onClick={async () => {
          const t = await run(
            () => api("/templates", "POST", r.proposal),
            "Structure convertie en modèle local",
          );
          if (t) navigate("editor/" + t.id);
        }}
      >
        Créer le modèle à partir des plans Scale It
        <ArrowUpRight size={15} />
      </Button>
      <h4>Correspondance des avatars</h4>
      <div className="form-grid">
        {r.envelope.avatars.map((a: any) => (
          <Field label={a.name + " · " + a.id} key={a.id}>
            <select
              value={map[a.id] || ""}
              onChange={(e) => {
                setMap({ ...map, [a.id]: e.target.value });
                setConfirmed(false);
              }}
            >
              <option value="">Associer à un avatar local</option>
              {state.avatars.map((x) => (
                <option value={x.id} key={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </Field>
        ))}
      </div>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={demo}
          onChange={(e) => setDemo(e.target.checked)}
        />
        Marquer les résultats comme démonstration
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        J’ai vérifié le modèle, la musique, les textes et les fichiers locaux.
        Je demande la génération de ce lot.
      </label>
      <Button
        primary
        disabled={
          !confirmed ||
          !model ||
          r.envelope.run.items.some((i: any) => !map[i.avatarId])
        }
        onClick={async () => {
          const b = await run(
            () =>
              api(
                "/scale-it/" + r.id + "/enqueue",
                "POST",
                {
                  templateId: model,
                  avatarMap: map,
                  confirmProduction: confirmed,
                  seed: r.id,
                  exportRootId: root,
                  demo,
                },
                { "Idempotency-Key": key.current },
              ),
            "Lot Scale It ajouté à la file",
          );
          if (b) navigate("queue");
        }}
      >
        <Clapperboard size={17} />
        Générer ce lot vérifié
      </Button>
    </section>
  );
}
export function QueuePage({
  state,
  run,
  view,
  navigate,
}: {
  state: StudioState;
  run: Run;
  view: (t: Task) => void;
  navigate: (s: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const [batch, setBatch] = useState(
    () => sessionStorage.getItem("queue-batch") || "",
  );
  useEffect(() => sessionStorage.removeItem("queue-batch"), []);
  const list = state.tasks.filter(
    (t) => (!filter || t.status === filter) && (!batch || t.batchId === batch),
  );
  const active = state.tasks.filter((t) =>
    ["preparing", "rendering", "validating"].includes(t.status),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">PRODUCTION LOCALE</div>
          <h1>File d’export</h1>
          <p>
            La progression vient du moteur. Chaque fichier terminé a été
            contrôlé.
          </p>
        </div>
        <div className="actions">
          <Button
            onClick={() =>
              void run(async () =>
                download("resultats-create-it.json", await api("/results")),
              )
            }
          >
            <Download size={17} />
            Exporter les résultats
          </Button>
          <Button
            primary={!state.settings.paused}
            onClick={() =>
              void run(
                () =>
                  api("/settings", "POST", { paused: !state.settings.paused }),
                state.settings.paused
                  ? "File reprise"
                  : "File en pause après les rendus actifs",
              )
            }
          >
            {state.settings.paused ? <Play size={17} /> : <Pause size={17} />}{" "}
            {state.settings.paused
              ? "Reprendre la file"
              : "Mettre la file en pause"}
          </Button>
        </div>
      </div>
      {state.settings.paused && (
        <Notice>
          La pause empêche le démarrage des tâches suivantes. Les rendus actifs
          se terminent normalement.
        </Notice>
      )}
      {active.map((t) => (
        <section key={t.id} className="active-render">
          <span className="active-render-icon">
            <Film size={25} />
          </span>
          <div>
            <h3>{t.recipe.template.name}</h3>
            <p>
              {t.recipe.avatar.name} · {t.phase}
            </p>
            <progress value={t.progress} max="100" />
          </div>
          <strong>{Math.round(t.progress)} %</strong>
          <Button
            small
            onClick={() =>
              void run(() => api("/tasks/" + t.id + "/cancel", "POST", {}))
            }
          >
            <X size={15} />
            Annuler
          </Button>
        </section>
      ))}
      <div className="filter-bar">
        <select
          aria-label="Filtrer par état"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">Tous les états</option>
          {Object.entries(statusLabels).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label="Filtrer par lot"
          value={batch}
          onChange={(e) => setBatch(e.target.value)}
        >
          <option value="">Tous les lots</option>
          {state.batches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <span className="muted">{list.length} tâche(s)</span>
      </div>
      {!list.length ? (
        <Empty
          title="La file est prête"
          action={
            <Button primary onClick={() => navigate("batches")}>
              Créer un lot
            </Button>
          }
        >
          Les rendus et leur historique apparaîtront ici.
        </Empty>
      ) : (
        <div className="task-table">
          <div className="task-table-head">
            <span>VIDÉO / AVATAR</span>
            <span>LOT</span>
            <span>ÉTAT</span>
            <span>CRÉATION</span>
            <span />
          </div>
          {list.map((t) => (
            <div className="task-row" key={t.id}>
              <button className="task-title" onClick={() => view(t)}>
                <div className="task-thumb">
                  {t.status === "completed" ? (
                    <img
                      src={taskUrl(t.id, "thumbnail")}
                      alt="Vignette de l’export"
                    />
                  ) : (
                    <Film size={22} />
                  )}
                </div>
                <div>
                  <strong>{t.recipe.template.name}</strong>
                  <small>
                    {t.recipe.avatar.name} · {t.recipe.totalFrames / 30} s
                  </small>
                  <span>
                    {t.recipe.demo && <Badge>Démo technique</Badge>}
                    {t.recipe.profile === "preview" && <Badge>Aperçu</Badge>}
                  </span>
                </div>
              </button>
              <span>{state.batches.find((b) => b.id === t.batchId)?.name}</span>
              <div>
                <Badge
                  tone={
                    t.status === "completed"
                      ? "green"
                      : ["failed", "interrupted"].includes(t.status)
                        ? "red"
                        : t.status === "rendering"
                          ? "purple"
                          : ""
                  }
                >
                  {statusLabels[t.status]}
                </Badge>
                {["rendering", "validating"].includes(t.status) && (
                  <progress value={t.progress} max="100" />
                )}
              </div>
              <span className="muted">{fmtDate(t.createdAt)}</span>
              <div className="actions">
                <Button
                  small
                  aria-label={"Détails " + t.recipe.template.name}
                  onClick={() => view(t)}
                >
                  <Eye size={16} />
                </Button>
                {["failed", "interrupted", "cancelled"].includes(t.status) && (
                  <Button
                    small
                    disabled={t.attempts >= 3}
                    onClick={() =>
                      void run(
                        () => api("/tasks/" + t.id + "/retry", "POST", {}),
                        "Tâche relancée",
                      )
                    }
                    aria-label="Relancer la tâche"
                  >
                    <RefreshCw size={16} />
                  </Button>
                )}
                {t.status === "queued" && (
                  <Button
                    small
                    onClick={() =>
                      void run(() =>
                        api("/tasks/" + t.id + "/cancel", "POST", {}),
                      )
                    }
                    aria-label="Annuler la tâche"
                  >
                    <X size={16} />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
export function ResultModal({
  task: t,
  onClose,
  run,
  navigate,
}: {
  task: Task;
  onClose: () => void;
  run: Run;
  navigate: (s: string) => void;
}) {
  const [tab, setTab] = useState("video");
  const [log, setLog] = useState("");
  useEffect(() => {
    if (tab === "log")
      fetch(taskUrl(t.id, "log"))
        .then((r) => r.text())
        .then(setLog)
        .catch((e) => setLog(e.message));
  }, [tab, t.id, t.status]);
  return (
    <Modal title={t.recipe.template.name} onClose={onClose} wide>
      <div className="result-subtitle">
        <Badge tone={t.status === "completed" ? "green" : "purple"}>
          {statusLabels[t.status]}
        </Badge>
        <span>{t.recipe.avatar.name}</span>
        <span>Version {t.recipe.template.version}</span>
        {t.recipe.demo && <Badge>Démo technique</Badge>}
        {t.recipe.profile === "preview" && (
          <Badge>Aperçu en résolution réduite</Badge>
        )}
      </div>
      <div className="page-tabs">
        <button
          className={tab === "video" ? "active" : ""}
          onClick={() => setTab("video")}
        >
          <Film size={15} />
          Vidéo
        </button>
        <button
          className={tab === "recipe" ? "active" : ""}
          onClick={() => setTab("recipe")}
        >
          <FileJson size={15} />
          Recette figée
        </button>
        <button
          className={tab === "log" ? "active" : ""}
          onClick={() => setTab("log")}
        >
          <FileText size={15} />
          Journal
        </button>
      </div>
      {t.error && <Notice error>{t.error}</Notice>}
      {tab === "video" ? (
        t.status === "completed" ? (
          <div className="result-grid">
            <div className="result-video">
              <video
                controls
                playsInline
                src={taskUrl(t.id)}
                poster={taskUrl(t.id, "thumbnail")}
              />
            </div>
            <div>
              <h3>Export contrôlé</h3>
              <p>
                {t.result?.file.width} × {t.result?.file.height}
                <br />
                {t.result?.file.frames} images · {t.result?.file.fps} i/s
                <br />
                {t.result?.file.duration} secondes
                <br />
                H.264{t.result?.file.audioCodec ? " · AAC" : ""}
                <br />
                {((t.result?.file.size || 0) / 1024 / 1024).toFixed(2)} Mo
              </p>
              <Badge tone="green">
                <CheckCircle2 size={13} />
                Décodage intégral validé
              </Badge>
              <h4>Emplacement du fichier</h4>
              <code className="result-path">{t.result?.path}</code>
              <div className="stack-actions">
                <Button
                  onClick={() =>
                    void run(() =>
                      api("/tasks/" + t.id + "/open-folder", "POST", {}),
                    )
                  }
                >
                  <FolderOpen size={16} />
                  Ouvrir le dossier
                </Button>
                <Button
                  onClick={() =>
                    void run(
                      () => navigator.clipboard.writeText(t.result?.path || ""),
                      "Chemin copié",
                    )
                  }
                >
                  <Copy size={16} />
                  Copier le chemin
                </Button>
                <a
                  className="button primary"
                  href={taskUrl(t.id)}
                  download={`${t.recipe.template.name}.mp4`}
                >
                  <Download size={16} />
                  Télécharger le MP4
                </a>
                <Button
                  onClick={() => {
                    sessionStorage.setItem(
                      "new-variant",
                      JSON.stringify({
                        avatarIds: [t.recipe.avatar.id],
                        templateIds: [t.recipe.template.id],
                      }),
                    );
                    onClose();
                    navigate("batches");
                  }}
                >
                  <RefreshCw size={16} />
                  Créer une nouvelle variante
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="result-waiting">
            <Film size={40} />
            <h3>{t.phase}</h3>
            <progress value={t.progress} max="100" />
            <p>
              {Math.round(t.progress)} % · Tentative {t.attempts} / 3
            </p>
            {["queued", "preparing", "rendering", "validating"].includes(
              t.status,
            ) && (
              <Button
                onClick={() =>
                  void run(() => api("/tasks/" + t.id + "/cancel", "POST", {}))
                }
              >
                Annuler ce rendu
              </Button>
            )}
            {["failed", "interrupted", "cancelled"].includes(t.status) && (
              <Button
                disabled={t.attempts >= 3}
                onClick={() =>
                  void run(() => api("/tasks/" + t.id + "/retry", "POST", {}))
                }
              >
                Relancer depuis le début
              </Button>
            )}
          </div>
        )
      ) : tab === "recipe" ? (
        <>
          <div className="actions">
            <Button
              small
              onClick={() => download("recette-" + t.id + ".json", t.recipe)}
            >
              <Download size={15} />
              Exporter la recette
            </Button>
            {t.result && (
              <Button
                small
                onClick={() => download("resultat-" + t.id + ".json", t.result)}
              >
                Exporter le résultat
              </Button>
            )}
          </div>
          <pre className="json-view">{JSON.stringify(t.recipe, null, 2)}</pre>
        </>
      ) : (
        <pre className="json-view">{log || "Chargement du journal…"}</pre>
      )}
    </Modal>
  );
}
