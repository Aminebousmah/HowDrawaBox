# HowDrawaBox

**Entraîneur de dessin avec analyse de tracé en temps réel**, basé sur le cursus [Drawabox](https://drawabox.com).

Tu dessines à la tablette graphique, l'app analyse le trait *pendant* que tu le traces et te dit ce qui ne va pas : le trait ondule, il s'arque, tu as hésité au départ, tes arêtes ne convergent pas vers le point de fuite.

---

## Le principe

La plupart des outils de dessin ne voient que l'image finale. HowDrawaBox travaille sur **les données brutes du trait**.

Chaque point est capturé via la *Pointer Events API* — position, **pression**, **inclinaison du stylet**, **horodatage** — puis le trait est évalué géométriquement selon les principes Drawabox :

```js
points[] = { x, y, pressure, tiltX, tiltY, t }
   ↓
validateur → { score, metrics{}, feedback[] }
```

C'est ce qui permet de distinguer un trait *confiant* d'un trait *hésitant* — deux tracés qui peuvent être visuellement identiques mais dont la signature temporelle diffère du tout au tout. Un trait lent et corrigé est sanctionné même s'il est parfaitement droit.

> **Décision d'architecture :** canvas web custom plutôt que GIMP/Krita. Ces derniers ne fournissent que l'image rendue, jamais la dynamique du geste.

---

## Ce que l'app sait faire

### Analyse live

| Exercice | Ce qui est mesuré |
|---|---|
| **Lignes superposées** | Droiture (écart à la régression linéaire), *fraying* aux extrémités, absence de wobble |
| **Lignes fantômées** | Droiture, précision d'arrivée sur la cible, pénalité d'arc et de micro-oscillation |
| **Ellipses dans des plans** | Fit d'ellipse par moindres carrés, régularité, fermeture de la boucle, inscription dans le plan |
| **Entonnoirs** | Alignement des ellipses sur l'axe mineur |
| **Perspective / boîtes** | Convergence des groupes d'arêtes vers un point de fuite cohérent |

Chaque trait ressort avec un score sur 100, trois qualités synthétiques (Droiture / Fluidité / Précision), le détail des métriques brutes et un feedback qui **nomme la faute**.

### Les cinq espaces

- **Cours** — les 8 leçons du cursus, avec verrouillage progressif et échauffements tirés au sort dans les leçons 1-2
- **Challenges** — les 5 séries longues (250 boîtes, 250 cylindres, 25 textures, 25 roues, 100 coffres), isolées parce qu'elles s'intercalent au cursus au lieu de le suivre
- **Exercices** — 16 exercices praticables, imbriqués sous leur leçon
- **Anatomie** — vidéo de démo + canvas de dessin libre côte à côte, sans notation
- **Dessin libre** — page blanche avec références déplaçables

### L'outil de dessin

**5 brosses réellement distinctes**, pas de simples variations d'opacité :

| Brosse | Rendu |
|---|---|
| Plume | largeur suivant la pression du stylet |
| Feutre | opaque, largeur constante, bouts carrés |
| Crayon | passes multiples, grain fin |
| Craie | grain marqué + semis de particules |
| Aquarelle | passes larges très transparentes |

Taille (0.5→16) et opacité en jauges continues. Gomme au trait entier. **Chaque trait fige ses réglages au moment du tracé** — changer de brosse ne repeint jamais ce qui est déjà sur la page.

Le grain des brosses utilise un PRNG déterministe : un même trait se redessine à l'identique à chaque frame, sinon il scintillerait à chaque redraw.

### Références visuelles

Fenêtres flottantes **déplaçables, redimensionnables et duplicables** : photos (upload ou URL) et vidéos YouTube, pour dessiner en gardant sa référence sous les yeux. La duplication permet de garder deux vues d'une même vidéo — une figée sur une pose, l'autre qui tourne.

---

## Démarrer

Un serveur local est nécessaire : `file://` bloque `fetch` et les modules ES.

```bash
npm start     # node server.mjs → http://localhost:8000
```

Le serveur envoie `Cache-Control: no-store`. Les modules ES sont mis en cache très agressivement par les navigateurs, et sans ça une modification de `src/` peut ne pas être reprise au rechargement — on finit par déboguer du code périmé.

```bash
npm test      # 45 tests de validateurs sur tracés synthétiques, sans navigateur
```

Chaque règle de validation est couverte par un tracé « bon » **et** un tracé « mauvais ».

---

## Contenu pédagogique

**Le corpus Drawabox n'est pas inclus dans ce dépôt.**

L'app lit son contenu depuis un `drawabox.json` (index structuré des leçons, exercices et images) accompagné de `lessons/`, `exercises/` et `content-fr/`. Ces fichiers contiennent le texte intégral du cours — environ 106 000 mots — qui reste la propriété de **Drawabox Art Instruction Inc.** Les republier ici reviendrait à redistribuer le cours ; ils sont donc volontairement exclus (voir [`.gitignore`](.gitignore)).

Sans eux, l'app se lance et affiche un message d'erreur explicite à la place du parcours. Le moteur d'analyse, lui, est entièrement fonctionnel et testable (`npm test`).

Le cours est **gratuit et excellent** — allez le lire à la source : **[drawabox.com](https://drawabox.com)**.

Schéma attendu :

```
{ source, scraped_at, lesson_count, total_pages, exercise_count,
  exercises: [ { id, lesson, name, title, url, file, n_images, images[], markdown } ],
  lessons:   [ { id, part, part_name, title, url, n_pages,
                 exercises: [ {id, title, file, url} ],
                 pages: [ { page, url, section, n_images, images[], videos[], markdown } ] } ] }
```

---

## Architecture

Vanilla JS, modules ES natifs, **zéro dépendance**. Pas de framework, pas d'étape de build.

```
index.html              shell : Cours · Challenges · Pratique · Lecture
server.mjs              serveur statique de dev (no-store)

src/canvas/
  capture.js            capture Pointer Events → points[] bruts
  render.js             rendu papier, cibles, brosses (grain déterministe)

src/validators/
  geometry.js           maths partagées : PCA, régression, arc, wobble
  superimposed-lines.js
  ghosted-lines.js
  fixtures.js           tracés synthétiques
  test.mjs              runner

src/content/
  loader.js             drawabox.json + traductions FR + rendu markdown
  progress.js           progression persistée (localStorage)

src/ui/
  app.js                orchestration des vues, état outil, gomme
  modes.js              un mode par exercice : cible, qualités, métriques
  video.js              fenêtres vidéo flottantes (drag, resize, duplication)
  pip-manager.js        références photo/vidéo déplaçables
  styles.css            thèmes soft / dark / light
```

**Un validateur = un fichier isolé**, testable sans navigateur. Ajouter un exercice noté revient à écrire un module de validation et une entrée dans `MODES` — le reste de l'écran est commun.

---

## Bilingue FR / EN

Bascule FR/EN dans l'en-tête. Le contenu source est en anglais ; les traductions vivent à côté, sans jamais modifier les données d'origine. Repli automatique sur l'anglais avec un bandeau « traduction à venir » tant qu'une page n'est pas traduite.

---

## Crédits

- Cursus, texte pédagogique et images : **[Drawabox](https://drawabox.com)** — © Drawabox Art Instruction Inc. Cours gratuit, soutenez-le.
- Série « Anatomy Quick Tips » : **[Sinix Design](https://www.youtube.com/@sinixdesign)** — lecture via l'embed YouTube officiel, contenu non redistribué.
- Code de l'application : voir [`LICENSE`](LICENSE).
