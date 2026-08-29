# Comptes joueurs — mise en service

**Le compte est requis pour jouer.** La progression, le classement et les amis
n'existent qu'attachés à quelqu'un : on demande donc un pseudo avant la
première partie plutôt qu'après.

Une exception, et une seule : tant que les deux variables d'environnement sont
vides, aucun compte ne peut exister. Bloquer là rendrait le jeu injouable pour
qui l'installe sans clés, alors la porte s'efface et la progression reste dans
le navigateur.

> À savoir : chaque écran avant la première partie fait partir des joueurs. Un
> compte obligatoire est un choix assumé, pas un réglage neutre.

---

## 1. Créer le projet Supabase

1. Ouvrir [supabase.com](https://supabase.com) et créer un projet.
2. Choisir une région proche des joueurs — `eu-west` pour le Sénégal.
3. Noter le mot de passe de la base : il ne sera plus affiché.

Le palier gratuit couvre 50 000 utilisateurs actifs et 500 Mo de données. À
raison d'environ 200 octets par partie enregistrée, cela laisse largement de
quoi voir venir.

## 2. Installer le schéma

Dans le projet Supabase : **SQL Editor → New query**, coller l'intégralité de
[`supabase/schema.sql`](../supabase/schema.sql), puis exécuter.

Le script est réexécutable : il ne détruit rien et ignore ce qui existe déjà.
On peut donc le rejouer après une modification — et il **faut** le rejouer
après chaque mise à jour de ce fichier, sans quoi le serveur garde l'ancienne
version des fonctions.

> **Coller le fichier en entier.** L'éditeur SQL exécute tout d'un bloc : une
> seule erreur au milieu et rien ne s'applique ensuite. Le jeu ne le dira pas
> autrement que par une panne, plus tard, à l'endroit le moins pratique.

Pour vérifier ce que l'instance contient réellement :

```
npm run check:schema
```

Le script interroge la base colonne par colonne et fonction par fonction, et
liste ce qui manque. Il n'écrit rien et n'a besoin que de la clé publique.

Il installe :

| Objet | Rôle |
| --- | --- |
| `profiles` | pseudo, cauris, inventaire, tenue, séries |
| `games` | historique des parties |
| `catalog` | prix de chaque article, miroir de `src/lib/shop.ts` |
| `friendships` | une ligne par paire, en attente ou acceptée |
| `game_invites` | invitations à rejoindre une salle, valables dix minutes |
| `leaderboard` | vue du classement, sans solde ni identifiant |
| 15 fonctions | les seules écritures autorisées |

Si la base était installée avant la boutique, le script la reprend : `stars`
devient `coins`, `unlocked` devient `owned`, et les identifiants d'articles
reçoivent leur famille (`sabar` → `pieces:sabar`). Rien n'est perdu, et un test
le vérifie.

## 3. Régler l'authentification

**Authentication → Sign In / Providers → Email**

- **Confirm email : désactivé.** C'est indispensable. Les joueurs s'inscrivent
  avec un pseudo, jamais avec une vraie adresse : aucun courriel de
  confirmation ne pourrait leur parvenir, et le compte resterait inutilisable.
- Laisser le fournisseur « Email » actif : c'est lui qui reçoit les adresses
  fabriquées à partir des pseudos.

## 4. Renseigner les clés

Copier `.env.example` vers `.env.local`, puis remplir depuis
**Project Settings → API** :

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
```

Sur Vercel, ajouter les deux mêmes variables dans **Settings → Environment
Variables**, puis redéployer.

> Ne jamais utiliser la clé `service_role` : elle contourne toutes les règles
> d'accès. Seule la clé `anon` va dans le navigateur.

---

## Comment c'est construit

### Un pseudo, pas une adresse

Demander une adresse électronique écarte une partie du public visé, et le jeu
n'a rien à envoyer. Le joueur choisit donc un pseudo et un mot de passe.

Supabase, lui, raisonne en adresses. Le client en fabrique une à partir du
pseudo — `amadou` devient `amadou@joueurs.dame-sen.app` — invisible du joueur.
Ce détour a un effet utile : l'unicité des adresses, garantie par Supabase,
devient l'unicité des pseudos, sans table ni verrou supplémentaire.

Les pseudos sont comparés sans casse ni accent : « Amadou », « AMADOU » et
« Amádou » désignent le même joueur. Sans cela, le pseudo deviendrait un
déguisement.

**Conséquence à connaître :** sans adresse, un mot de passe oublié ne peut pas
être réinitialisé. C'est le prix de l'absence de friction à l'inscription, et
la fenêtre d'inscription le dit au joueur.

### Le serveur décide des cauris

Le navigateur détient un jeton qui lui permet d'appeler l'API directement. Si
les tables étaient modifiables par le client, se donner un million de cauris
tiendrait en une ligne dans la console.

Les tables sont donc **en lecture seule** pour le joueur : aucune politique
d'écriture n'existe, et l'absence de politique vaut refus. Chaque gain passe
par une fonction `security definer` qui applique le barème côté serveur :

| Fonction | Ce qu'elle garantit |
| --- | --- |
| `claim_daily_visit` | la date vient du serveur, pas du téléphone |
| `record_game` | une partie déjà envoyée ne rapporte pas deux fois |
| `record_daily` | un défi ne compte qu'une fois, quels que soient les essais |
| `buy_item` | le solde est vérifié avant d'être débité |
| `set_loadout` | on ne porte que ce qu'on possède |
| `import_local_progress` | une seule reprise, plafonnée à 1000 cauris |

Le barème est écrit deux fois : dans `supabase/schema.sql` et dans
`src/lib/economy.ts`. Le client l'affiche, le serveur en décide. **Toute
modification doit toucher les deux fichiers.**

### Ce qui se passe à la connexion

Se connecter ne doit jamais faire disparaître une partie. Le profil du serveur
et celui de l'appareil sont donc fusionnés (`src/lib/profile.ts`) :

- **historique** — réunion des deux, sans doublon, la plus récente en tête ;
- **inventaire** — réunion : un article acquis ne se perd pas ;
- **solde** — celui du serveur fait foi, jamais celui du navigateur ;
- **séries** — la progression la plus avancée l'emporte ;
- **tenue** — le compte décide, sauf là où il n'a jamais rien choisi.

Ces règles sont testées dans `src/lib/__tests__/profile.test.ts`.

### La reprise à l'inscription

Un joueur qui a déjà joué sans compte ne doit pas repartir de zéro. À
l'inscription — et seulement là — sa progression locale rejoint le compte.

Le contenu du navigateur se modifie à la main : le solde repris est donc
plafonné à 1000 cauris et l'opération refusée au second appel. Rien d'argent
réel n'étant en jeu, ce garde-fou simple vaut mieux qu'un dispositif compliqué.

---

### Le schéma est testé, pas seulement écrit

Les règles d'économie vivent maintenant en SQL : c'est le serveur qui accorde
les cauris. Un barème qui ne s'exécute nulle part avant la production est un
pari — et le premier bug trouvé de cette façon (`malformed array literal`,
invisible à l'analyse syntaxique) n'était pas dans un chemin exotique, mais
dans la fin de partie ordinaire.

```
npm run test:sql
```

70 tests exécutent le schéma dans un vrai PostgreSQL fourni par PGlite, en
WebAssembly : rien à installer, aucun conteneur à lancer, aucune connexion au
projet Supabase. Ils exercent chaque chemin des fonctions — série de trois
victoires, prime du septième jour, partie renvoyée deux fois, solde
insuffisant, seconde reprise refusée, reprise d'une base d'avant la boutique —
et vérifient qu'aucune politique d'écriture n'existe et que le classement ne
laisse filtrer ni solde ni identifiant.

Deux d'entre eux comparent le catalogue et le barème du serveur à ceux de
`src/lib/shop.ts` et `src/lib/economy.ts` : un prix affiché mais non appliqué
trompe le joueur, et rien d'autre ne l'aurait signalé.

`npm test` lance les tests unitaires puis ceux-ci.

## Vérifier que tout marche

1. Ouvrir le jeu : le formulaire d'inscription s'affiche avant tout le reste.
2. Créer un compte. Si la progression de l'appareil est proposée, la reprendre.
3. Dans Supabase, **Table Editor → profiles** : la ligne doit être là.
4. Jouer une partie, la terminer, recharger la page : les cauris tiennent.
5. Ouvrir le jeu dans une fenêtre privée, créer un second compte.
6. Depuis le premier, chercher le second et l'ajouter ; l'accepter depuis le
   second. Le bouton « amis » porte une pastille tant que la demande attend.
7. Créer une salle en ligne, **Inviter un ami** : le bandeau doit descendre chez
   l'autre en quelques secondes.

### Si quelque chose bloque

| Symptôme | Cause probable |
| --- | --- |
| « Ce compte n'est pas encore activé » | la confirmation d'email est restée active (étape 3) |
| « Les comptes ne sont pas disponibles » | les variables d'environnement ne sont pas lues — redéployer |
| Le compte se crée mais le profil est absent | le schéma n'a pas été exécuté, ou seulement en partie |
| « Serveur injoignable » | projet Supabase en pause (il s'endort après une semaine d'inactivité sur le palier gratuit) |

Les erreurs détaillées partent dans la console du navigateur, préfixées
`[compte]`.

---

## La boutique

Une seule monnaie, le **cauri** — le coquillage qui a servi de monnaie en
Afrique de l'Ouest pendant des siècles. Elle se gagne en jouant, jamais avec de
l'argent réel : ni achat, ni publicité, ni retrait.

### Cinq rayons

| Rayon | Ce qu'on y trouve | Effet |
| --- | --- | --- |
| Pions | 16 jeux, de formes réellement différentes | décor |
| Plateaux | 8 damiers | décor |
| Cadres | 4 liserés autour de l'initiale | décor, visible au classement |
| Titres | 5 mentions sous le pseudo | décor, visible au classement |
| Fonctions | 2 commodités | **solo uniquement** |

Chaque article porte une rareté — commun, rare, épique, légendaire — qui donne
sa couleur au cadre de la carte. Un prix seul ne dit pas ce qui est beau ; entre
700 et 900 cauris, rien n'indiquait lequel valait le détour.

### La règle qui ne souffre pas d'exception

**Rien de ce qui s'achète ne change une règle du jeu ni ne donne un avantage sur
un adversaire humain.** Les deux fonctions vendues — six indices au lieu de
trois, et la reprise d'un coup — se désactivent d'elles-mêmes dès qu'un humain
est en face, en ligne comme sur le même appareil. Un joueur qui ne dépense
jamais rien ne joue pas un moins bon jeu.

### Ajouter un article

1. Déclarer le visuel dans `src/lib/pieceSets.ts` ou `src/lib/boards.ts` (les
   cadres, titres et fonctions vivent directement dans `src/lib/shop.ts`).
2. Ajouter la ligne correspondante dans la table `catalog` de
   `supabase/schema.sql`, avec le même prix.
3. Lancer `npm test` : un test compare les deux catalogues et refuse tout écart.
4. Rejouer `schema.sql` dans Supabase.

### Les pièces

`node scripts/extract-pieces.mjs` extrait les silhouettes du lot Kenney vers
`public/assets/pieces`. Le script refuse de finir si une dame est identique à
son pion — une promotion invisible casse la partie — ou si deux fichiers font
double emploi. Il n'utilise que les séries `border` et `multi` : pour les
véhicules, la série `single` n'a pas de version empilée.

---

## Amis et invitations

Partager un code de salle à six caractères marchait, mais obligeait à sortir du
jeu pour l'envoyer par un autre moyen. Une liste d'amis permet d'inviter d'un
geste, et de recevoir l'invitation sans rien recopier.

### Ce que ça donne

1. Chercher un pseudo, envoyer une demande.
2. L'autre l'accepte depuis le bouton « amis » de l'accueil, qui porte une
   pastille tant qu'une demande attend.
3. Créer une salle en ligne, puis **Inviter un ami** : la liste s'ouvre, un
   bouton par ami.
4. Chez l'ami, un bandeau descend du haut de l'écran : *« Amadou vous invite »*,
   avec **Rejoindre** et **Plus tard**.

### Choix de conception

**Une seule ligne par paire.** Chercher une amitié se fait donc dans les deux
sens, ce qui alourdit un peu les requêtes — mais deux lignes symétriques à tenir
d'accord se désynchronisent tôt ou tard.

**Deux demandes croisées valent acceptation.** Si chacun demande l'autre sans
avoir vu sa demande, les faire s'attendre mutuellement serait absurde.

**On n'invite que ses amis.** Sans cette règle, n'importe qui pourrait faire
sonner l'écran de n'importe qui.

**Une seule invitation en attente par paire.** Cliquer trois fois ne doit pas
faire sonner trois fois ; la plus récente remplace les précédentes.

**Les invitations expirent au bout de dix minutes**, et sont purgées à chaque
nouvelle invitation — pas besoin d'une tâche planifiée pour une table qui reste
minuscule.

### Le temps réel

Le client est prévenu par Supabase Realtime plutôt qu'en interrogeant le serveur
en boucle. Le script ajoute `game_invites` à la publication `supabase_realtime`
si elle existe.

Si le temps réel n'est pas actif sur le projet, **rien ne casse** : le client
relit la liste toutes les trente secondes. L'invitation arrive alors avec un peu
de retard au lieu de ne jamais arriver.

L'événement ne porte que la ligne insérée — pas le nom de qui invite, qui est
dans une autre table. On s'en sert donc comme d'une sonnette : elle dit qu'il
s'est passé quelque chose, et le client va lire la liste complète.

### Ce qui n'est pas exposé

La recherche et la liste ne rendent que ce que le classement montre déjà :
pseudo, nom affiché, titre et cadre. Jamais un solde, jamais un identifiant de
compte. Deux caractères au minimum pour chercher, sans quoi une seule lettre
listerait la moitié des joueurs.

---

## Faire évoluer le schéma

PostgreSQL refuse de « remplacer » ce dont la forme change :

- `create or replace view` ne sait qu'**ajouter** des colonnes à la fin, jamais
  en insérer au milieu ;
- `create or replace function` refuse de **renommer un paramètre**.

Les deux se sont produits en ajoutant la boutique — `title` inséré au milieu de
la vue du classement, `p_stars` devenu `p_coins`. Rejouer le fichier sur une
base antérieure échouait, et comme l'éditeur SQL exécute tout d'un bloc, plus
rien ne s'appliquait ensuite.

D'où la section **« Formes qui ont changé »** en tête des fonctions : tout ce
dont la signature bouge y est supprimé avant d'être recréé.

**Quand vous modifiez une signature ou l'ordre des colonnes d'une vue, ajoutez
le `drop` correspondant dans cette section.** Trois tests le vérifient :

- appliquer le fichier deux fois de suite ne change rien ;
- il s'applique sur une base d'avant les titres et la boutique ;
- les données d'une base antérieure survivent à la mise à jour.

Retirer l'un des deux `drop` fait tomber ces tests — c'est vérifié.
