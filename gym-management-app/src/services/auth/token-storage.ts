/**
 * Secure token storage for the auth session.
 *
 * Tokens NEVER go into plain AsyncStorage: they live in the platform
 * secure store (Keychain / Keystore) via expo-secure-store. If the native
 * module is unavailable (unit tests, web), the same store transparently
 * falls back to memory so the session layer keeps working and stays
 * testable — never a plain-text disk write either way.
 */
import { Platform } from 'react-native';

import type { SessionTokens } from '@/services/auth/types';

export interface TokenStore {
  load(): Promise<SessionTokens | null>;
  save(tokens: SessionTokens): Promise<void>;
  clear(): Promise<void>;
}

class MemoryTokenStore implements TokenStore {
  private value: SessionTokens | null = null;
  async load() {
    return this.value;
  }
  async save(tokens: SessionTokens) {
    this.value = tokens;
  }
  async clear() {
    this.value = null;
  }
}

const STORAGE_KEY = 'pulse.auth.tokens.v1';

class SecureTokenStore implements TokenStore {
  // The memory fallback also covers a failing native module: a failed
  // secure write must never silently downgrade to plain-text storage, so
  // the tokens simply stay in-process instead.
  private memory = new MemoryTokenStore();

  async load(): Promise<SessionTokens | null> {
    try {
      const SecureStore = await import('expo-secure-store');
      const raw = await SecureStore.getItemAsync(STORAGE_KEY);
      if (!raw) return this.memory.load();
      const parsed = JSON.parse(raw) as SessionTokens;
      if (
        typeof parsed.accessToken !== 'string' ||
        typeof parsed.refreshToken !== 'string' ||
        typeof parsed.accessExpiresAt !== 'number' ||
        typeof parsed.refreshExpiresAt !== 'number'
      ) {
        return null;
      }
      return parsed;
    } catch {
      return this.memory.load();
    }
  }

  async save(tokens: SessionTokens): Promise<void> {
    try {
      const SecureStore = await import('expo-secure-store');
      await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(tokens), {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
      this.memory.save(tokens);
    } catch {
      await this.memory.save(tokens);
    }
  }

  async clear(): Promise<void> {
    try {
      const SecureStore = await import('expo-secure-store');
      await SecureStore.deleteItemAsync(STORAGE_KEY);
    } catch {
      // fall through to the memory clear
    }
    await this.memory.clear();
  }
}

export const tokenStore: TokenStore = Platform.OS === 'web' ? new MemoryTokenStore() : new SecureTokenStore();
