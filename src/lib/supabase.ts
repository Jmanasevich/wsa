import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Cliente exclusivamente de servidor. RLS deny-all: la service key bypassa.
let admin: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (!admin) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    admin = createClient(url, key, { auth: { persistSession: false } });
  }
  return admin;
}
