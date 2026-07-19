# CLAUDE.md — Drawabox Trainer

Application d'apprentissage du dessin avec **validation de tracé en temps réel**, basée sur le cursus Drawabox. L'utilisateur dessine à la tablette graphique ; l'app analyse le trait en direct et donne un feedback immédiat sur sa qualité (droiture, fluidité, confiance, convergence).

## Principe directeur

La valeur de l'app = l'analyse **stroke-level en temps réel**. On capture chaque point du tracé (position, pression, tilt, timing) et on évalue la qualité selon les principes Drawabox. On ne se contente PAS d'analyser une image rendue — on travaille sur les données brutes du trait.

> Décision d'architecture actée : **canvas web custom**, pas GIMP/Krita. Ces derniers ne donnent que l'image finale, pas les données de tracé live. Krita reste un outil annexe pour le dessin libre, hors périmètre de l'app.

## Stack technique

- **Front / canvas** : HTML5 `<canvas>` + **Pointer Events API** (`pointerdown/move/up`), avec `pressure`, `tiltX/tiltY`, `timeStamp`. Support tablette natif, aucun driver.
- **Analyse de tracé** : JavaScript pur sur le tableau de points. Pas de dépendance lourde au départ. (Option ultérieure : WASM/OpenCV pour le fit d'ellipse avancé.)
- **Contenu pédagogique** : `drawabox.json` (voir plus bas) alimente consignes, images et exercices.
- **Feedback** : validation locale (règles géométriques, instantanée) + appel LLM optionnel pour un retour qualitatif nuancé.
- **Build** : rester simple — vanilla JS ou Vite. Pas de framework lourd tant que le MVP n'est pas validé.

## Données pédagogiques (déjà scrapées, présentes dans ce repo)

Contenu intégral de Drawabox récupéré pour usage personnel.

- `lessons/*.md` — 13 leçons/challenges (60 pages, 617 images).
- `exercises/*.md` — 16 exercices dédiés (245 images) : 10 pour la leçon 1, 6 pour la leçon 2.
- `drawabox.json` — index structuré, **source de vérité** pour le contenu de l'app.

Schéma `drawabox.json` :
```
{ source, scraped_at, lesson_count, total_pages, exercise_count,
  exercises: [ { id, lesson, name, title, url, file, n_images, images[], markdown } ],
  lessons:   [ { id, part, part_name, title, url, n_pages,
                 exercises: [ {id, title, file, url} ],
                 pages: [ { page, url, section, n_images, images[], videos[], markdown } ] } ] }
```

Règle : l'app lit le contenu depuis `drawabox.json`. Ne pas ré-scraper le site. Le contenu est du markdown avec images `![](url)` (URLs CloudFront directes).

## Critères de validation par type d'exercice

À implémenter progressivement. Les seuils sont à calibrer empiriquement.

- **Superimposed lines** : une seule passe, pas d'aller-retour. Mesurer la droiture (écart à la régression linéaire du tracé), le « fraying » (divergence à un seul bout = OK, aux deux bouts = départ mal placé), l'absence de wobble (variance de la courbure).
- **Ghosted lines / planes** : droiture + précision de l'arrivée sur le point cible (distance point final ↔ cible). Pénaliser l'arc (courbure globale) et le wobble (micro-variations de direction).
- **Ellipses (tables, in planes, funnels)** : fit d'ellipse par moindres carrés → mesurer l'erreur résiduelle (régularité), la fermeture (le tracé doit boucler et se superposer), le degré cohérent, l'inscription dans les bornes (plan/funnel).
- **Boxes / perspective (rough, rotated, organic, 250 boxes)** : convergence des groupes d'arêtes vers des points de fuite cohérents (les lignes d'un même set doivent converger, pas diverger). Mesurer l'erreur de convergence.
- **Signaux transverses** : vitesse de tracé (un trait confiant est rapide et régulier — la lenteur/hésitation dégrade le score), pression stable, pas de corrections.

Chaque validateur prend `points[] = {x, y, pressure, tiltX, tiltY, t}` et retourne `{ score, metrics{}, feedback[] }`.

## Arborescence cible

```
/                      racine du projet (= ce dossier)
  CLAUDE.md            ce fichier
  drawabox.json        contenu pédagogique (source de vérité)
  lessons/  exercises/ markdown + images de référence
  src/
    canvas/            capture Pointer Events, rendu du trait
    validators/        un module par type d'exercice (lines, ellipses, boxes)
    content/           chargement + parsing de drawabox.json
    ui/                sélection d'exercice, affichage consigne + feedback
  index.html
```

## Conventions

- Code et commentaires : concis, techniques. Noms explicites.
- Un validateur = un fichier isolé, testable indépendamment avec des tracés de fixtures.
- Toute nouvelle règle de validation doit être accompagnée d'un test sur un tracé exemple (bon + mauvais).
- Ne jamais modifier `lessons/`, `exercises/`, `drawabox.json` (données figées). Générer les nouveaux fichiers dans `src/`.

## Roadmap

1. **MVP** : canvas qui capture un trait + validateur « superimposed lines » (droiture + fluidité) affichés en direct. Objectif : valider l'approche stroke-level.
2. Charger `drawabox.json` → écran de sélection d'exercice avec consigne + images.
3. Ajouter les validateurs ellipses puis boxes.
4. Système de warmup/session (les leçons 3-7 réutilisent les exercices 1-2 comme échauffement).
5. Feedback LLM optionnel sur le tracé.

Jalon prioritaire = étape 1, en un seul fichier HTML jouable à la tablette.

## Préférences de travail

- Répondre en **français**, aller droit au but, ton technique, pas de remplissage.
- Exécution autonome ; signaler explicitement les transitions de phase.
- Si blocage : une seule question ciblée.

## Optimisation du contexte Claude

**drawabox.json fait 717 KB — ne JAMAIS le lire complet.** Ça consomme énormément de tokens.

Bonnes pratiques pour garder la fenêtre économe :

- ❌ **Jamais lire drawabox.json complet** — utiliser `grep`/`Bash` pour les recherches ciblées
- ✅ **Utiliser `grep`/`Bash` pour chercher** — ex. `grep "testfree" drawabox.json` au lieu de Read
- ✅ **Lire seulement les offsets/limites pertinentes** — `Read(file, offset: 100, limit: 20)` plutôt que tout le fichier
- ✅ **Utiliser `filter="interactive"` pour read_page** — récupère juste les boutons/inputs, pas tout le HTML
- ✅ **Être concis dans les descriptions** — pas de prose, juste les faits techniques

Consommateurs de contexte à surveiller :
1. drawabox.json (717 KB) — PROHIBÉ
2. read_page() répétés — limiter ou utiliser des filtres
3. Explications verboses — préférer des résumés techniques serrés

## Notes

- Contenu Drawabox © Drawabox Art Instruction Inc — usage d'étude personnel uniquement.
- Non inclus dans le scrape (ajoutables à la demande) : FAQ par leçon, article « The 50% Rule », URLs des vidéos de démo.
