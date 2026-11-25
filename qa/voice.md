# Voix : premier test d'écoute, mesuré

Rendu par `node tools/demo.js`, 2026-11-25.

Vitesse de rendu : **3.2× le temps réel** sur un cœur (116 s d'audio).

## Justesse (YIN, médiane sur le cœur de chaque note)

| voix | morceau | écart moyen | écart max | notes non détectées | échantillons invalides |
|---|---|---|---|---|---|
| grandpa | berceuse | 5.4 cents | 20.1 cents | 0 | 0 |
| grandma | berceuse | 5.6 cents | 11.7 cents | 0 | 0 |
| child | berceuse | 4.6 cents | 10.5 cents | 0 | 0 |
| grandpa | hum | 9.9 cents | 19.2 cents | 0 | 0 |
| grandma | hum | 1.5 cents | 2.6 cents | 0 | 0 |
| child | hum | 3.8 cents | 5.5 cents | 0 | 0 |
| grandpa | vowels | 9.2 cents | 27.3 cents | 0 | 0 |
| grandma | vowels | 5.4 cents | 11.5 cents | 0 | 0 |
| child | vowels | 5.6 cents | 12.2 cents | 0 | 0 |

## Souffle : rapport harmoniques / bruit sur une voyelle tenue (« a » après le fredonnement)

| voix | HNR |
|---|---|
| grandpa | 15.6 dB |
| grandma | 14.7 dB |
| child | 19.2 dB |

## Formants chantés du grand-père (LPC sur le milieu de chaque voyelle, la chaîne de voyelles)

| voyelle | F1 | F2 | F3 |
|---|---|---|---|
| a | 623 | 1323 | 2523 |
| e | 345 | 1997 | 2647 |
| i | 328 | 2170 | 3261 |
| o | 364 | 766 | 2499 |
| u | 292 | 736 | 2446 |
| y | 296 | 1703 | 2204 |
| 2 | 419 | 1455 | 2230 |
| 9 | 528 | 1385 | 2364 |
| E | 533 | 1744 | 2491 |
| O | 470 | 1027 | 2466 |
| @ | 419 | 1453 | 2442 |
| a~ | 538 | 957 | 2548 |
| o~ | 442 | 775 | 2526 |
| e~ | 559 | 1560 | 2506 |
