# Thème du dashboard Loslo

Le 12 septembre 2026, le dépôt public [elian1907/Dashboard](https://github.com/elian1907/Dashboard) ne contient que son README, sur l’unique branche `main` (commit `2639090b5b4b8722864103c68fa4bf03355d530d`). La référence utilisée est donc la version **web locale** existante dans le dossier `loslo-dashboard`, et non l’ancien thème clair de Scale It. La version Swift publiée confirme les mêmes familles typographiques et l’orientation graphite, mais ses composants natifs ne sont pas importés.

Sources consultées sans modification :

- `app/globals.css` : palette, polices, matériaux, reflets optiques et préférences d’accessibilité. SHA-256 : `c1f8a518bf679f4a0853b51522fa3e93e41cdc28decdccbd3570a721e9dba38e`.
- `components/GlassHighlights.tsx` : un éclairage délégué au pointeur, adapté aux composants du studio. SHA-256 de la référence : `91a3d00ccfea1bf7eefc4360dc04937ab0899daac68e405a42cf500df0e2dfb8`.
- Polices locales Bricolage Grotesque et Hanken Grotesk, copiées avec leurs licences SIL OFL dans `public/fonts/`.

## Mise en œuvre

`src/theme.css` centralise les variables de la référence et leur adaptation aux écrans de montage. Le fond est `#202123`, le texte principal `#f2f2f3`, les surfaces utilisent des dégradés translucides, un flou de 18 px et une saturation de 125 %. Les cartes ont un rayon de 22 px et un reflet de contour masqué, sans ombre portée. Les boutons et la navigation active partagent le matériau de verre sélectionné. Les dialogues utilisent un matériau plus opaque.

Les accents bleu, lavande, ambre et cyan identifient les ressources et les pistes. À la demande de couleurs supplémentaires, les cartes de statistiques portent aussi un léger halo de leur accent et des chiffres teintés ; les actions principales utilisent un dégradé lavande–rose, la navigation active un verre lavande et le bandeau d’accueil des reflets lavande et turquoise. Les états d’erreur et de réussite gardent leur texte explicite en plus de la couleur. Le composant `GlassHighlights` n’intercepte aucun clic et limite ses mises à jour à une par image, sans nouveau rendu React. Il s’arrête quand la fenêtre perd le focus et respecte les préférences de réduction du mouvement, de transparence et de contraste.

Les préférences d’accessibilité remplacent le verre par des surfaces opaques et retirent les reflets mobiles. Les navigateurs sans `backdrop-filter` ont également une surface opaque de secours. Les effets utilisent CSS ; ils ne nécessitent pas le moteur Liquid Glass natif de macOS.

La police de l’aperçu vidéo reste Noto Sans (`Studio`), identique au rendu FFmpeg. Les couleurs, recadrages et textes des vidéos proviennent toujours des recettes. Le thème ne modifie ni les médias, ni les recettes, ni les exports.

## Vérification de cette modification

- Compilation TypeScript / Vite et 24 tests unitaires réussis.
- Navigation et rendu visuel de l’accueil, des modèles, de la médiathèque, des lots, de la file et de l’éditeur dans le navigateur intégré.
- Éditeur à 1280 × 800 et 900 × 720 : aucun débordement du document, timeline et propriétés accessibles.
- Poignée de plan au clavier : passage de 120 à 121 images, plan suivant de 150 à 149 ; annulation à 120 / 150, total conservé à 360 images.
- Curseur placé à l’image 359 : CTA présent, couleur blanche et police `Studio` conservées.
- Dialogue d’import, réglages et dialogue du résultat MP4 contrôlés visuellement.
- Lecture du MP4 de 10 secondes jusqu’à la fin : `ended: true`, `readyState: 4`, aucune erreur vidéo.
- Accueil à 390 × 844 : largeur du document égale à celle du viewport, aucun débordement. Console du navigateur sans erreur.
- La vérification de ressources d’un lot déjà rendu refuse correctement sa combinaison déjà réservée.

Les 19 scénarios d’intégration FFmpeg documentés dans `VERIFICATION.md` ont été validés avant cette modification visuelle. Le moteur n’a pas changé ; ces scénarios n’ont pas été réexécutés pour le thème.
