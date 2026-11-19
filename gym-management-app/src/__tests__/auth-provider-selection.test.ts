/**
 * Auth provider selection tests.
 *
 * The app must keep the honest demo provider unless a deployment explicitly
 * opts in with `EXPO_PUBLIC_AUTH_MODE=live` *and* the Supabase environment is
 * complete. These tests pin that default so a screen can never start talking
 * to a real backend by accident.
 */
import { demoAuthProvider } from '@/services/auth/demo-provider';
import { liveAuthProvider } from '@/services/auth/live-provider';
import { resetAuthProviderForTests, resolveAuthProvider } from '@/services/auth/provider';

const MODE_VAR = 'EXPO_PUBLIC_AUTH_MODE';
const URL_VAR = 'EXPO_PUBLIC_SUPABASE_URL';
const KEY_VAR = 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY';
const ANON_VAR = 'EXPO_PUBLIC_SUPABASE_ANON_KEY';
const ENV_VARS = [MODE_VAR, URL_VAR, KEY_VAR, ANON_VAR];

function withEnv(env: Record<string, string | undefined>, run: () => void) {
  const saved = ENV_VARS.map((key) => [key, process.env[key]] as const);
  try {
    for (const key of ENV_VARS) delete process.env[key];
    for (const [key, value] of Object.entries(env)) {
      if (value !== undefined) process.env[key] = value;
    }
    resetAuthProviderForTests();
    run();
  } finally {
    for (const key of ENV_VARS) delete process.env[key];
    for (const [key, value] of saved) {
      if (value !== undefined) process.env[key] = value;
    }
    resetAuthProviderForTests();
  }
}

const COMPLETE_SUPABASE_ENV = {
  [URL_VAR]: 'https://abcdefgh.supabase.co',
  [KEY_VAR]: 'sb_publishable_demo',
};

describe('resolveAuthProvider', () => {
  it('defaults to the demo provider when no mode is set', () => {
    withEnv({}, () => {
      expect(resolveAuthProvider()).toBe(demoAuthProvider);
    });
  });

  it('stays on demo for an unknown mode value', () => {
    withEnv({ ...COMPLETE_SUPABASE_ENV, [MODE_VAR]: 'production' }, () => {
      expect(resolveAuthProvider()).toBe(demoAuthProvider);
    });
  });

  it('falls back to demo when live is requested without Supabase configuration', () => {
    withEnv({ [MODE_VAR]: 'live' }, () => {
      expect(resolveAuthProvider()).toBe(demoAuthProvider);
    });
  });

  it('falls back to demo when live is requested with only half the configuration', () => {
    withEnv({ [MODE_VAR]: 'live', [URL_VAR]: COMPLETE_SUPABASE_ENV[URL_VAR] }, () => {
      expect(resolveAuthProvider()).toBe(demoAuthProvider);
    });
  });

  it('selects the live provider for live mode with a complete configuration', () => {
    withEnv({ ...COMPLETE_SUPABASE_ENV, [MODE_VAR]: 'live' }, () => {
      expect(resolveAuthProvider()).toBe(liveAuthProvider);
    });
  });

  it('accepts a legacy anon key as a complete configuration', () => {
    withEnv(
      { [MODE_VAR]: 'LIVE', [URL_VAR]: COMPLETE_SUPABASE_ENV[URL_VAR], [ANON_VAR]: 'eyJlegacy.anon.key' },
      () => {
        expect(resolveAuthProvider()).toBe(liveAuthProvider);
      },
    );
  });

  it('resolves once per process so session state cannot split', () => {
    withEnv({}, () => {
      const first = resolveAuthProvider();
      // A later environment change must not swap the provider mid-session.
      process.env[MODE_VAR] = 'live';
      process.env[URL_VAR] = COMPLETE_SUPABASE_ENV[URL_VAR];
      process.env[KEY_VAR] = COMPLETE_SUPABASE_ENV[KEY_VAR];
      expect(resolveAuthProvider()).toBe(first);
    });
  });
});
