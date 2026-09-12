# Create It

Application **locale** de montage vidéo par modèles, en français. React + TypeScript + Vite, service Node.js, SQLite et FFmpeg. Aucun modèle d’IA, compte ChatGPT/Claude ou service payant n’intervient dans la sélection ou le rendu.

L’interface reprend le thème graphite et les effets de verre du dashboard web Loslo : polices locales, reflets au pointeur, accents pastel et adaptation aux préférences d’accessibilité. Voir [les références du thème](docs/THEME.md).

## Démarrage

Prérequis : **Node.js 24 ou plus**, npm, FFmpeg et FFprobe disponibles dans le `PATH`.

```sh
git clone https://github.com/elian1907/Create-It.git
cd Create-It
npm ci
npm run build
npm start
```

Ouvrir **http://127.0.0.1:4310**. Le service écoute exclusivement sur `127.0.0.1` ; ne pas l’exposer sur Internet. `Ctrl+C` arrête proprement le service. Après cette première installation, `npm start` suffit pour relancer l’application. Un clone neuf crée automatiquement un studio vide ; la démonstration ci-dessous fournit un premier essai.

Pour développer :

```sh
npm run dev
```

La même adresse sert l’interface et l’API. Vite recharge l’interface ; `tsx watch` redémarre le service après une modification du serveur. Un redémarrage pendant un rendu l’interrompt.

Installation de FFmpeg :

- macOS avec Homebrew : `brew install ffmpeg`.
- Windows avec winget : `winget install Gyan.FFmpeg`, puis rouvrir le terminal.
- Autre distribution : installer FFmpeg et FFprobe depuis le gestionnaire de paquets ou les [sources officielles FFmpeg](https://ffmpeg.org/download.html).

Si nécessaire, définir `FFMPEG_PATH` et `FFPROBE_PATH` avec les chemins absolus des binaires. `MONTAGE_DATA` change le dossier des données ; `PORT` change le port (4310 par défaut). Un dossier de données ne doit être utilisé que par un service à la fois. L’écran **Réglages** affiche un diagnostic réel des binaires, encodeurs et filtres ; un composant manquant bloque le rendu avec les instructions d’installation.

Des lanceurs `Lancer-Create-It.command` (macOS) et `Lancer-Create-It.bat` (Windows) sont fournis. Ils installent les dépendances si nécessaire, construisent l’interface puis démarrent le service. Les scripts et chemins Windows sont prévus ; **les tests ont été exécutés sur macOS, pas sur Windows**.

## Premier essai sans vos vidéos

Arrêter le service, puis :

```sh
npm run demo
npm start
```

La commande crée un avatar **Démo technique**, deux mires vidéo animées, un signal audio synthétique et un modèle de démonstration. Elle produit un vrai MP4 1080 × 1920 de 12 secondes et le valide. Ces fichiers ne représentent aucun avatar réel du projet. Le premier export est retrouvé par sa clé d’idempotence si la commande est répétée. Les fichiers réservés à cette démonstration peuvent être recréés par cette commande ; elle ne doit pas être exécutée pendant que le service tourne.

Depuis **Vue d’ensemble** ou **File d’export**, ouvrir l’export : lire le MP4, copier son chemin, ouvrir le dossier, télécharger le résultat et consulter sa recette et son journal. Une copie du premier MP4 ainsi que sa recette et son résultat sont livrés dans `examples/`. Les chemins des exemples publiés sont anonymisés sous `/example/create-it` : ce sont des références documentaires. `npm run demo` produit les recettes et résultats avec les chemins valides de votre installation dans `data/exports/`.

## Ajouter vos avatars et vos ressources

1. Dans **Avatars**, ajouter un nom, une langue par défaut et, si nécessaire, l’identifiant Scale It. L’identifiant local reste stable.
2. Associer des dossiers existants aux rôles avant, après et neutre. Le sélecteur natif est proposé sur macOS et Windows ; la saisie d’un chemin absolu est aussi disponible. C’est le service local qui vérifie et lit ces dossiers, pas un accès illimité donné au navigateur.
3. Enregistrer et indexer. Une réindexation détecte les nouveaux fichiers, les modifications et les fichiers absents. Les noms peuvent suggérer des tags ; les métadonnées corrigées manuellement font référence.
4. Autre possibilité : **Médiathèque → Importer des fichiers** pour copier des fichiers dans le studio, ou référencer un chemin déjà autorisé. Pour les sons, associer un dossier dans **Réglages** ou importer une copie directement.
5. Ouvrir une ressource pour la lire, définir ses tags, son rôle, sa paire, son groupe, ses points d’entrée/sortie et son cadrage par défaut. L’exclusion désactive le tirage automatique ; un fichier peut être imposé manuellement. Retirer de l’index conserve toujours l’original et les recettes historiques.

Organisation conseillée, sans obligation de déplacer vos fichiers :

```text
mes-medias/
  avatar-01/
    before/
    after/
    neutral/
  avatar-02/...
  sons/
exports/                  # séparés des originaux
```

Vidéo : MP4, MOV, MKV, WebM, M4V. Images fixes : PNG, JPEG, WebP. Audio : MP3, WAV, M4A, AAC, FLAC, OGG. Le navigateur peut ne pas lire certains codecs sources que FFmpeg sait convertir ; l’aperçu rendu et les exports restent en H.264. Les métadonnées FFprobe et les empreintes SHA-256 sont enregistrées. Les sources HDR/BT.2020 ou supérieures à 8 bits sont refusées : les convertir explicitement en SDR avant import. Les liens symboliques sortants ne sont pas suivis. Un import copié accepte 30 fichiers et 512 Mo par fichier ; un dossier associé permet de référencer des fichiers plus gros sans les téléverser.

## Créer un modèle

Les trois modèles de départ sont **Révélation 12 s**, **Avant / Après 10 s** et **Transformation avec CTA 15 s**. Leurs musiques ne sont pas imposées. On peut créer autant de modèles que nécessaire, les dupliquer, importer/exporter leur JSON et enregistrer de nouvelles versions. Le modèle technique supplémentaire n’est qu’une démonstration.

Dans l’éditeur :

- Choisir un avatar pour la prévisualisation. La bibliothèque à gauche permet de verrouiller un fichier dans le plan sélectionné.
- Sélectionner un plan sur la timeline. Modifier rôle, tags, contraintes de paire/groupe, durée, entrée source, vitesse, traitement explicite d’un clip court et son original dans le panneau de droite.
- Déplacer les plans par glisser-déposer ou avec les boutons gauche/droite. Ajuster le bord entre deux plans à la souris ou avec les flèches du clavier : la durée totale est conservée. Les champs chiffrés permettent de modifier la durée globale. Annuler/rétablir : boutons ou `Cmd/Ctrl+Z`, `Cmd/Ctrl+Maj+Z`.
- Choisir coupe franche, fondu ou flash blanc. Le zoom progressif et le cadrage remplir/contenir sont appliqués réellement à l’export. Les positions X/Y sont manuelles.
- Dans **Son**, associer un fichier, l’écouter, voir sa forme d’onde, choisir son point de départ, son volume et ses fondus. Les repères sont manuels. La forme d’onde analyse au plus les dix premières minutes ; aucun beat n’est inventé.
- Dans **Texte**, ajouter des textes avec retours à la ligne, position, taille, couleur, contour et ombre. Noto Sans est embarquée sous licence SIL OFL, avec sa licence dans `public/fonts/OFL.txt`. Le moteur compose des calques PNG transparents avec cette même police ; aucun texte utilisateur n’est injecté dans une commande shell ou dans un filtre FFmpeg.
- Dans **Format**, choisir vertical, carré ou paysage, les marges de sécurité et le mode de sélection (libre ou même paire obligatoire). Un texte qui dépasse la zone sûre empêche le rendu jusqu’à correction.

**L’aperçu interactif** sert au cadrage et à la position des textes. Il n’émule pas les transitions ou le mixage. **Rendre l’aperçu** enregistre les modifications et produit une vidéo à un tiers de la résolution avec le même moteur que le rendu final. Le résultat est identifié comme aperçu ; il reste disponible dans la file. Le rendu fait référence pour la validation finale.

Enregistrer crée une nouvelle version. Les recettes des lots déjà créés conservent leur ancienne version et les métadonnées de leurs ressources.

## Timeline et transitions : convention exacte

La cadence est fixée à **30 images/s**. Les durées et positions de montage sont des entiers en images. Un modèle est une suite de plans contigus, dont les longueurs s’additionnent à la durée totale.

Pour le modèle 12 s : plan avant `[0,120)`, révélation `[120,270)`, conclusion `[270,360)`. Les repères restent à 4 s et 9 s, indépendamment des effets.

Une transition sortante commence à la **borne nominale B du plan suivant** et se termine B+D images plus tard. Le plan sortant fournit D images de marge, plus un échantillon de garde pour l’extrémité du filtre. Le plan entrant commence au repère B. Le chevauchement ne retranche rien aux durées nominales et ne décale pas les plans suivants. Le flash utilise la courbe `fadewhite` de FFmpeg ; son pic blanc n’est pas supposé se trouver exactement au milieu de la fenêtre. Une transition doit tenir dans les deux plans adjacents ; le dernier plan se termine par une coupe.

Chaque entrée est normalisée : rotation, pixels non carrés, cadence, dimensions sans étirement, format pixel, horodatage et base de temps commune. Les compositions sont bornées en nombre d’images après chaque jonction. Le son original, s’il est activé et présent, change à la borne nominale ; les fondus vidéo ne créent pas de fondu audio entre les clips. La musique est une piste continue avec ses fondus propres.

Les clips trop courts sont refusés par défaut, **marge comprise**. Les options explicites sont « figer la dernière image » ou « boucler le passage choisi ». La vitesse se règle manuellement entre 0,5× et 2×. Les boucles respectent les points d’entrée/sortie. Une image fixe doit être explicitement associée. La musique trop courte est refusée sauf si sa boucle est cochée.

## Générer un lot et retrouver les résultats

Dans **Génération par lots** : sélectionner avatars et modèles, nombre de variantes par couple, langue, nom du lot, dossier d’export et profil. Le total vaut avatars × modèles × variantes. TikTok + Instagram restent deux destinations d’un même contenu, pas deux rendus.

**Vérifier les ressources** prépare le contrôle des contraintes. **Générer les vidéos** vérifie de nouveau et réserve toutes les recettes dans une transaction SQLite avant le traitement. Le lot n’est pas partiellement mis en file si certaines combinaisons sont impossibles. Après mise en file, l’échec d’une tâche n’efface pas les résultats des autres.

La sélection respecte strictement l’avatar, le rôle, les tags, paires/groupes, exclusions, fichiers imposés et durées. Les empreintes sont revérifiées avant le rendu. Aucun remplacement par un autre avatar n’existe. Une préférence pour les ressources moins utilisées est disponible.

La **seed de départ du lot** sert au tirage. Chaque recette enregistre une **seed de tâche résolue**, avec le suffixe `::files=…` qui fixe les choix dans la liste stable des candidats. Rejouer cette seed avec le même modèle et les mêmes ressources reproduit les décisions même si l’historique d’utilisation a changé. La recette complète est l’artefact à conserver pour la relance. La reproductibilité bit à bit d’un MP4 entre versions de FFmpeg, polices, encodeurs ou machines n’est pas promise.

Le hash de recette se fonde sur le contenu et les réglages réellement rendus, sans dépendre du nom des fichiers ou de la seed. Sa contrainte UNIQUE réserve les recettes, y compris entre requêtes simultanées. Les recettes annulées/échouées restent réservées ; relancer la tâche correspondante au lieu de reproduire silencieusement le même contenu. Si le stock ne permet plus de variantes, ajouter des ressources, libérer les contraintes ou modifier le montage. Il n’existe pas de variantes infinies.

La file utilise les états : en attente, préparation, rendu, validation, terminé, échec, annulé, interrompu. La progression vient de `FFmpeg -progress`. Aucune durée restante artificielle n’est affichée. La pause laisse finir les tâches actives. L’annulation arrête uniquement les processus associés à la tâche. Un superviseur de processus coupe aussi FFmpeg si le service disparaît brutalement.

Fermer l’onglet n’arrête pas un export. Arrêter le service ou l’ordinateur l’interrompt. Après redémarrage, les tâches en cours deviennent « interrompues » ; les relancer recommence depuis le début avec leur recette figée. Un export validé déjà présent est retrouvé avant de réencoder. La limite est de trois tentatives par tâche. La concurrence se règle de 1 à 3, avec **1 par défaut**.

Les exports sont classés :

```text
data/exports/
  nom-du-lot-identifiant/
    avatar-identifiant/
      modele-identifiant-tache/
        video.mp4
        thumbnail.jpg
        recipe.json
        result.json
        render.log
```

Un dossier `.partial` isolé est renommé atomiquement après validation. Les originaux et exports existants ne sont pas écrasés. Les journaux d’erreur se trouvent à côté de la destination et dans l’interface. Les aperçus sont regroupés sous `exports/apercus/`.

Un succès nécessite : fichier non vide, décodage intégral sans erreur, H.264/yuv420p, dimensions/cadence prévues, nombre **exact** d’images, durée vidéo cohérente à une image près, AAC présent si un son est utilisé. Un code de sortie nul ne suffit pas.

## Scale It

Le dépôt [elian1907/Scale-it](https://github.com/elian1907/Scale-it) a été inspecté au commit **bc4b2599ce0a8848166b46c2e75743db7f934bd9**. Le contrat est vérifié dans `app/model.ts` et l’export d’enveloppe dans `app/dashboard.tsx`. Aucun fichier de Scale It ni de Carousel Studio n’a été modifié.

Dans **Génération par lots → Importer Scale It**, importer l’enveloppe JSON version 1 (`version`, `exportedAt`, `run`, `model`, `avatars`, `media`, `note`). Le modèle dupliqué doit correspondre à `run.modelSnapshot`. Les avatars sont dédupliqués par identifiant ; les identifiants du lot et de chaque item sont conservés.

L’import enregistre des consignes, **sans déclencher de rendu**. Associer chaque avatar externe à un avatar local et choisir un modèle local enrichi vérifié, ou créer un modèle à partir des slots et le compléter dans l’éditeur. Les slots anciens deviennent des plans successifs, durées arrondies à l’image ; une durée totale incohérente est refusée. `any` reste dans le même avatar. `carousel` devient une image à verrouiller explicitement. `music` textuel reste une indication ; aucun fichier audio n’est inventé. Le CTA ancien est signalé pour être placé manuellement.

Les URLs de médias ne sont jamais téléchargées par cet adaptateur. Elles peuvent exiger l’authentification du propriétaire. Le résultat retourne `externalRunId`, `externalItemId`, avatar local/externe, modèle/version, statut réel, propriétés du MP4 et chemin local. Aucun URL public, `outputId` Scale It ou statut « publié » n’est inventé.

Un lot `paused` ou `demo` exige la confirmation explicite de génération dans l’interface. La case de démonstration identifie les exports ; une levée de cette option est une action utilisateur visible. Les résultats s’exportent en JSON depuis la file.

Le raccordement automatique au Scale It hébergé reste distinct : un **agent local authentifié** pourrait récupérer les consignes sur le serveur puis téléverser les fichiers et résultats avec une référence de stockage authentifiée. Un site distant ne doit pas accéder directement à ce localhost. Le service n’est pas publié sur Internet.

## CLI et API

Le service doit être démarré. La CLI lit la clé dans `data/api-token` sans l’afficher :

```sh
npm run cli -- diagnostic
npm run cli -- status
npm run cli -- status IDENTIFIANT_TACHE
npm run cli -- validate examples/recipe.json
npm run cli -- batch examples/batch.json MA_CLE_UNIQUE
npm run cli -- result IDENTIFIANT_TACHE
npm run cli -- cancel IDENTIFIANT_TACHE
npm run cli -- import examples/scale-it-envelope.json
npm run cli -- results
```

Les chemins de l’exemple de recette désignent les fichiers de la démonstration livrée. Sur une autre machine, créer une nouvelle démonstration et utiliser sa recette. Le lot d’exemple est celui du premier export : utiliser sa clé `demo-first-export` permet de retrouver cette tâche existante. Pour créer d’autres contenus, modifier le lot/les ressources et utiliser une nouvelle clé.

Voir [docs/API.md](docs/API.md) pour les routes et un client Node. Les mutations acceptent `Authorization: Bearer …` ; la création de lot/tâche exige `Idempotency-Key`. Même clé + même demande retourne le résultat de mise en file existant ; même clé + demande différente retourne HTTP 409. L’API ne simule jamais un export terminé.

## Sécurité, stockage et sauvegardes

SQLite utilise WAL, des transactions de réservation et une table de migrations (version 1). Schéma dans `server/db.ts`. Les médias restent sur disque. `data/`, secrets locaux, dépendances et builds sont exclus de Git. L’archive de distribution ne contient pas de jeton ni de base personnelle.

La session navigateur est locale (cookie HttpOnly/SameSite Strict), le bootstrap et les mutations exigent un en-tête propre au studio, les origines tierces et hôtes inconnus sont rejetés. Pas de CORS ouvert. Les outils en ligne de commande utilisent un bearer local. Une personne ayant accès au compte système et au disque a naturellement accès à ces données locales.

Les chemins réels sont contrôlés contre les dossiers autorisés. Les parents d’export sont vérifiés à chaque niveau, sans traverser de lien symbolique sortant. FFmpeg et FFprobe sont lancés par arguments structurés, sans shell. Les protocoles d’entrée sont limités aux fichiers locaux. Les noms de sortie sont uniques et compatibles macOS/Windows.

**Réglages → Exporter les réglages** sauvegarde avatars, dossiers et versions des modèles. La restauration vérifie les chemins et crée de nouvelles versions de modèles. Pour sauvegarder aussi médias, métadonnées, lots et historique : arrêter le service puis copier le dossier `data` et les dossiers sources externes. Conserver les mêmes chemins, ou réassocier/réindexer après déplacement. Une recette historique dont les sources ont déménagé ne doit pas être réécrite silencieusement : recréer un lot à partir des nouvelles associations.

## Vérifications et limites

```sh
npm test                   # tests unitaires
npm run test:integration   # vrais FFmpeg, SQLite et serveur HTTP
npm run check              # TypeScript, build, unitaires et intégration
```

L’intégration utilise un répertoire temporaire isolé et des mires techniques. Elle vérifie les trois transitions, le texte accentué, la musique, les boucles explicites, le gel d’image, le zoom, les images fixes, la durée exacte, les ressources absentes/corrompues, les empreintes, les doublons, l’idempotence, la pause, l’annulation, la reprise, les protections HTTP et un arrêt brutal `SIGKILL` suivi d’un redémarrage réel. Les tests unitaires couvrent notamment mélange d’avatars interdit, tags, paires, déterminisme, zones sûres et traversées de chemins. Voir `examples/integration-report.json` et [docs/VERIFICATION.md](docs/VERIFICATION.md).

Limites assumées de cette version : pas de génération IA, détection de beats/corps/visages, import propriétaire CapCut, colorimétrie HDR, publication sociale, transfert authentifié automatique vers Scale It ou application de bureau empaquetée. Une seule famille de police est embarquée. L’aperçu interactif reste indicatif ; le rendu est la référence. Les textes ne sont pas automatiquement traduits. Limites de protection : 35 plans/modèle, 10 minutes/modèle, 20 textes, 500 tâches/lot, recherche de 100 000 combinaisons au maximum. Aucune limite artificielle à trois modèles dans la bibliothèque.

Les tests ont été effectués avec Node 24.13.0 et FFmpeg 9.0.1 sur macOS ARM64. Les vidéos techniques ont été inspectées visuellement et leur audio décodé ; aucune validation subjective de l’écoute musicale ni aucun test Windows n’est revendiqué.

## Organisation du code

```text
shared/schema.ts      Contrats Zod, types, 3 modèles de départ
server/db.ts          SQLite, migrations, versions et persistance
server/files.ts       Périmètres de fichiers, empreintes, noms
server/media.ts       Analyse FFprobe, indexation, vignettes, onde
server/planner.ts     Contraintes, seeds et identité des recettes
server/text.ts        Composition typographique et zone sûre
server/engine.ts      Graphe FFmpeg, validation et sortie atomique
server/process.ts     Appels binaires et diagnostic de capacités
server/subprocess.mjs Supervision des processus en cas de crash
server/queue.ts       Lots, idempotence, pause, annulation, reprise
server/scale-it.ts    Adaptateur d’enveloppe et correspondances
server/api.ts         API, session locale et contrôles d’origine
server/cli.ts         Interface en ligne de commande
src/                  Application React et éditeur en français
tests/                Tests unitaires et intégration réelle
examples/             Modèles, recette, résultat, vidéo, contrats
```

Références techniques : [FFprobe (sortie JSON)](https://ffmpeg.org/ffprobe.html), [filtres FFmpeg](https://ffmpeg.org/ffmpeg-filters.html), [SQLite dans Node](https://nodejs.org/api/sqlite.html). Les capacités effectives du binaire installé sont contrôlées à l’exécution.
