/**
 * Ambient declarations for the Expo public environment variables.
 *
 * Only PUBLIC values are declared: the two Supabase client credentials
 * (URL + publishable/anon key). The service-role/secret key has no slot
 * here on purpose — it must never be read by the Expo application.
 * Values are inlined at build time by Metro from `.env` (see
 * `.env.example`); the publishable key is public by design, and database
 * access is protected by RLS on the server.
 */
declare namespace NodeJS {
  interface ProcessEnv {
    /** Supabase project URL, e.g. https://abcdefgh.supabase.co */
    EXPO_PUBLIC_SUPABASE_URL?: string;
    /** Publishable key (`sb_publishable_…`) or legacy anon key (JWT). */
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
    /** Legacy anon key alias — read only when the publishable key is absent. */
    EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
  }
}
