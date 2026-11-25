# Intelligibilité : les juges et l'état des voix

Les juges sont des outils de **développement uniquement**. Le film n'en contient rien.

## Le test : une liste fermée avec phrase porteuse

Comme en audiologie, chaque voix dit « je dis ___ », où seul le dernier mot change (`tools/confusion.js`) :

- **consonnes** devant /a/ : pas, bas, tas, cas, gars, fa, va, ça, chat, ma, la, rat
- **voyelles** après /p/ : pie, thé, paix, pas, pot, pou, pu, peu, pain, pont, paon

Le juge doit dire laquelle des 12 (ou 11) phrases il a entendue. Le hasard donne 8 % (ou 9 %).
Chaque mot est rendu 3 fois avec des tirages différents, pour les 3 voix.

## Les juges essayés, et pourquoi on en garde un

| juge | ce qui s'est passé | verdict |
|---|---|---|
| Vosk petit modèle, mots libres | ne reconnaît que 6 mots sur 8 sur eSpeak et invente des mots sur les clips courts | trop faible |
| Vosk petit modèle, liste fermée | 50 % sur eSpeak, mais voix d'enfant toujours « inconnue », ±10 points d'un essai à l'autre | trop bruité |
| Vosk grand modèle | ignore les listes fermées (vocabulaire figé à la compilation) | inutilisable ici |
| Whisper, transcription libre | hallucine sur les clips courts (« Merci d'avoir regardé ! ») | inutilisable |
| **Whisper, score de vraisemblance** (`tools/score_judge.py`) | choisit la phrase la plus probable étant donné le son, moins la moitié de son *a priori* linguistique | **retenu** |

Calibrage du juge retenu sur eSpeak NG (voix robotique mais intelligible, outil de test seulement) :
**67 % des consonnes, 55 % des voyelles**. Le juge reconnaît donc une voix de synthèse intelligible.

## État au 25/11, soir

| voix | consonnes | voyelles |
|---|---|---|
| eSpeak (référence) | 67 % | 55 % |
| grand-père | 19 à 25 % | 21 % |
| hasard | 8 % | 9 % |

Ce que les différents juges disent tous :

- **/s/, /l/, /f/ passent**, ainsi que /ɔ̃/ (pont, paon) et /u/ (pou).
- **Les consonnes voisées (b, v, g, m, R) sont entendues /l/** : elles sonnent comme des consonnes glissées.
- **Les occlusives sourdes (p, t, k) se confondent entre elles** : les indices de lieu (explosion, transitions de formants) sont trop faibles.
- **/ʃ/ est entendu /s/ ou /f/.**
- **Les voyelles antérieures et ouvertes se confondent** : i, y, e, ø sont entendues u ou « thé ».

## Le juge sur une vraie voix

Une voix humaine (le propriétaire du projet, 23 phrases dites deux fois, enregistrement utilisé **uniquement comme mesure**,
jamais commité ni utilisé dans le film) :

| juge | consonnes | voyelles |
|---|---|---|
| Whisper (vraisemblance) | 96 % | 82 % |
| Vosk (liste fermée) | 100 % | 91 % |

Le test fonctionne : l'écart avec nos voix est réel.

## La greffe de prosodie

Le grand-père redit les mêmes phrases avec le rythme, la mélodie et l'enveloppe d'intensité **mesurés** sur la voix humaine
(`tools/transplant.js` ; seules trois courbes sont reprises, jamais le son) :

| | consonnes Whisper | voyelles Whisper | consonnes Vosk | voyelles Vosk |
|---|---|---|---|---|
| grand-père, prosodie à la main | 19-25 % | 21 % | 22-31 % | 34-55 % |
| grand-père, prosodie humaine greffée | 17 % | 32 % | 50 % | 64 % |
| voix humaine | 96 % | 82 % | 100 % | 91 % |

La prosodie aide, mais elle ne suffit pas. **Le cœur du problème, ce sont les articulations elles-mêmes** : les consonnes
voisées restent entendues /l/, les occlusives sourdes /s/. Au spectrogramme, la voix humaine bouge en permanence
(formants qui glissent, transitions longues et continues), la nôtre est faite de blocs stables reliés par des transitions brèves.

## Ce qui a été corrigé en chemin (mesuré)

- **Plus aucun clic** : `tools/transients.js` vérifie toutes les consonnes sur 6 tirages (limite +11 dB au-dessus de la voyelle).
  Trois causes trouvées et corrigées : un gain qui sautait d'un coup dans la barre de voisement, une langue qui heurtait le palais à
  pleine vitesse, et l'énergie piégée derrière une occlusion voisée (désormais absorbée par les parois).
- Relâchements des occlusives aussi rapides que les fermetures (~10 ms), dévoisement anticipé avant une consonne sourde,
  explosions filtrées selon le lieu, /ʃ/ reculé et arrondi, murmure nasal plus sourd, consonnes allongées comme en diction chantée.

## La synthèse par copie (tools/copyfit.js)

Un optimiseur ajuste les gestes de chaque consonne (durée, vitesses de fermeture et d'ouverture, lieu, largeur, constriction,
voisement, explosion) pour rapprocher le modèle de la voix de référence (MFCC alignés par DTW).

| essai | ce qu'on a appris | consonnes Whisper | consonnes Vosk |
|---|---|---|---|
| distance brute sur le mot | dominée par le timbre de la voyelle, pas par la consonne | 28-31 % | 19-29 % |
| marge discriminante (plus proche du bon mot que des autres) | 8 consonnes sur 12 deviennent « plus proches du bon mot », mais les juges n'en profitent guère : avec deux prises par mot, l'optimiseur colle aux exemplaires | 28 % | 33-46 % |
| posture du corps de la langue pendant chaque consonne (Öhman) | transitions de formants plus réalistes, sans gain mesurable | 17 % | 31 % |
| source plus tendue (Rd 0,8 et 0,55) | pas de gain | 17-22 % | 25-31 % |
| source parfaitement propre (sans souffle ni vibrato) | pas de gain : le bruit n'est pas en cause | 17 % | 22 % |
| explosions brèves (2,5 ms) | pas de gain | 19 % | 31 % |

Lecture : quand les indices de la consonne sont faibles, le juge retombe sur les mots les plus fréquents de la liste
(« ça », « la »), d'où ces attracteurs. **Les indices consonantiques restent trop faibles, et aucune retouche locale ne les a
renforcés de façon mesurable.** Les gestes ajustés (`src/audio/consfit.js`) ne sont pas activés par défaut.

## L'inversion articulatoire (tools/codebook.js, tools/invert.js)

Un dictionnaire de 60 000 formes du conduit (spectre de chacune), puis, pour chaque tranche de 10 ms d'un enregistrement, les formes
les plus proches et le chemin le plus continu entre elles (Viterbi). Le modèle rejoue ensuite ce chemin (`VOICE.drive`).

| entrée | erreur spectrale moyenne (13 cepstres, au carré) | juge Whisper, consonnes |
|---|---|---|
| notre propre voix (contrôle) | 45 | copie : 8 % (original : 17 %) |
| voix humaine | 189 | copie : 17 % (original : 96 %) |

Sur notre propre voix, l'inversion retrouve la structure de la phrase : la méthode fonctionne. Sur la voix humaine, l'erreur est
**quatre fois plus grande** : l'espace des spectres que le modèle sait produire ne recouvre pas celui d'une vraie voix.
C'est une limite du modèle (trois modes de langue et une seule constriction, longueur de conduit fixe, spectre de source),
pas des règles de gestes. C'est le résultat le plus important de cette série.

## Deuxième enregistrement : 48 phrases, 4 contextes de voyelle

Chaque consonne devant a, i/é/u, ou, et une voyelle nasale (`SETS=cols node tools/confusion.js`), dite deux fois :

| | a | i/é/u | ou | nasale |
|---|---|---|---|---|
| voix humaine, Whisper | 96 % | 100 % | 96 % | 96 % |
| voix humaine, Vosk | 100 % | 100 % | 100 % | 100 % |
| grand-père, Whisper | 17 % | 38 % | 33 % | 33 % |
| grand-père, Vosk | 33 % | 46 % | 46 % | 33 % |
| hasard | 8 % | 8 % | 8 % | 8 % |

## Couverture : le modèle peut-il produire les spectres d'une vraie voix ? (tools/coverage.js)

Distance moyenne (13 cepstres) entre chaque tranche voisée de 10 ms et la forme la plus proche du dictionnaire :

| | erreur | par cepstre c1..c13 |
|---|---|---|
| voix humaine (96 phrases) | 195 | 18 14 17 24 17 15 14 14 14 13 12 10 10 |
| notre propre voix | 90 | 12 6 6 7 5 6 6 11 5 10 5 7 4 |

| longueur du conduit | 16 cm | 17,6 cm | 19 cm |
|---|---|---|---|
| erreur sur la voix humaine | 192 | 195 | 200 |

L'écart (×2,2) est réparti sur **tous** les coefficients, et la longueur du conduit n'y est pour presque rien : aucune cause
unique, l'espace de formes du modèle est globalement trop étroit.

## Pistes suivantes

1. **Élargir l'espace du modèle** et le mesurer avec le même outil : longueur de conduit ajustée au locuteur, plus de modes de
   langue, mâchoire et hauteur du larynx, deux constrictions, spectre de source ajusté. Critère : faire baisser l'erreur sur la
   voix humaine (189) vers celle obtenue sur notre propre voix (45).
2. Puis reprendre l'inversion et en déduire des gestes généraux, avec les nouvelles prises (48 phrases).
