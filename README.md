# Les dents qui manquent

Un film de Noël de quatre minutes, dessiné, joué et **chanté en direct** par une seule page HTML.
WebGL2 brut et traitement du signal brut : aucune bibliothèque, aucun fichier image ou son, aucune voix de synthèse.

> Chaque hiver, un vieil horloger remonte la boîte à musique de sa femme disparue. Elle joue la mélodie de *Stille Nacht*,
> mais trois lames du peigne sont cassées et la mélodie a des trous. La nuit de Noël, il fredonne les notes manquantes.
> Au matin, sa petite-fille les chante.

## La règle

- **Aucune bibliothèque.** WebGL2 et JavaScript, rien d'autre dans la page.
- **Aucun asset.** Ni image, ni modèle 3D, ni police, ni échantillon, ni enregistrement : tout est calculé à l'ouverture.
- **Aucune voix de synthèse ni IA dans le film.** Les voix sortent d'un modèle physique du conduit vocal.
- **Tout est mesuré.** Chaque réglage est fixé contre une cible chiffrée, et les mesures sont publiées dans [`qa/`](qa/).

## Les voix (semaine 1)

`src/audio/voice.js` simule, échantillon par échantillon :

| organe | modèle |
|---|---|
| cordes vocales | impulsion de débit Liljencrants-Fant paramétrée par Rd, jitter, shimmer, vibrato, trémolo, souffle pulsé |
| conduit vocal | tube à ondes progressives de Kelly-Lochbaum, 44 sections, **ondes de puissance normalisées** (l'énergie est conservée même quand la langue bouge vite) |
| fosses nasales | second tube couplé au voile du palais par une jonction à trois branches |
| articulateurs | trois modes de la langue (d'après le modèle de Story et Titze), pointe, dos, lèvres, voile, glotte, pilotés par des gestes amortis : la coarticulation sort de la dynamique |
| consonnes | constrictions à plateau, cibles virtuelles au-delà du contact, turbulence au point le plus étroit, explosions, barre de voisement par les parois |

Les trois chanteurs (grand-père, grand-mère, enfant) partagent le même conduit à 44 sections. Un conduit plus court tourne
simplement plus vite (87,5 kHz pour lui, 128 kHz pour l'enfant), donc chaque voix est résolue aussi finement et ses
formants se mettent exactement à l'échelle.

## La méthode : des cibles, pas des réglages à l'oreille

| outil | ce qu'il fait | rapport |
|---|---|---|
| `tools/fit.js` | trouve la posture de la langue et des lèvres de chaque voyelle française par optimisation (Nelder-Mead) sur des formants publiés, sous contraintes anatomiques | [`qa/vowels.md`](qa/vowels.md) |
| `tools/calibrate.js` | règle le niveau du bruit de chaque consonne (rendu avec et sans source, différence de puissance) | [`qa/consonants.md`](qa/consonants.md) |
| `tools/demo.js` | chante une berceuse, un fredonnement et une chaîne de voyelles avec les trois voix, mesure la justesse (YIN), le souffle (HNR) et les formants chantés (LPC) | [`qa/voice.md`](qa/voice.md) |
| `tools/confusion.js` + `tools/score_judge.py` | **le juge** : « je dis ___ » dans une liste fermée, Whisper choisit la phrase la plus probable (outil de développement, jamais dans le film) | [`qa/intelligibility.md`](qa/intelligibility.md) |
| `tools/transients.js` | test de non-régression : aucune consonne ne doit claquer | |

```bash
node tools/fit.js          # postures des voyelles  -> src/audio/postures.js
node tools/calibrate.js    # niveaux des consonnes  -> src/audio/consgain.js
node tools/demo.js out     # rendus + mesures       -> out/*.wav, qa/voice.md
node tools/speak.js out    # mots au débit parlé, pour le juge
python3 tools/judge.py MODELE_VOSK out/mot.wav "mot attendu"
```

Node 18 ou plus. Le juge demande Python, `vosk` et un modèle français.

## Où on en est

| mesure | état | seuil |
|---|---|---|
| formants des 15 voyelles | ≤ 4,2 % d'écart, identique pour les trois voix | ✅ |
| justesse chantée | 2 à 10 cents d'écart moyen | ✅ ±10 cents |
| souffle (HNR) | 15 à 19 dB | ✅ voix réalistes |
| consonnes | 13 niveaux calibrés à ±0,5 dB | ✅ |
| **mots compris par le juge** (liste fermée, juge Whisper) | **≈ 20 %** (eSpeak : 60 %, hasard : 8 %) | ❌ chantier en cours |
| clics sur les consonnes | aucun, 16 consonnes × 6 tirages | ✅ |

## Le plan

1. **Les voix** : conduit vocal, voyelles, consonnes, intelligibilité.
2. **La boîte à musique** (lames en synthèse modale), la partition et le mix.
3. **L'image** : moteur WebGL2, la boîte en champs de distance, la pièce, la neige, le givre.
4. **Le film** : mise en scène, montage des quatre minutes, carte personnalisable, mobile.

La mélodie de *Stille Nacht* (Franz Xaver Gruber, 1818) est dans le domaine public. Les paroles sont écrites pour ce film.
