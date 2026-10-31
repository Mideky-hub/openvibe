# OpenVibe — Replier un groupe sur son étiquette

Date : 2026-11-01. Suite de la spec habillage §11 (groupes) et de la spec identité §5.6.

## 1. But

Un groupe de quatre à huit agents prend la moitié du canvas. Quand l'utilisateur travaille ailleurs, il veut le ranger sans rien arrêter : le groupe se **replie** sur son étiquette, ses agents continuent de tourner, et un clic le **déplie**.

## 2. Comportement

- **Replier** : le chevron placé à gauche de l'étiquette du groupe (ou « Replier le groupe » dans le menu ⋯ du groupe, et la palette) replie le groupe. Les terminaux du groupe disparaissent de l'écran ; le cadre ne dessine plus son fond ; seule l'étiquette reste, à sa place.
- **L'étiquette repliée** garde son nom, sa spécialité et ses compteurs (« 4 · 2 en cours · 1 attend ») : on voit encore qui travaille et qui attend. Un agent qui passe à « attend » fait passer le compteur en ambre, comme dépliée.
- **Déplier** : un clic sur le chevron (il devient ▸), ou « Déplier le groupe » du menu. Les terminaux reviennent tels qu'ils étaient (même place, même écran, même historique).
- **Rien ne s'arrête.** Replier ne ferme, ne met en pause et ne touche aucun processus. Les terminaux ne sont plus affichés, pas arrêtés : leur sortie continue d'être lue et gardée.
- **Aller vers un agent replié le déplie.** Le panneau Agents (clic sur une ligne), « Aller à », Ctrl+Tab et la barre de consigne qui cible un agent du groupe dépliant d'abord le groupe, puis agissent.
- **Fermer le groupe, le dégrouper, lui ajouter un agent** déplient d'abord le groupe : on agit sur ce qu'on voit.
- **Zone de clic.** Les cases laissées vides par un groupe replié ne sont ni sélectionnables ni déplaçables au lasso : un groupe replié se sélectionne par son étiquette.

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
