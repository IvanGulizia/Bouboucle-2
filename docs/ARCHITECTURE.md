# Architecture — Ondule

## Vue d'ensemble

L'application est une SPA React + TypeScript 100 % côté client (zéro serveur requis pour le rendu ou l'export).

```
src/
├── types/
│   ├── studio.ts          # Modèles de données (traits, paramètres, toile, export)
│   └── gifenc.d.ts        # Typage TypeScript de gifenc
├── engine/
│   ├── geometry.ts        # Coordonnées monde centrées, lissage Chaikin, rééchantillonnage uniforme, hit-test, bruit 1D
│   ├── renderer.ts        # Moteur de rendu Canvas 2D déterministe (live 60 ips + export hors-écran)
│   └── exporter.ts        # Export GIF (gifenc) et Vidéo (captureStream + MediaRecorder)
├── hooks/
│   └── useStudioHistory.ts # Pile Annuler / Rétablir immuable
└── components/
    ├── TopBar.tsx         # Barre supérieure (format/ratio, lecture, durée, historique, export)
    ├── CanvasStage.tsx    # Scène interactive 60 ips, pointeur/stylet, glisser-déposer
    ├── BottomDock.tsx     # Barre flottante d'outils, teintes et modes d'animation
    ├── InspectorPanel.tsx # Panneau latéral repliable (paramètres du trait, toile & image)
    └── ExportModal.tsx    # Dialogue d'export GIF & Vidéo avec aperçu et progression
```

## Système de coordonnées indépendant du ratio

Les points des traits sont stockés dans un repère monde centré en `(0, 0)` dont la hauteur de référence vaut `1000` unités (`WORLD_REF_HEIGHT`). Changer le ratio (`1:1`, `4:5`, `9:16`, `16:9`, `4:3`, `Auto`) adapte simplement le cadrage autour du centre sans jamais déformer ni étirer les traits existants.

## Bouclage parfait (Seamless Loop)

Toutes les animations sont évaluées de manière purement déterministe à partir d'une phase normalisée `phase ∈ [0, 1)`. Les vitesses sont des multiples entiers de cycles par boucle, garantissant une continuité parfaite entre la dernière et la première image en GIF comme en vidéo.
