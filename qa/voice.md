# Voix : premier test d'écoute, mesuré

Rendu par `node tools/demo.js`, 2026-11-25.

Vitesse de rendu : **2.5× le temps réel** sur un cœur (116 s d'audio).

## Justesse (YIN, médiane sur le cœur de chaque note)

| voix | morceau | écart moyen | écart max | notes non détectées | échantillons invalides |
|---|---|---|---|---|---|
| grandpa | berceuse | 4.9 cents | 14.8 cents | 1 | 0 |
| grandma | berceuse | 38.0 cents | 295.0 cents | 1 | 0 |
| child | berceuse | 21.9 cents | 197.6 cents | 1 | 0 |
| grandpa | hum | 4.7 cents | 6.4 cents | 0 | 0 |
| grandma | hum | 7.2 cents | 8.6 cents | 0 | 0 |
| child | hum | 2.6 cents | 3.8 cents | 0 | 0 |
| grandpa | vowels | 12.7 cents | 66.2 cents | 1 | 0 |
| grandma | vowels | 4.5 cents | 8.6 cents | 1 | 0 |
| child | vowels | 3.6 cents | 6.1 cents | 1 | 0 |

## Souffle : rapport harmoniques / bruit sur une voyelle tenue (« a » après le fredonnement)

| voix | HNR |
|---|---|
| grandpa | 12.2 dB |
| grandma | 15.1 dB |
| child | 19.6 dB |

## Formants chantés du grand-père (LPC sur le milieu de chaque voyelle, la chaîne de voyelles)

| voyelle | F1 | F2 | F3 |
|---|---|---|---|
| a | 678 | 1223 | 2586 |
| e | 414 | 2673 | 4164 |
| i | 336 | 3051 | 4837 |
| o | 184 | 2554 | 3397 |
| u | 207 | 1932 | 2825 |
| y | 258 | 1883 | 3402 |
| 2 | 463 | 1384 | 2407 |
| 9 | 579 | 2393 | 4537 |
| E | 543 | 1650 | 2473 |
| O | 487 | 1067 | 2417 |
| @ | 444 | 1329 | 2476 |
| a~ | 623 | 1063 | 2727 |
| o~ | 497 | 2518 | 3877 |
| e~ | 573 | 2497 | 4926 |
