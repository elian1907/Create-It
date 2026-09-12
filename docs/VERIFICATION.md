# Vérification de la livraison

Vérifications effectuées le 12 septembre 2026 sur macOS ARM64, Node.js 24.13.0, FFmpeg/FFprobe 9.0.1.

## Contrôles automatisés

- `npm run check` : TypeScript, build Vite, **24 tests unitaires** et **19 vérifications d’intégration** réussis.
- `npm audit` : aucune vulnérabilité signalée dans l’arbre de dépendances à la livraison.
- `npm run cli -- validate examples/recipe.json` : `{ "valid": true }`.
- `npm run cli -- batch examples/batch.json demo-first-export` : retourne le lot existant, sans lancer un doublon.

L’intégration utilise les vrais exécutables, une base SQLite isolée et un vrai serveur HTTP. Le rapport généré se trouve dans `examples/integration-report.json`. Les données temporaires de tests sont séparées des médias du studio.

Cas couverts :

- Deux clips techniques analysés, SHA-256, vignettes, réindexation sans doublons et contrôle des rôles.
- Fichier corrompu, fichier absent et source modifiée après préparation refusés.
- Même avatar obligatoire ; rôle, tags, paires/groupes, fichiers verrouillés et durées avec marges.
- Rejeu d’une seed résolue malgré un changement d’historique ; recettes de contenu identique dédupliquées.
- Coupe, fondu, flash : durées exactes et pixels échantillonnés aux bornes attendues.
- Texte accentué, retours à la ligne, contour ; signalement des débordements de zone sûre.
- AAC réel, forme d’onde issue du signal, son original, gel explicite, boucle du passage, image fixe et zoom.
- Réservation SQLite atomique entre deux requêtes, idempotence, conflit de clé.
- Pause, annulation d’un vrai processus, nettoyage et relance depuis le début.
- Retrouver un export validé avant de réencoder.
- Arrêt brutal du service par `SIGKILL`, supervision du processus de rendu, redémarrage et relance de la recette persistée.
- Authentification locale, origines tierces refusées, fichiers hors périmètre et liens symboliques refusés ; lecture MP4 HTTP Range.
- Import Scale It sans exécution automatique, action explicite de génération, correspondances locales, un rendu pour deux destinations et restitution des identifiants externes.

## Contrôles effectués dans l’interface

Le navigateur a été utilisé sur le vrai service local :

1. Le premier export a été retrouvé dans **Vue d’ensemble**, ouvert et lu jusqu’à la fin. Le lecteur a signalé `duration=12`, `currentTime=12`, `ended=true`, vidéo 1080 × 1920, sans erreur média.
2. Un lot « Les 3 modèles · validation interface » a été préparé dans l’écran de génération : un avatar technique, les trois modèles, une variante par couple. Le contrôle a annoncé **3 / 3 recettes préparables**.
3. **Générer les vidéos** a mis les trois tâches en file. Les trois MP4 sont apparus « Terminé » dans l’interface : Révélation 12 s, Avant / Après 10 s et Transformation avec CTA 15 s.
4. Dans l’éditeur, une flèche droite sur le bord du premier plan a changé 120/150 images en 121/149, en conservant 360 images au total. **Annuler** a rétabli 120/150 et l’état enregistré.
5. **Rendre l’aperçu** a produit un MP4 360 × 640 de 12 secondes avec AAC, explicitement présenté comme aperçu en résolution réduite et marqué « Terminé » dans sa fiche.
6. L’accueil et l’éditeur ont été inspectés visuellement à 1280 × 720. La timeline et le cadre vertical sont visibles ensemble dans l’éditeur ; les propriétés possèdent leur propre défilement.

## Preuve vidéo et inspection d’images

`examples/first-export.mp4` est une copie du premier export réel : **12 secondes, 360 images, 1080 × 1920, 30 i/s, H.264/yuv420p + AAC**, avec les textes « DÉMO TECHNIQUE » et « Découvre Loslo ».

`examples/timeline-contact.png` contient huit images, de gauche à droite puis de haut en bas :

| Image du MP4 |    Temps | Observation                                       |
| -----------: | -------: | ------------------------------------------------- |
|            0 |  0,000 s | Plan technique avant, fond violet                 |
|          119 |  3,967 s | Dernière image avant le repère nominal            |
|          120 |  4,000 s | Début de la transition au repère                  |
|          121 |  4,033 s | Pic du flash blanc                                |
|          126 |  4,200 s | Plan après visible, fond vert                     |
|          269 |  8,967 s | Fin du deuxième emplacement, texte encore absent  |
|          270 |  9,000 s | Début du dernier emplacement et apparition du CTA |
|          359 | 11,967 s | Dernière image, texte toujours présent            |

Les mires colorées et le son synthétique servent exclusivement au contrôle du moteur. Aucun visage, corps ou avatar de campagne n’a été inventé pour présenter un résultat marketing.

## Limites des vérifications

Le décodage audio, la présence et la durée de la piste AAC ont été contrôlés. Aucune appréciation subjective de l’écoute, du mixage musical ou du rendu sur un téléphone de publication n’est revendiquée. Le système Windows et ses boîtes de dialogue n’ont pas été testés. Le transfert authentifié vers un Scale It hébergé reste une intégration future distincte.

Les quelques avertissements de build provenant d’annotations de commentaires Zod sont sans effet sur le build. Node 24 signale encore `node:sqlite` comme expérimental ; cette dépendance système est indiquée dans les prérequis. Il n’y a aucun rendu factice ni pourcentage piloté par minuteur.

## Publication GitHub

Le code publié conserve ces preuves de validation historique. Les chemins locaux dans les fichiers JSON de démonstration sont remplacés par `/example/create-it` et `/example/integration`. Ils ne désignent pas des fichiers présents après clonage ; `npm run demo` recrée un export avec les chemins de la nouvelle installation. Les médias personnels, la base SQLite et les secrets du service restent exclus de Git.
