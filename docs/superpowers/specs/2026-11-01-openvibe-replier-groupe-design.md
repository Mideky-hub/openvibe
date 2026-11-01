# OpenVibe — Replier un groupe sur son étiquette

Date : 2026-11-01. Suite de la spec habillage §11 (groupes) et de la spec identité §5.6.

## 1. But

Un groupe de quatre à huit agents prend la moitié du canvas. Quand l'utilisateur travaille ailleurs, il veut le ranger sans rien arrêter : le groupe se **replie** sur son étiquette, ses agents continuent de tourner, et un clic le **déplie**.

## 2. Comportement

- **Replier** : le chevron placé à gauche de l'étiquette du groupe replie le groupe. Le menu ⋯ du groupe (« Replier / Déplier le groupe ») et la palette (« Replier ou déplier le groupe ») font de même. Les terminaux du groupe disparaissent de l'écran ; le cadre ne dessine plus son fond ; seule l'étiquette reste, à sa place.
- **L'étiquette repliée** garde son nom, sa spécialité et ses compteurs (« 4 · 2 en cours · 1 attend ») : on voit encore qui travaille et qui attend. Un agent qui passe à « attend » fait passer le compteur en ambre, comme dépliée.
- **Déplier** : un clic sur le chevron (il devient ▸), le menu ou la palette. Les terminaux reviennent tels qu'ils étaient (même place, même écran, même historique).
- **Rien ne s'arrête.** Replier ne ferme, ne met en pause et ne touche aucun processus. Les terminaux ne sont plus affichés, pas arrêtés : leur sortie continue d'être lue et gardée.
- **Aller vers un agent replié le déplie.** Tout ce qui amène à un agent (clic sur sa ligne du panneau Agents, « Aller à », Ctrl+Tab, palette) déplie d'abord le groupe, puis arrive sur l'agent.
- **Ajouter un agent** à un groupe replié le déplie d'abord (l'agent doit s'afficher pour démarrer). **Dégrouper** supprime le cadre : les agents reparaissent à leur place, hors groupe. **Fermer le groupe** garde sa confirmation et ferme les agents cachés comme les autres.
- **Pas de repli pendant le démarrage.** Un agent caché ne démarre pas (Excalidraw ne monte un nœud qu'une fois affiché, spec groupes spécialisés §4) : tant qu'un agent du groupe attend son tour (« démarrage »), le repli est refusé avec un message.
- **Zone de clic.** Pendant le repli, les terminaux du groupe sont verrouillés (Excalidraw : ni sélection, ni déplacement, ni suppression par un clic ou un lasso) et ignorés par la liaison d'un orchestrateur. Le dépliage les déverrouille tous. Un groupe replié se sélectionne par son étiquette.

## 3. Sauvegarde

L'état « replié » est une propriété du cadre, dans `customData.openvibe.folded` (booléen, absent = déplié) : il part avec la scène, survit au redémarrage, et suit la copie ou l'annulation du cadre. Aucune table nouvelle.

## 4. Hors périmètre

- Replier plusieurs groupes d'un coup.
- Un aperçu miniature du groupe replié.
- Replier un cadre ordinaire (non groupe) : seuls les groupes ont une étiquette.

## 5. À vérifier à la main

- Replier un groupe pendant que ses agents travaillent, puis le déplier : rien n'a été relancé, les écrans sont intacts.
- Redémarrer OpenVibe avec un groupe replié : il l'est toujours, ses agents (reprise) aussi tournent ou se reprennent comme d'habitude.
- Annuler (Ctrl+Z) après avoir replié ou déplié.
