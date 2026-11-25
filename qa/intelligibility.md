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

## Prochaine étape : la synthèse par copie des articulations

Ajuster automatiquement les gestes de chaque consonne (instants, vitesses, lieux, voisement, explosion) pour que la phrase
synthétique se rapproche de la phrase humaine, mesuré par une distance spectrale (MFCC alignés par DTW), puis vérifier au juge.
C'est la même méthode que pour les voyelles, étendue au mouvement.
