import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    /*
     * Les pièces sont des sprites de un à deux kilo-octets, déjà à la bonne
     * taille. Les faire passer par l'optimiseur n'allège rien, ajoute une
     * requête serveur par image, se facture sur les hébergements qui comptent
     * les transformations, et casse l'affichage partout où l'optimiseur n'est
     * pas disponible. On sert les fichiers tels quels.
     */
    unoptimized: true,
  },
};

export default nextConfig;
