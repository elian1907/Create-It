# Contrat local Create It — version 1

Base : `http://127.0.0.1:4310/api`. Ne pas exposer sur un réseau public. Toutes les routes de données sont authentifiées. La CLI est le client recommandé pour les scripts locaux.

## Exemple de client Node

```js
import { readFile } from "node:fs/promises";
const token = (await readFile("./data/api-token", "utf8")).trim();
const response = await fetch("http://127.0.0.1:4310/api/tasks", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Idempotency-Key": "campagne-2026-item-001",
  },
  body: JSON.stringify({
    avatarId: "MON_AVATAR_LOCAL",
    templateId: "revelation-12",
    seed: "campagne-001",
    profile: "final",
    demo: false,
  }),
});
if (!response.ok) throw new Error(await response.text());
const task = await response.json();
console.log({ taskId: task.id, status: task.status });
// GET /api/tasks/<id> jusqu’à completed, failed, cancelled ou interrupted.
// GET /api/tasks/<id>/result donne les caractéristiques et chemins réels.
```

La clé ne doit pas être copiée dans un URL ou un journal. Le client accepte uniquement un endpoint local. Une origine tierce est rejetée même si elle fournit un bearer.

## Routes

| Méthode | Route                     | Fonction                                                                   |
| ------- | ------------------------- | -------------------------------------------------------------------------- |
| GET     | `/diagnostics`            | Binaries, encodeurs et filtres réels                                       |
| GET     | `/state`                  | Avatars, ressources, modèles, lots, tâches et réglages                     |
| POST    | `/avatars`                | Ajouter/modifier un avatar et vérifier ses dossiers                        |
| POST    | `/avatars/:id/index`      | Réindexer les dossiers associés                                            |
| POST    | `/media/path`             | Référencer `{path, avatarId, role}` dans un dossier autorisé               |
| POST    | `/media/import`           | Multipart `files`, `avatarId`, `role` ; copie des fichiers                 |
| PATCH   | `/media/:id`              | Tags, rôle, paire/groupe, coupes, exclusion, cadrage                       |
| DELETE  | `/media/:id`              | Retirer uniquement de l’index, sans supprimer l’original                   |
| GET     | `/media/:id/file`         | Lecture locale, avec Range HTTP                                            |
| GET     | `/media/:id/thumbnail`    | Vignette indexée                                                           |
| GET     | `/media/:id/waveform`     | 400 amplitudes, dix premières minutes maximum                              |
| POST    | `/templates`              | Créer une nouvelle version immuable                                        |
| GET     | `/templates/:id/versions` | Toutes les versions d’un modèle                                            |
| POST    | `/selection`              | `{template, avatarId, seed}` : recette d’aperçu admissible, sans tâche     |
| POST    | `/previews`               | `{templateId, avatarId, seed}` : aperçu rendu ou tâche identique existante |
| POST    | `/batches/plan`           | Vérification des ressources, sans mise en file                             |
| POST    | `/batches`                | Mise en file atomique, `Idempotency-Key` requis                            |
| POST    | `/tasks`                  | Une tâche, `Idempotency-Key` requis ; voir l’exemple ci-dessus             |
| GET     | `/tasks/:id`              | Recette et statut réel                                                     |
| POST    | `/tasks/:id/cancel`       | Annuler la tâche et ses processus                                          |
| POST    | `/tasks/:id/retry`        | Relancer depuis le début, trois tentatives maximum                         |
| GET     | `/tasks/:id/result`       | Résultat terminé, sinon HTTP 409                                           |
| GET     | `/tasks/:id/video`        | MP4 validé, compatible lecture partielle                                   |
| GET     | `/tasks/:id/thumbnail`    | Vignette de l’export                                                       |
| GET     | `/tasks/:id/recipe`       | Recette figée                                                              |
| GET     | `/tasks/:id/log`          | Journal réel ou diagnostic d’échec                                         |
| POST    | `/tasks/:id/open-folder`  | Ouvrir le dossier de cet export terminé                                    |
| GET     | `/results`                | Enveloppe de résultats destinée à Scale It                                 |
| POST    | `/recipes/validate`       | Valider une recette et les empreintes de ses fichiers                      |
| POST    | `/settings`               | Pause, concurrence (1–3), dossier de sons, dossier d’export                |
| GET     | `/backup`                 | Sauvegarde JSON réglages/avatars/versions des modèles                      |
| POST    | `/backup/restore`         | Restaurer après vérification des chemins                                   |
| POST    | `/scale-it/import`        | Import d’enveloppe ; ne lance aucun rendu                                  |
| POST    | `/scale-it/:id/enqueue`   | Confirmation de correspondances et rendu explicite                         |

Les routes navigateur `/session` et `/pick-folder` servent au bootstrap local et au sélecteur natif. Une session HttpOnly SameSite Strict et l’en-tête `X-Studio-Client: 1` protègent les opérations du navigateur. Les mêmes schémas Zod sont partagés avec l’interface.

## Corps d’un lot

```json
{
  "name": "Campagne septembre",
  "avatarIds": ["avatar-01", "avatar-02"],
  "templateIds": ["revelation-12", "avant-apres-10"],
  "count": 2,
  "seed": "campagne-septembre",
  "language": "FR",
  "profile": "final",
  "demo": false,
  "exportRootId": "default",
  "externalRunId": "",
  "externalItems": {}
}
```

Le résultat de création inclut `id`, `taskIds` et les consignes. Toutes les ressources et versions sont résolues et figées avant la mise en file. Les recettes sont réservées par une contrainte UNIQUE dans la même transaction.

## Confirmation d’un import Scale It

```json
{
  "templateId": "modele-local-enrichi",
  "avatarMap": { "avatar-scale-it-01": "avatar-local-01" },
  "confirmProduction": true,
  "seed": "lot-externe-01",
  "exportRootId": "default",
  "demo": false
}
```

`Idempotency-Key` est obligatoire. `confirmProduction: false` ne rend rien. Il y a une tâche par item, indépendamment du nombre de `posts`. Le résultat contient les identifiants externes d’origine. `path` reste une référence locale, jamais un URL public supposé.

## Erreurs et statuts

- 400 : JSON/schema invalide, ressource manquante, chemin interdit, fichier changé ou opération non applicable.
- 401 : session ou clé manquante/invalide.
- 403 : hôte/origine tierce ou en-tête navigateur refusé.
- 409 : clé d’idempotence en conflit, combinaison épuisée/doublon, résultat pas encore terminé ou relance indisponible.
- 404 : route ou tâche introuvable.

Le corps d’erreur est `{ "error": "message en français" }`. Les états de tâche sont `queued`, `preparing`, `rendering`, `validating`, `completed`, `failed`, `cancelled`, `interrupted`. Une recette figée peut être consultée même après un échec. Aucun statut de publication sociale n’est retourné.
