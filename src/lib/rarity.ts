/**
 * Rareté des articles.
 *
 * Un prix seul ne dit rien : entre 700 et 900 cauris, le joueur ne sait pas
 * lequel des deux est « le beau ». La rareté range le catalogue en quatre
 * paliers lisibles d'un coup d'œil, du premier achat au but qu'on se fixe.
 *
 * Elle n'a aucun effet en partie. Rien de ce qui s'achète ne change une règle
 * ni ne donne un avantage : un légendaire se voit, il ne fait pas gagner.
 */

export type Rarity = 'commun' | 'rare' | 'epique' | 'legendaire';

export const RARITIES: readonly Rarity[] = ['commun', 'rare', 'epique', 'legendaire'];

export const RARITY_LABELS: Readonly<Record<Rarity, string>> = {
  commun: 'Commun',
  rare: 'Rare',
  epique: 'Épique',
  legendaire: 'Légendaire',
};

/**
 * Couleur d'accompagnement de chaque palier. Les teintes sont celles du thème :
 * un article rare porte le laiton du jeu, pas un violet emprunté ailleurs.
 */
export const RARITY_TOKENS: Readonly<Record<Rarity, string>> = {
  commun: 'var(--line)',
  rare: 'var(--green)',
  epique: 'var(--indigo)',
  legendaire: 'var(--brass)',
};

/** Ordre d'affichage : du plus accessible au plus convoité. */
export const rarityRank = (rarity: Rarity): number => RARITIES.indexOf(rarity);

export const compareByRarity = <T extends { rarity: Rarity; price: number }>(
  a: T,
  b: T,
): number => rarityRank(a.rarity) - rarityRank(b.rarity) || a.price - b.price;
