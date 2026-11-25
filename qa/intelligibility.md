# Intelligibilité : le juge automatique

Le juge est une reconnaissance vocale française hors ligne (Vosk, modèle `vosk-model-small-fr-0.22`),
utilisée **uniquement pendant le développement** (`tools/judge.py`). Le film n'en contient rien.

## Le juge lui-même est-il fiable ?

Contrôle sur une voix de synthèse de référence (eSpeak NG, robotique mais intelligible, outil de test seulement) :

| attendu | entendu |
|---|---|
| la nuit descend | la maison |
| dors mon cœur | dans mon cœur |
| bonjour | bonjour |
| papa | papa |

6 mots sur 8 : le juge comprend une voix intelligible, même artificielle.

## Nos voix, état au 25/11 (point de départ)

8 mots ou phrases × 3 voix, débit parlé (`tools/speak.js`) : **2 mots reconnus sur 51 (4 %)**.

Ce que le juge entend déjà : le rythme et une partie des voyelles
(« l'annuité » pour *la nuit*, « coucou t'adore » pour *tout est blanc*, « neuf alors » pour *le feu s'endort*).
Ce qui manque : les consonnes (lieux d'articulation, transitions de formants) et l'enchaînement.

Seuil de la semaine 2 : **≥ 90 % des mots reconnus**.
