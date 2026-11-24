# État du projet — Ondule

## Complété (v1.2)
- **Direction 1er → dernier point clarifiée** : profil directionnel tête pleine / queue effilée sur les segments animés (`directionalRibbonProfile`), ordre de suivi des segments multiples corrigé et redémarrage automatique au point 1 dès le premier tracé.
- **Suppression en 1 clic** : bouton *Tout effacer* directement dans la barre supérieure (100 % annulable via `Ctrl+Z` / bouton Annuler) + bouton *Rejouer depuis le début* (`RotateCcw`).
- **10 matières / formes de pinceaux réalistes & graphiques** : `Plume`, `Pinceau` (multi-poils), `Crayon` (graphite + grain), `Pastel` (craie texturée), `Aquarelle` (lavis translucide à bords humides), `Feutre` (pointe biseautée), `Spray` (aérographe/éclaboussures), `Rond`, `Perles`, `Double`.
- **12 presets de brush** organisés en *Réalistes* et *Graphiques* + réglages paramétriques d'**Effilement** (`taper`) et de **Texture / Grain** (`texture`) + accès rapide à l'**Épaisseur** directement depuis le dock flottant.

## Prochaines étapes naturelles
- Ajouter les outils de base complémentaires choisis par l'utilisateur (ex. pipette sur l'image importée, zoom/pan sur la toile pour dessiner des détails, sauvegarde locale/JSON de projet, ou ordre/calques de traits).

## Dette technique potentielle
- Les brosses riches en particules (`Spray`, `Pastel`, `Crayon`) dessinent plusieurs micro-impacts par échantillon : sur des scènes de plus de 50 traits simultanés à 60 ips, un tampon offscreen ou une réduction adaptative de densité en mode édition pourrait préserver la fluidité sur mobile.
