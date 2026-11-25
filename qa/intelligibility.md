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

## Ce qui a été corrigé en chemin (mesuré)

- **Plus aucun clic** : `tools/transients.js` vérifie toutes les consonnes sur 6 tirages (limite +11 dB au-dessus de la voyelle).
  Trois causes trouvées et corrigées : un gain qui sautait d'un coup dans la barre de voisement, une langue qui heurtait le palais à
  pleine vitesse, et l'énergie piégée derrière une occlusion voisée (désormais absorbée par les parois).
- Relâchements des occlusives aussi rapides que les fermetures (~10 ms), dévoisement anticipé avant une consonne sourde,
  explosions filtrées selon le lieu, /ʃ/ reculé et arrondi, murmure nasal plus sourd, consonnes allongées comme en diction chantée.

## Prochaine étape

Le moteur sait produire chaque son, mais **les trajectoires des articulateurs sont réglées à la main**. Il faut une cible réelle :
quelques phrases prononcées par une vraie voix, utilisées **uniquement comme mesure** (jamais dans le film), pour

1. calibrer le juge sur de la parole naturelle (la vraie limite haute) ;
2. faire de la **synthèse par copie** : ajuster les gestes du modèle jusqu'à ce que ses trajectoires de formants suivent celles de la voix réelle,
   comme on a ajusté les voyelles sur des formants publiés.
