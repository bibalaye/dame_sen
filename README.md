# Dames sénégalaises

Le jeu de dames à la sénégalaise : plateau 5×5, déplacements en ligne droite,
prises obligatoires et rafles.

## Lancer le jeu

```bash
npm install
npm run dev        # http://localhost:3000
```

`npm run dev` suffit pour le **solo**, le mode **autour du plateau** et le
**défi du jour**.

### Le mode en ligne a besoin du serveur temps réel

Les parties à distance passent par socket.io, servi par `server.js` :

```bash
npm run server     # http://localhost:5000 — le jeu et les websockets
```

Ouvrez alors `http://localhost:5000`. C'est la façon la plus simple de jouer à
deux : une seule commande sert la page et les échanges temps réel.

Si vous préférez garder le rechargement à chaud de `npm run dev`, lancez les
deux commandes en parallèle : le client détecte qu'il n'est pas servi par le
port temps réel et se connecte automatiquement au port 5000.

Pour un serveur hébergé ailleurs, renseignez son adresse :

```bash
# .env.local
NEXT_PUBLIC_SOCKET_URL=https://exemple.com
```

## Tests

```bash
npm test           # règles, IA, pendule, défi du jour, intégration
npm run lint
npm run build
```

Les tests tournent avec le lanceur intégré de Node : aucune dépendance
supplémentaire à installer.

## Les règles, telles qu'implémentées

- Plateau 5×5. Tout se joue en ligne droite, jamais en diagonale.
- Un pion avance d'une case vers le camp adverse, ou se décale à gauche ou à
  droite. Il ne recule jamais.
- Un pion prend devant lui et sur les côtés, **jamais dans son dos** : une pièce
  dépassée ne risque plus rien.
- La dame glisse dans les quatre directions, prend en arrière, et **choisit sa
  case d'arrivée** parmi les cases libres au-delà de la pièce capturée.
- Prendre est obligatoire. Les prises s'enchaînent, et devenir dame en pleine
  rafle ne l'interrompt pas.
- Un camp réduit à une seule pièce la reçoit **en dame d'office**.
- Nulle après 25 coups sans prise ni promotion, ou sur triple répétition.

## Organisation

| Chemin | Rôle |
| --- | --- |
| `src/lib/engine.ts` | Règles du jeu, pures et testables |
| `src/lib/ai.ts` | Adversaire : negamax alpha-bêta, quatre niveaux |
| `src/lib/clock.ts` | Pendule (blitz, éclair) |
| `src/lib/daily.ts` | Défi du jour et série |
| `src/lib/pieceLayer.ts` | Identité des pièces, pour les animer |
| `src/lib/sound.ts` | Sons synthétisés, sans fichier audio |
| `server.js` | Serveur socket.io des parties à distance |
