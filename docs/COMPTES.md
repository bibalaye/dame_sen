# Comptes joueurs — mise en service

Le jeu fonctionne entièrement sans compte. Cette page explique comment activer
les comptes, ce qui permet à un joueur de retrouver ses étoiles, son historique
et ses pions sur un autre appareil.

Tant que les deux variables d'environnement sont vides, rien ne change : la
progression reste dans le navigateur, et la fenêtre « compte » indique que la
fonction n'est pas activée.

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
On peut donc le rejouer après une modification.

Il installe :

| Objet | Rôle |
| --- | --- |
| `profiles` | pseudo, étoiles, pions débloqués, séries |
| `games` | historique des parties |
| `leaderboard` | vue du classement, sans solde ni identifiant |
| 7 fonctions | les seules écritures autorisées |

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

### Le serveur décide des étoiles

Le navigateur détient un jeton qui lui permet d'appeler l'API directement. Si
les tables étaient modifiables par le client, se donner un million d'étoiles
tiendrait en une ligne dans la console.

Les tables sont donc **en lecture seule** pour le joueur : aucune politique
d'écriture n'existe, et l'absence de politique vaut refus. Chaque gain passe
par une fonction `security definer` qui applique le barème côté serveur :

| Fonction | Ce qu'elle garantit |
| --- | --- |
| `claim_daily_visit` | la date vient du serveur, pas du téléphone |
| `record_game` | une partie déjà envoyée ne rapporte pas deux fois |
| `record_daily` | un défi ne compte qu'une fois, quels que soient les essais |
| `unlock_piece_set` | le solde est vérifié avant d'être débité |
| `set_piece_set` | on ne met en jeu que ce qu'on possède |
| `import_local_progress` | une seule reprise, plafonnée à 1000 étoiles |

Le barème est écrit deux fois : dans `supabase/schema.sql` et dans
`src/lib/economy.ts`. Le client l'affiche, le serveur en décide. **Toute
modification doit toucher les deux fichiers.**

### Ce qui se passe à la connexion

Se connecter ne doit jamais faire disparaître une partie. Le profil du serveur
et celui de l'appareil sont donc fusionnés (`src/lib/profile.ts`) :

- **historique** — réunion des deux, sans doublon, la plus récente en tête ;
- **pions débloqués** — réunion : un acquis ne se perd pas ;
- **solde** — celui du serveur fait foi, jamais celui du navigateur ;
- **séries** — la progression la plus avancée l'emporte ;
- **pions choisis** — le compte décide, sauf s'il n'a jamais choisi.

Ces règles sont testées dans `src/lib/__tests__/profile.test.ts`.

### La reprise à l'inscription

Un joueur qui a déjà joué sans compte ne doit pas repartir de zéro. À
l'inscription — et seulement là — sa progression locale rejoint le compte.

Le contenu du navigateur se modifie à la main : le solde repris est donc
plafonné à 1000 étoiles et l'opération refusée au second appel. Rien d'argent
réel n'étant en jeu, ce garde-fou simple vaut mieux qu'un dispositif compliqué.

---

## Vérifier que tout marche

1. Ouvrir le jeu, cliquer sur le bouton rond en haut à droite de l'accueil.
2. Créer un compte. Si la progression de l'appareil est proposée, la reprendre.
3. Dans Supabase, **Table Editor → profiles** : la ligne doit être là.
4. Jouer une partie, la terminer, recharger la page : les étoiles tiennent.
5. Ouvrir le jeu dans une fenêtre privée, se connecter : la progression suit.

### Si quelque chose bloque

| Symptôme | Cause probable |
| --- | --- |
| « Ce compte n'est pas encore activé » | la confirmation d'email est restée active (étape 3) |
| « Les comptes ne sont pas disponibles » | les variables d'environnement ne sont pas lues — redéployer |
| Le compte se crée mais le profil est absent | le schéma n'a pas été exécuté, ou seulement en partie |
| « Serveur injoignable » | projet Supabase en pause (il s'endort après une semaine d'inactivité sur le palier gratuit) |

Les erreurs détaillées partent dans la console du navigateur, préfixées
`[compte]`.
