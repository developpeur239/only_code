# Synthèse par copie des consonnes

Marge discriminante (MFCC alignés par DTW, fenêtre de la consonne et de sa transition) : distance du mot synthétique au même mot humain, moins sa distance (softmin) aux autres mots humains. Négative = le modèle ressemble plus au bon mot qu'aux autres.

| consonne | marge avant | marge après | entre deux prises humaines | gestes ajustés |
|---|---|---|---|---|

