// =====================================================================
// supabase/functions/staff-admin/index.ts
// Production Readiness — Stage 2B, WS-5: trusted staff administration.
//
// This function is the ONLY place a privileged auth operation happens:
//   * creating a Receptionist auth user (email + temporary password)
//   * activating an account (clearing the GoTrue ban)
//   * blocking an account's sessions (applying a long GoTrue ban)
//
// The service-role key is read from the server-side Edge environment.
// It is never sent to, read by, or bundled into the Expo application.
// The app invokes this function with its normal user JWT.
//
// Defence in depth (all of these must pass):
//   1. The platform verifies the JWT (`verify_jwt = true`).
//   2. We resolve the caller with `auth.getUser(token)`.
//   3. We read the caller's OWN profile through RLS and require an
//      ACTIVE owner.
//   4. The database functions (`admin_register_staff`,
//      `admin_set_staff_active`, `admin_record_staff_sessions_blocked`)
//      independently require owner + AAL2 from the caller's JWT.
//   5. Request bodies carrying a `role` field are rejected outright;
//      the database hard-codes `receptionist`, so owner creation or
//      promotion has no path.
//
// Failure behaviour is fail-closed: a partial create deletes the auth
// user; a failed activation leaves `profiles.is_active = false`; a failed
// session block still leaves the database denying the account.
//
// Deploy (owner action, not performed in WS-5):
//   supabase functions deploy staff-admin
//   supabase secrets set ... only if the platform does not inject
//   SUPABASE_SERVICE_ROLE_KEY automatically.
// =====================================================================

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_NAME = 120;
const MAX_PHONE = 32;

type JsonBody = Record<string, unknown>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Same baseline as the app: at least 8 characters, a letter and a digit. */
function isPassword(value: string): boolean {
  return value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value);
}

function hasRoleField(body: JsonBody): boolean {
  return Object.prototype.hasOwnProperty.call(body, 'role');
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey =
    Deno.env.get('SUPABASE_ANON_KEY') ??
    Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ??
    '';
  const serviceRoleKey =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
    Deno.env.get('SUPABASE_SECRET_KEY') ??
    '';

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    // Infrastructure unavailable: refuse the operation. Never fall back to
    // a client-held key or an unauthenticated path.
    return json({ error: 'Staff administration is not configured on the server.' }, 503);
  }

  const authorization = request.headers.get('Authorization') ?? '';
  const token = authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : '';
  if (!token) return json({ error: 'Authentication required.' }, 401);

  // Caller-scoped client: RLS applies, so the profile read below can only
  // see what the caller is actually allowed to see.
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: userData, error: userError } = await caller.auth.getUser(token);
  const user = userData.user;
  if (userError || !user) return json({ error: 'Authentication required.' }, 401);

  // Authorisation is the database profile, not the JWT claim.
  const { data: profile, error: profileError } = await caller
    .from('profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    return json({ error: 'Authorisation could not be checked.' }, 503);
  }
  if (!profile || profile.role !== 'owner' || profile.is_active !== true) {
    return json({ error: 'Owner access is required for staff administration.' }, 403);
  }

  let body: JsonBody;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return json({ error: 'A JSON object body is required.' }, 400);
    }
    body = parsed as JsonBody;
  } catch {
    return json({ error: 'A JSON object body is required.' }, 400);
  }

  // There is no role parameter anywhere in this system. Reject even an
  // attempt to smuggle one in.
  if (hasRoleField(body)) {
    return json({ error: 'Role selection is not accepted by staff administration.' }, 400);
  }

  const action = text(body.action);

  // Service-role client: admin auth operations only. It is never returned
  // to the caller and is not used for table reads.
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  /** Caller-scoped target read: the target must be a receptionist. */
  async function readReceptionistTarget(userId: string): Promise<
    { ok: true } | { ok: false; response: Response }
  > {
    if (!userId) return { ok: false, response: json({ error: 'A staff user id is required.' }, 400) };
    const { data, error } = await caller
      .from('profiles')
      .select('role, is_active')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      return { ok: false, response: json({ error: 'The staff account could not be checked.' }, 503) };
    }
    if (!data || data.role !== 'receptionist') {
      return { ok: false, response: json({ error: 'Only receptionist accounts can be managed.' }, 403) };
    }
    return { ok: true };
  }

  try {
    if (action === 'create') {
      const displayName = text(body.displayName);
      const email = text(body.email).toLowerCase();
      const password = typeof body.password === 'string' ? body.password : '';
      const phone = text(body.phone) || null;

      if (displayName.length < 2 || displayName.length > MAX_NAME) {
        return json({ error: 'Enter a staff name between 2 and 120 characters.' }, 400);
      }
      if (!isEmail(email)) return json({ error: 'Enter a valid staff email address.' }, 400);
      if (!isPassword(password)) {
        return json({ error: 'The temporary password must be at least 8 characters and include a letter and a digit.' }, 400);
      }
      if (phone && phone.length > MAX_PHONE) {
        return json({ error: 'The phone number is too long.' }, 400);
      }

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: displayName, phone: phone ?? undefined },
      });

      if (createError || !created.user) {
        const message = createError?.message ?? '';
        if (/already|exists|registered/i.test(message)) {
          return json({ error: 'An account with this email already exists.' }, 409);
        }
        return json({ error: 'The staff auth account could not be created.' }, 502);
      }

      const userId = created.user.id;
      const { error: profileInsertError } = await caller.rpc('admin_register_staff', {
        p_user_id: userId,
        p_display_name: displayName,
        p_phone: phone,
      });

      if (profileInsertError) {
        // Compensating delete: never leave an auth account that has no
        // profile (it could not sign in, but it would still be a stray
        // identity). If the delete itself fails, the account remains
        // profile-less and therefore denied.
        const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
        if (deleteError) {
          return json({
            error: 'The staff profile could not be created and the auth account could not be rolled back. Review the staff directory before retrying.',
          }, 500);
        }
        return json({
          error: 'The staff profile could not be created; the auth account was rolled back.',
        }, 500);
      }

      return json({ userId, email });
    }

    if (action === 'deactivate') {
      const userId = text(body.userId);
      const target = await readReceptionistTarget(userId);
      if (!target.ok) return target.response;

      // The database switch is the authoritative revocation: it is applied
      // first, so even if the GoTrue ban below fails the account is
      // immediately denied by RLS and every authority function.
      const { error: deactivateError } = await caller.rpc('admin_set_staff_active', {
        p_user_id: userId,
        p_active: false,
      });
      if (deactivateError) {
        return json({
          error: 'The account could not be deactivated in the database. No auth-side change was made.',
        }, 500);
      }

      // GoTrue has no logout-by-user endpoint. A long ban blocks new
      // sign-ins and refresh; the database switch already denies
      // already-issued tokens.
      const { error: banError } = await admin.auth.admin.updateUserById(userId, {
        ban_duration: '876000h',
      });
      if (banError) {
        return json({
          userId,
          deactivated: true,
          sessionsBlocked: false,
          warning: 'The account is deactivated and denied by the database, but the auth-side session block could not be applied.',
        });
      }

      const { error: auditError } = await caller.rpc('admin_record_staff_sessions_blocked', {
        p_user_id: userId,
      });
      if (auditError) {
        return json({
          userId,
          deactivated: true,
          sessionsBlocked: true,
          warning: 'The account is deactivated and sessions are blocked, but the audit acknowledgement could not be written.',
        });
      }

      return json({ userId, deactivated: true, sessionsBlocked: true });
    }

    if (action === 'activate') {
      const userId = text(body.userId);
      const target = await readReceptionistTarget(userId);
      if (!target.ok) return target.response;

      const { error: unbanError } = await admin.auth.admin.updateUserById(userId, {
        ban_duration: 'none',
      });
      if (unbanError) {
        return json({
          error: 'The auth-side block could not be cleared. The account stays inactive.',
        }, 502);
      }

      const { error: activateError } = await caller.rpc('admin_set_staff_active', {
        p_user_id: userId,
        p_active: true,
      });
      if (activateError) {
        // Fail closed: do not roll the ban back. An unbanned but inactive
        // profile still has no access.
        return json({
          error: 'The account could not be activated in the database. It remains inactive.',
        }, 500);
      }

      return json({ userId, active: true });
    }

    return json({ error: 'Unknown staff administration action.' }, 400);
  } catch (error) {
    // Never echo a service-role key, token or raw auth-server payload.
    console.error('[staff-admin] unexpected failure', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'Staff administration failed. No change was reported as successful.' }, 500);
  }
});
