# Synthèse par copie des consonnes

Marge discriminante (MFCC alignés par DTW, fenêtre de la consonne et de sa transition) : distance du mot synthétique au même
mot humain, moins sa distance (softmin) aux autres mots humains. **Négative = le modèle ressemble plus au bon mot qu'aux autres.**

| consonne | marge avant | marge après |
|---|---|---|
| t (tas) | 2.74 | -0.88 |
| b (bas) | 0.60 | -1.82 |
| p (pas) | 2.44 | 0.30 |
| k (cas) | 2.92 | 1.57 |
| f (fa) | -0.37 | -2.78 |
| v (va) | 1.45 | -0.10 |
| g (gars) | 0.41 | -0.47 |
| s (ça) | 2.11 | 1.47 |
| S (chat) | 0.27 | -3.37 |
| m (ma) | -0.43 | -1.14 |
| l (la) | 2.45 | 0.60 |
| R (rat) | 0.21 | -0.34 |

8 consonnes sur 12 passent du côté « plus proche du bon mot ». Les juges n'en profitent presque pas (Whisper 28 %, Vosk 33-46 %),
voir [`intelligibility.md`](intelligibility.md). Les gestes obtenus sont conservés dans [`consfit_discriminant.json`](consfit_discriminant.json)
mais ne sont pas activés (`src/audio/consfit.js` est vide).
