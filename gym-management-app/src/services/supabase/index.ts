/**
 * Supabase service barrel. Phase 2 scope only: environment access, the
 * prepared client and the connectivity probe. Authentication still runs
 * on the demo provider — this module is not imported by any screen yet.
 */
export {
  readSupabaseEnv,
  isSupabaseConfigured,
  getSupabaseClient,
  checkSupabaseConnectivity,
} from '@/services/supabase/client';
export type {
  SupabaseEnv,
  SupabaseConfigStatus,
  ConnectivityResult,
  AppSupabaseClient,
} from '@/services/supabase/client';
