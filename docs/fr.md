# Foudre Blitzortung

**Connecteur non officiel, sans lien avec Blitzortung.org.** Il amène dans
Gladys les impacts de foudre détectés par le réseau communautaire
[Blitzortung.org](https://www.blitzortung.org/) : les impacts près de votre
maison, la distance et la direction du plus proche, des déclencheurs de scène
et un widget orage.

> **Ce n'est pas un système de sécurité.** La détection dépend de détecteurs
> bénévoles et d'un flux internet qui peut s'arrêter à tout moment ; des
> impacts peuvent manquer ou être placés à quelques kilomètres près. Ne
> comptez jamais sur cette intégration pour protéger des personnes ou du
> matériel : quand le tonnerre gronde, rentrez à l'abri.

## Les données : usage privé, non commercial

Les impacts sont calculés par Blitzortung.org à partir de détecteurs que des
bénévoles construisent, hébergent et financent. Leurs données sont fournies
**pour un usage privé et non commercial uniquement**. Cette intégration :

- garde **une seule connexion** au flux en direct (celui de la carte), et ne
  l'ouvre que tant qu'au moins un appareil foudre existe dans Gladys ;
- ne stocke, ne revend ni ne transmet jamais les données : elle compte
  seulement, en mémoire, les impacts proches de vos maisons ;
- cite **Blitzortung.org** sur le widget.

Ne l'utilisez pas dans un produit commercial. Si elle vous plaît, pensez à
[héberger un détecteur](https://www.blitzortung.org/) pour améliorer la
couverture près de chez vous.

## Ce que vous obtenez

| Surface                              | Contenu                                                                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Un appareil par **maison localisée** | impacts dans le rayon pendant les dernières minutes, distance (km) et cap (degrés) du plus proche, sa direction (N, NE...), heure du dernier     |
| Déclencheurs de scène                | **foudre à moins d'une distance** (5 à 200 km, une fois par orage), **fin d'orage** (calme pendant la durée choisie), **orage qui se rapproche** |
| Action de scène                      | **état de la foudre** : nombre, distance du plus proche, direction, minutes depuis le dernier impact, orage en cours                             |
| Widget de tableau de bord            | **Foudre** : calme, ou orage à X km dans une direction, avec le nombre, le plus proche et le dernier impact                                      |

## Installation

> **Bande passante : environ 1 Go par jour.** Blitzortung.org envoie les
> impacts du monde entier à chaque client : le flux ne peut pas être limité à
> votre région. Tant qu'un appareil foudre existe, l'intégration les
> télécharge tous (environ 9 Ko par seconde, davantage pendant l'été de
> l'hémisphère nord) et ne garde que ceux proches de votre maison. Sur une
> connexion limitée (box 4G, forfait plafonné) ou un petit boîtier, vérifiez
> que cela vous convient avant d'ajouter l'appareil ; supprimer l'appareil
> ferme le flux.

1. Renseignez l'emplacement de votre maison dans Gladys (**Paramètres →
   Maisons**) et acceptez l'accès à la localisation à l'installation de
   l'intégration.
2. Ouvrez **Découverte** et ajoutez l'appareil « Lightning near … » de votre
   maison. Le flux s'ouvre dès qu'un appareil existe.
3. Facultatif : changez le **rayon** (30 km par défaut, jusqu'à 200 km), la
   **fenêtre de comptage** (15 minutes) et la **période de calme** avant
   « fin d'orage » (30 minutes).
4. Placez le widget **Foudre** sur un tableau de bord et choisissez la
   maison.

Le bouton **Tester le flux** affiche le serveur utilisé, le nombre d'impacts
par minute dans le monde et la situation autour de chaque maison.

## Les états

- **Impacts proches** : les impacts dans le rayon pendant la fenêtre.
- **Impact le plus proche** (km) : le plus proche de la fenêtre. Sans impact
  dans la fenêtre, c'est le rayon lui-même : une condition « moins de 10 km »
  ne garde jamais une valeur périmée.
- **Cap** (degrés depuis le nord) et **direction** (N, NE, E, SE, S, SO, O,
  NO ; en anglais W pour ouest) : où était l'impact le plus proche ; « — »
  par temps calme.
- **Dernier impact proche** : son heure en UTC (ISO 8601).

Les états sont publiés au plus toutes les 15 secondes.

## Scènes

- **Foudre à moins d'une distance** : choisissez la maison et la distance.
  La scène s'exécute au premier impact plus proche que cette distance, une
  fois par orage : elle ne peut se relancer qu'après la période de calme sans
  aucun impact à cette distance. L'intégration ne voit que les impacts dans
  le rayon de la configuration : une distance plus grande que le rayon vaut
  le rayon. Variables : la distance de l'impact le plus proche, son cap et sa
  direction, le nombre, l'heure de l'impact.
- **Fin d'orage** : aucun impact dans la distance choisie pendant la période
  de calme, après un « foudre à moins de » de la même distance (rebrancher,
  rouvrir, prévenir).
- **Orage qui se rapproche** : la fenêtre est coupée en trois tiers ; quand
  l'impact le plus proche de chaque tiers est plus proche que dans le
  précédent, l'orage vient vers la maison. Une fois par orage, avec une
  vitesse d'approche approximative.

L'action **état de la foudre** donne `{{count}}`, `{{nearest_km}}`,
`{{direction}}`, `{{minutes_since_last}}` et `{{storm}}` pour un message ou
une condition.

## Fonctionnement

L'intégration lit le flux mondial en direct de Blitzortung.org, celui de la
[carte en direct](https://map.blitzortung.org/) : plusieurs impacts par
seconde, chacun décodé puis écarté s'il ne tombe pas dans le rayon d'une de
vos maisons. Le flux est mondial et ne peut pas être restreint à une région :
il pèse environ **1 Go par jour** (davantage pendant l'été de l'hémisphère
nord), ce qui compte sur une connexion limitée.

Une seule connexion à la fois, vers `ws1`, `ws7` ou `ws8.blitzortung.org`.
Les serveurs ferment chaque connexion au bout d'environ 6 minutes :
l'intégration passe alors au serveur suivant après 1 seconde. Quand un
serveur échoue, le suivant est essayé après 5 secondes, puis 10, 20...
jusqu'à 5 minutes. Sans aucun message pendant 2 minutes, la connexion est
considérée comme morte et remplacée.

## Dépannage

- **« Aucune maison localisée »** : renseignez l'emplacement de la maison
  dans Gladys, puis rouvrez Découverte.
- **« Le flux Blitzortung est injoignable »** : les serveurs sont tenus par
  des bénévoles ; l'intégration réessaie toute seule. La liste des serveurs
  est dans la section avancée de la configuration, au cas où Blitzortung.org
  la change.
- **Aucun impact alors que la carte montre un orage** : vérifiez le rayon, et
  que l'orage y est bien depuis votre maison ; la couverture du réseau varie
  selon les régions.
- Journaux : le niveau de log se règle avec la variable `LOG_LEVEL`.

## Vie privée

L'emplacement de vos maisons sert, à l'intérieur de l'intégration, à mesurer
la distance des impacts et n'en sort jamais : le flux est le même pour tout
le monde, rien n'est envoyé à Blitzortung.org à part le message
d'abonnement.
