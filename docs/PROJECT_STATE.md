# État du projet — Ondule

## Complété (v1.1)
- **Sortie et entrée douces (`softEdges`)** : sur les tracés ouverts, les segments entrent et sortent progressivement en fondu + effilement (plus aucune coupure nette aux extrémités). Détection automatique des boucles fermées pour un passage continu sans couture.
- **8 presets de brush** accessibles depuis le dock flottant et le panneau de réglages : *Bouboucle*, *Plume vive*, *Crayon animé*, *Perles filantes*, *Onde soyeuse*, *Double filet*, *Souffle*, *Encre fixe*.
- **6 formes de trait** : `Effilé`, `Rond`, `Ruban`, `Perles`, `Craie` (grain organique déterministe), `Double` (double filet parallèle).
- **Capture de la vitesse d'écriture** (`followDrawingSpeed`) : enregistrement des horodatages réels du geste et restitution des accélérations/ralentissements naturels de la main.
- **Contrôle complet du rythme** : longueur du trait, fréquence, amplitude, vitesse, sens inversé, mode de répétition (`Boucle`, `Aller-retour`, `Une fois`), délai entre répétitions (`repeatDelay`) et décalage de départ (`phaseOffset`).
- Import d'images/dessins, sélecteur de formats sans déformation, export GIF & Vidéo côté client (avec prise en charge de `loopIndex` pour le mode `Une fois`).

## Prochaines étapes naturelles
- Choisir parmi les pistes créatives proposées (ex. dégradé de couleur le long du trait, cascade automatique multi-traits, sauvegarde de presets personnalisés, ou export projet `.ondule.json`).

## Dette technique potentielle
- Sur les traits `Craie` très longs avec beaucoup de traits simultanés, le rendu de 4 micro-grains par point pourrait être optimisé sur mobile en adaptant le pas d'échantillonnage ou en mettant en cache un tampon de grain.
- L'export vidéo via `MediaRecorder` reste dépendant du rythme temps réel du navigateur (`WebCodecs` envisagé en Phase 3).
