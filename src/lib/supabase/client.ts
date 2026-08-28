/**
 * Accès au serveur de comptes.
 *
 * Le jeu doit rester entièrement jouable sans compte et sans serveur : c'est
 * un jeu de plateau, pas un service en ligne. Tant que les clés ne sont pas
 * renseignées, ce module ne rend rien et l'application retombe sur le stockage
 * du navigateur, exactement comme avant l'existence des comptes.
 *
 * Les deux variables attendues, dans `.env.local` puis dans les réglages de
 * l'hébergeur :
 *
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *
 * Elles sont publiques par nature — elles partent dans le navigateur. Ce qui
 * protège les données, ce sont les règles d'accès du serveur, pas le secret de
 * ces clés.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Vrai si le projet dispose d'un serveur de comptes. */
export const isSupabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

/**
 * Le client, créé une seule fois. Renvoie `null` quand aucun serveur n'est
 * configuré : chaque appelant doit prévoir ce cas, plutôt que de découvrir une
 * exception au premier clic.
 */
export const getSupabase = (): SupabaseClient | null => {
  if (!isSupabaseConfigured) return null;
  if (client) return client;

  client = createClient(url!, anonKey!, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Aucun retour par lien : l'inscription se fait par pseudo, il n'y a
      // jamais de redirection à interpréter.
      detectSessionInUrl: false,
    },
  });

  return client;
};
