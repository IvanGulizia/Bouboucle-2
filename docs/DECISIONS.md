# Décisions d'architecture (ADR)

## ADR-001 — Repère monde centré plutôt que coordonnées normalisées `[0..1]`
- **Contexte** : L'utilisateur doit pouvoir changer le ratio du format à tout moment.
- **Décision** : Stocker les traits en coordonnées centrées relatives à une hauteur de référence fixe (`1000`).
- **Conséquence** : Aucune distorsion des courbes lors d'un changement de ratio ; l'alignement entre image importée et traits reste cohérent.

## ADR-002 — Encodage GIF 100 % client avec `gifenc`
- **Contexte** : Besoin d'un export GIF fiable dans le navigateur sans serveur ni worker externe fragile sous Vite.
- **Décision** : Utiliser `gifenc` avec quantification `rgb565` (256 couleurs) et rendu asynchrone image par image (yield entre chaque trame) + annulation via `AbortController`.

## ADR-003 — Export vidéo natif via `canvas.captureStream` + `MediaRecorder`
- **Contexte** : Produire une vidéo fluide sans dépendance lourde (ex. FFmpeg.wasm ~30 Mo).
- **Décision** : Détecter automatiquement le meilleur codec supporté (`MP4 H.264` en priorité, sinon `WebM VP9/VP8`) et synchroniser la boucle sur `requestAnimationFrame` sur `1×`, `2×` ou `3×` répétitions.
