import React, { useState, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  Clapperboard,
  LayoutDashboard,
  Users,
  Library,
  Layers3,
  Film,
  Settings,
  Plus,
  ChevronRight,
  ArrowUpRight,
  CheckCircle2,
  HardDrive,
  Clock3,
  PanelLeftClose,
  X,
} from "lucide-react";
import { api, taskUrl, type StudioState } from "./api";
import { Button, Badge, Empty, Loading, fmtDate, Notice } from "./ui";
import { Avatars, MediaLibrary, Templates, SettingsPage } from "./pages";
import { Editor } from "./editor";
import { Batches, QueuePage, ResultModal } from "./production";
import type { Task } from "../shared/schema";
import "./style.css";
import "./theme.css";
import { GlassHighlights } from "./GlassHighlights";
const navigation = [
  ["dashboard", "Vue d’ensemble", LayoutDashboard],
  ["avatars", "Avatars", Users],
  ["media", "Médiathèque", Library],
  ["templates", "Modèles", Layers3],
  ["batches", "Génération par lots", Clapperboard],
  ["queue", "File d’export", Film],
  ["settings", "Réglages", Settings],
] as const;
export type Run = (fn: () => Promise<any>, success?: string) => Promise<any>;
function App() {
  const [state, setState] = useState<StudioState>();
  const [route, setRoute] = useState(location.hash.slice(1) || "dashboard");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(0);
  const [connected, setConnected] = useState(true);
  const [result, setResult] = useState<Task>();
  const navigate = (to: string) => {
    location.hash = to;
  };
  useEffect(() => {
    const handler = () => setRoute(location.hash.slice(1) || "dashboard");
    addEventListener("hashchange", handler);
    return () => removeEventListener("hashchange", handler);
  }, []);
  const refresh = useCallback(async () => {
    const s = await api<StudioState>("/state");
    setState(s);
    setConnected(true);
    return s;
  }, []);
  useEffect(() => {
    let done = false;
    api("/session", "POST")
      .then(refresh)
      .catch((e) => setError(e.message));
    const interval = setInterval(() => {
      if (!done) refresh().catch(() => setConnected(false));
    }, 2000);
    return () => {
      done = true;
      clearInterval(interval);
    };
  }, [refresh]);
  const run: Run = async (fn, success) => {
    setBusy((n) => n + 1);
    setError("");
    try {
      const value = await fn();
      await refresh();
      if (success) {
        setToast(success);
        setTimeout(() => setToast(""), 4500);
      }
      return value;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return undefined;
    } finally {
      setBusy((n) => n - 1);
    }
  };
  const page = route.split("/")[0];
  const active =
    state?.tasks.filter((t) =>
      ["queued", "preparing", "rendering", "validating"].includes(t.status),
    ).length || 0;
  return (
    <div className={`app ${page === "editor" ? "editing" : ""}`}>
      <GlassHighlights />
      <aside className="sidebar">
        <a className="brand" href="#dashboard" aria-label="Create It">
          <span className="brand-icon">
            <Clapperboard size={23} />
          </span>
          <span>
            Create It<span className="brand-light">Studio vidéo</span>
          </span>
        </a>
        <div className="workspace-pill">
          <span className="workspace-logo">L</span>
          <div>
            Loslo <small>Espace de création local</small>
          </div>
          <Badge>V1</Badge>
        </div>
        <div className="nav-label">STUDIO</div>
        <nav aria-label="Navigation principale">
          {navigation.slice(0, -1).map(([id, label, Icon]) => (
            <a
              href={"#" + id}
              aria-label={label}
              aria-current={
                page === id || (page === "editor" && id === "templates")
                  ? "page"
                  : undefined
              }
              className={
                page === id || (page === "editor" && id === "templates")
                  ? "active"
                  : ""
              }
              key={id}
            >
              <Icon size={19} />
              <span>{label}</span>
              {id === "queue" && active > 0 && (
                <b className="count">{active}</b>
              )}
            </a>
          ))}
        </nav>
        <a
          className={`mobile-settings ${page === "settings" ? "active" : ""}`}
          href="#settings"
          aria-label="Réglages"
        >
          <Settings size={20} />
        </a>
        <div className="sidebar-bottom">
          <div className="local-card">
            <span className={`status-dot ${connected ? "" : "offline"}`} />
            <b>
              {connected
                ? "Tout reste sur votre ordinateur"
                : "Service déconnecté"}
            </b>
            <small>
              Vos médias. Vos modèles.
              <br />
              Vos vidéos, à votre rythme.
            </small>
          </div>
          <a className={page === "settings" ? "active" : ""} href="#settings">
            <Settings size={18} />
            Réglages
          </a>
          <div className="user-line">
            <span className="avatar-initial">L</span>
            <div>
              Loslo Studio<small>Production vidéo</small>
            </div>
            <span className="version">1.0</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Espace de création
            <ChevronRight size={14} />
            <strong>
              {page === "editor"
                ? "Éditeur de modèle"
                : navigation.find((n) => n[0] === page)?.[1]}
            </strong>
          </div>
          <div className="top-status">
            <span className={`status-dot ${connected ? "" : "offline"}`} />
            {busy
              ? "Opération en cours…"
              : connected
                ? "Service local connecté"
                : "Service arrêté"}
            <span className="divider" />
            <Badge>100 % local</Badge>
          </div>
        </header>
        {!connected && (
          <Notice error>
            Le service local ne répond plus. Relancez-le avec « npm start ». Les
            tâches interrompues pourront être relancées.
          </Notice>
        )}
        {error && (
          <div className="global-error" role="alert">
            <span>{error}</span>
            <button aria-label="Fermer l’erreur" onClick={() => setError("")}>
              <X size={18} />
            </button>
          </div>
        )}
        {!state ? (
          <Loading />
        ) : (
          <main className={page === "editor" ? "editor-main" : "content"}>
            {page === "dashboard" ? (
              <Dashboard state={state} navigate={navigate} view={setResult} />
            ) : page === "avatars" ? (
              <Avatars state={state} run={run} />
            ) : page === "media" ? (
              <MediaLibrary state={state} run={run} />
            ) : page === "templates" ? (
              <Templates state={state} run={run} navigate={navigate} />
            ) : page === "editor" ? (
              <Editor
                key={route}
                state={state}
                templateId={decodeURIComponent(route.slice(7))}
                run={run}
                navigate={navigate}
                view={setResult}
              />
            ) : page === "batches" ? (
              <Batches state={state} run={run} navigate={navigate} />
            ) : page === "queue" ? (
              <QueuePage
                state={state}
                run={run}
                view={setResult}
                navigate={navigate}
              />
            ) : (
              <SettingsPage state={state} run={run} />
            )}
          </main>
        )}
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
      {result && (
        <ResultModal
          task={state?.tasks.find((t) => t.id === result.id) || result}
          run={run}
          onClose={() => setResult(undefined)}
          navigate={navigate}
        />
      )}
    </div>
  );
}
function Dashboard({
  state: s,
  navigate,
  view,
}: {
  state: StudioState;
  navigate: (p: string) => void;
  view: (t: Task) => void;
}) {
  const completed = s.tasks.filter(
    (t) => t.status === "completed" && t.recipe.profile === "final",
  );
  const waiting = s.tasks.filter((t) =>
    ["queued", "preparing", "rendering", "validating"].includes(t.status),
  );
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">VOTRE STUDIO DE MONTAGE</div>
        <h1>Place à vos prochaines vidéos.</h1>
        <p>Des ressources bien rangées. Un modèle. Et le montage prend vie.</p>
      </div>
      <section className="welcome">
        <div>
          <Badge tone="purple">Du modèle au MP4</Badge>
          <h2>
            Une structure, toutes
            <br />
            vos transformations.
          </h2>
          <p>
            Choisissez vos avatars et vos modèles.
            <br />
            Create It s’occupe de l’assemblage.
          </p>
          <Button primary onClick={() => navigate("batches")}>
            <Clapperboard size={18} />
            Créer un lot
            <ArrowUpRight size={17} />
          </Button>
          <button className="text-button" onClick={() => navigate("templates")}>
            Explorer les modèles
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="mock-video back">
            <span>01 / AVANT</span>
            <div className="film-glyph">
              <Film size={43} strokeWidth={1.2} />
            </div>
          </div>
          <div className="mock-video front">
            <span>02 / APRÈS</span>
            <div className="film-glyph">
              <Clapperboard size={43} strokeWidth={1.2} />
            </div>
            <b>
              Votre prochaine
              <br />
              transformation.
            </b>
            <small>VISUEL D’INTERFACE</small>
          </div>
          <span className="hero-chip">
            <CheckCircle2 size={15} />
            Prêt pour l’export
          </span>
          <div className="hero-timeline">
            <i />
            <i />
            <i />
          </div>
        </div>
      </section>
      <div className="stats-grid">
        {[
          [Users, s.avatars.length, "Avatars dans le studio", "avatars"],
          [
            Library,
            s.media.filter((m) => !m.missing).length,
            "Ressources disponibles",
            "media",
          ],
          [Layers3, s.templates.length, "Modèles réutilisables", "templates"],
          [Film, completed.length, "Vidéos exportées", "queue"],
        ].map(([Icon, count, label, url], i) => {
          const I = Icon as typeof Film;
          return (
            <button
              className="stat-card"
              key={i}
              onClick={() => navigate(url as string)}
            >
              <span className="stat-icon">
                <I size={20} />
              </span>
              <div>
                <strong>{count as number}</strong>
                <p>{label as string}</p>
              </div>
              <ChevronRight size={16} />
            </button>
          );
        })}
      </div>
      <div className="section-heading">
        <div>
          <h2>Vos derniers exports</h2>
          <p>Les fichiers terminés et contrôlés, prêts à être récupérés.</p>
        </div>
        <Button small onClick={() => navigate("queue")}>
          Tous les exports
          <ArrowUpRight size={15} />
        </Button>
      </div>
      {!completed.length ? (
        <Empty
          title="Votre première vidéo commence ici"
          action={
            <Button onClick={() => navigate("avatars")}>
              Ajouter un avatar
            </Button>
          }
        >
          Ajoutez vos clips avant et après, puis utilisez un modèle de départ.
        </Empty>
      ) : (
        <div className="export-grid">
          {completed.slice(0, 4).map((t) => (
            <button className="export-card" key={t.id} onClick={() => view(t)}>
              <div className="export-cover">
                <img
                  src={taskUrl(t.id, "thumbnail")}
                  alt={"Aperçu " + t.recipe.template.name}
                />
                <span className="play-circle">▶</span>
                <Badge>{t.result?.file.duration} s</Badge>
                {t.recipe.demo && (
                  <span className="demo-tag">DÉMO TECHNIQUE</span>
                )}
              </div>
              <div className="export-info">
                <h3>{t.recipe.template.name}</h3>
                <p>
                  {t.recipe.avatar.name}
                  <span>·</span>
                  {fmtDate(t.updatedAt)}
                </p>
                <div>
                  <Badge tone="green">
                    <CheckCircle2 size={12} />
                    Terminé
                  </Badge>
                  <small>
                    {t.recipe.width} × {t.recipe.height}
                  </small>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      <div className="bottom-grid">
        <section className="panel">
          <div className="section-heading">
            <h2>À vous de créer</h2>
            <Layers3 size={20} />
          </div>
          {s.templates.slice(0, 3).map((t, i) => (
            <button
              key={t.id}
              className="template-row"
              onClick={() => navigate("editor/" + encodeURIComponent(t.id))}
            >
              <span className={`template-mini tone-${i}`}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <strong>{t.name}</strong>
                <small>
                  {t.slots.length} plans ·{" "}
                  {t.slots.reduce((n, s) => n + s.frames, 0) / 30} s ·
                  Modifiable
                </small>
              </div>
              <ChevronRight size={17} />
            </button>
          ))}
        </section>
        <section className="panel">
          <div className="section-heading">
            <h2>En cours au studio</h2>
            <Clock3 size={20} />
          </div>
          {waiting.length ? (
            <>
              <strong className="big-number">{waiting.length}</strong>
              <p>vidéo{waiting.length > 1 ? "s" : ""} dans la file</p>
              <Button onClick={() => navigate("queue")}>
                Suivre les rendus
                <ArrowUpRight size={16} />
              </Button>
            </>
          ) : (
            <div className="quiet-state">
              <span>
                <CheckCircle2 size={26} />
              </span>
              <h3>Tout est à jour</h3>
              <p>Votre file est libre pour de nouvelles créations.</p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
