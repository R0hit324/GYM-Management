/**
 * Supabase environment-configuration tests (Phase 2). Pure logic: env
 * parsing/validation, publishable-vs-legacy-anon key handling, and URL
 * normalization. No network, no secrets, no SecureStore.
 */
import { readSupabaseEnv } from '@/services/supabase/client';

const URL_VAR = 'EXPO_PUBLIC_SUPABASE_URL';
const KEY_VAR = 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY';
const ANON_VAR = 'EXPO_PUBLIC_SUPABASE_ANON_KEY';

function withEnv(env: Record<string, string | undefined>, run: () => void) {
  const saved = [process.env[URL_VAR], process.env[KEY_VAR], process.env[ANON_VAR]];
  try {
    delete process.env[URL_VAR];
    delete process.env[KEY_VAR];
    delete process.env[ANON_VAR];
    for (const [k, v] of Object.entries(env)) {
      if (v !== undefined) process.env[k] = v;
    }
    run();
  } finally {
    delete process.env[URL_VAR];
    delete process.env[KEY_VAR];
    delete process.env[ANON_VAR];
    const [url, key, anon] = saved;
    if (url !== undefined) process.env[URL_VAR] = url;
    if (key !== undefined) process.env[KEY_VAR] = key;
    if (anon !== undefined) process.env[ANON_VAR] = anon;
  }
}

describe('readSupabaseEnv', () => {
  it('reports missing when nothing is set', () => {
    withEnv({}, () => {
      expect(readSupabaseEnv()).toEqual({ status: 'missing' });
    });
  });

  it('accepts a publishable key and normalizes the URL', () => {
    withEnv(
      {
        [URL_VAR]: 'https://abcdefgh.supabase.co/',
        [KEY_VAR]: 'sb_publishable_demo',
      },
      () => {
        const result = readSupabaseEnv();
        expect(result).toEqual({
          status: 'ok',
          env: { url: 'https://abcdefgh.supabase.co', publishableKey: 'sb_publishable_demo' },
        });
      },
    );
  });

  it('falls back to the legacy anon key when no publishable key is set', () => {
    withEnv(
      {
        [URL_VAR]: 'https://abcdefgh.supabase.co',
        [ANON_VAR]: 'eyJlegacy.anon.key',
      },
      () => {
        const result = readSupabaseEnv();
        expect(result.status).toBe('ok');
        if (result.status === 'ok') expect(result.env.publishableKey).toBe('eyJlegacy.anon.key');
      },
    );
  });

  it('rejects a URL without a key', () => {
    withEnv({ [URL_VAR]: 'https://abcdefgh.supabase.co' }, () => {
      const result = readSupabaseEnv();
      expect(result.status).toBe('invalid');
    });
  });

  it('rejects a key without a URL', () => {
    withEnv({ [KEY_VAR]: 'sb_publishable_demo' }, () => {
      expect(readSupabaseEnv().status).toBe('invalid');
    });
  });

  it('rejects a malformed URL', () => {
    withEnv({ [URL_VAR]: 'abcdefgh.supabase.co', [KEY_VAR]: 'sb_publishable_demo' }, () => {
      expect(readSupabaseEnv().status).toBe('invalid');
    });
  });
});
