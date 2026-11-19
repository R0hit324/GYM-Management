/**
 * Local Supabase stack resolution for the verification scripts.
 *
 * No credential is stored in this repository. The API URL and keys are read
 * from `supabase status -o env` (the running local stack) unless they are
 * supplied explicitly through the environment:
 *
 *   SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, MAILPIT_URL
 *
 * The secret key is only used by these local scripts — never by the app, and
 * never against a remote project.
 */
import { spawnSync } from 'node:child_process';

let cached;

function parseEnvOutput(output) {
  const values = {};
  for (const rawLine of output.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(rawLine.trim());
    if (!match) continue;
    let value = match[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value) values[match[1]] = value;
  }
  return values;
}

function readStatusEnv() {
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(command, ['supabase', 'status', '-o', 'env'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 60000,
  });
  return parseEnvOutput(`${result.stdout ?? ''}\n${result.stderr ?? ''}`);
}

/**
 * Returns `{ apiUrl, publishableKey, secretKey, mailpitUrl }`.
 * Throws with an actionable message when the local stack is not available and
 * no explicit environment overrides were supplied.
 */
export function resolveLocalStack() {
  if (cached) return cached;

  const needsDiscovery =
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_PUBLISHABLE_KEY ||
    !process.env.SUPABASE_SECRET_KEY;
  const discovered = needsDiscovery ? readStatusEnv() : {};

  const apiUrl = process.env.SUPABASE_URL ?? discovered.API_URL;
  const publishableKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ?? discovered.PUBLISHABLE_KEY ?? discovered.ANON_KEY;
  const secretKey =
    process.env.SUPABASE_SECRET_KEY ?? discovered.SECRET_KEY ?? discovered.SERVICE_ROLE_KEY;
  const mailpitUrl = process.env.MAILPIT_URL ?? discovered.MAILPIT_URL;

  if (!apiUrl || !publishableKey || !secretKey) {
    throw new Error(
      'Local Supabase stack is not available. Start it with `npx supabase start`, ' +
        'or provide SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY.',
    );
  }

  cached = {
    apiUrl,
    publishableKey,
    secretKey,
    mailpitUrl: mailpitUrl ?? 'http://127.0.0.1:54324',
  };
  return cached;
}
