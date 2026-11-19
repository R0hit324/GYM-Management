/**
 * Staff MFA verification (Part 2, screen 8). Credentials were accepted by
 * the provider — this screen proves a second factor. A wrong, expired or
 * exhausted code never reaches the workspace, and a locked challenge is
 * replaced by a fresh one after the cooldown.
 *
 * Demo honesty: while provider.mode === 'demo' nothing is delivered, so the
 * code is shown in the labelled DemoCodeWell. A live provider never sets
 * `demoCode`, and the well simply does not render.
 */
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { OtpInput } from '@/components/ui/otp-input';
import { PressSurface } from '@/components/ui/press-surface';
import { RiseIn } from '@/components/ui/rise-in';
import { AuthCard, AuthErrorMessage, AuthHeader, AuthHeading, AuthPanel, DemoCodeWell } from '@/components/auth/auth-ui';
import { useTokens } from '@/hooks/use-tokens';
import { useCountdown } from '@/hooks/use-countdown';
import { useAuth } from '@/services/auth';
import type { AuthChallenge, CompleteSignInResult } from '@/services/auth';

export default function MfaScreen() {
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const { colors, spacing } = tokens;
  const { provider, completeSignIn } = useAuth();
  const params = useLocalSearchParams<{ pending?: string; challenge?: string }>();
  const pendingAuthId = params.pending ?? '';

  const [challenge, setChallenge] = useState<AuthChallenge | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const expiry = useCountdown(0);
  const cooldown = useCountdown(0);

  const requestFresh = useCallback(async () => {
    setError(null);
    const outcome = await provider.requestChallenge({ kind: 'mfa', pendingAuthId });
    if (outcome.status === 'issued') {
      setChallenge(outcome.challenge);
      expiry.restart(outcome.challenge.expiresInSeconds);
      cooldown.restart(outcome.challenge.resendCooldownSeconds);
      setCode('');
    } else if (outcome.status === 'cooldown') {
      setError(`Wait ${outcome.retryAfterSeconds}s before requesting a new code.`);
    } else if (outcome.status === 'rate_limited') {
      setError(`Too many requests. Try again in ${outcome.retryAfterSeconds}s.`);
    } else {
      setError('This sign-in attempt expired. Start again from the login screen.');
    }
  }, [provider, pendingAuthId, cooldown, expiry]);

  // First paint: the challenge handed over from login (its metadata is
  // re-fetched so expiry/cooldowns reflect reality, not the URL).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const existing = params.challenge ? await provider.getChallenge(params.challenge) : null;
      if (cancelled) return;
      if (existing) {
        setChallenge(existing);
        expiry.restart(existing.expiresInSeconds);
        cooldown.restart(existing.resendCooldownSeconds);
      } else {
        await requestFresh();
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onVerify = useCallback(async () => {
    if (!challenge || code.length < 6 || busy) return;
    setBusy(true);
    setError(null);
    const outcome = await provider.verifyMfa(pendingAuthId, challenge.challengeId, code);
    if (outcome.status === 'ok') {
      const done: CompleteSignInResult = await completeSignIn(pendingAuthId);
      if (done.status === 'ok') {
        router.replace(
          `/success?mode=signin&role=${done.session.role}&name=${encodeURIComponent(done.session.displayName)}` as never,
        );
        return;
      }
      setError('This sign-in attempt expired. Start again from the login screen.');
    } else if (outcome.status === 'invalid_code') {
      setError('That code is not correct. Check the demo code and try again.');
    } else if (outcome.status === 'locked') {
      setError('Too many wrong attempts — the code was reset for security.');
      await requestFresh();
    } else {
      setError('The code expired. A new one was issued.');
      await requestFresh();
    }
    setBusy(false);
  }, [challenge, code, busy, provider, pendingAuthId, completeSignIn, requestFresh]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.authTop, paddingTop: insets.top }}>
      <StatusBar style="dark" />
      <Stack.Screen options={{ headerShown: false }} />
      <AuthHeader
        topRow={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to sign in"
            hitSlop={12}
            onPress={() => router.replace('/login' as never)}
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.6 : 1,
            })}>
            <Ionicons name="arrow-back" size={22} color={colors.authBg} />
          </Pressable>
        }
      />
      <AuthPanel>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xl }}
          keyboardShouldPersistTaps="handled">
          <RiseIn>
            <AuthHeading muted="Two-factor " emphasis="check" />
          </RiseIn>
          <RiseIn index={1}>
            <AppText variant="label" style={{ color: colors.authInkSubtle, marginTop: spacing['3xs'] }}>
              Staff accounts confirm a second factor after the password. Enter the 6-digit code.
            </AppText>
          </RiseIn>

          <RiseIn index={2} style={{ marginTop: spacing.md }}>
            <AuthCard>
              {!loading && challenge && (
                <View style={{ gap: spacing.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <AppText variant="heading" style={{ color: colors.authInk }}>
                      Authenticator code
                    </AppText>
                    {expiry.remaining > 0 ? (
                      <AppText variant="caption" style={{ color: colors.authInkSubtle }}>
                        Expires in {Math.floor(expiry.remaining / 60)}:{String(expiry.remaining % 60).padStart(2, '0')}
                      </AppText>
                    ) : (
                      <AppText variant="caption" style={{ color: colors.danger }}>
                        Expired
                      </AppText>
                    )}
                  </View>
                  <AppText variant="label" style={{ color: colors.authInkMuted }}>
                    {challenge.targetHint}
                  </AppText>
                  <View style={{ marginTop: spacing.xs }}>
                    <OtpInput onChange={setCode} appearance="auth" />
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <AppText variant="caption" style={{ color: colors.authInkSubtle }}>
                      {challenge.remainingAttempts} {challenge.remainingAttempts === 1 ? 'attempt' : 'attempts'} left
                    </AppText>
                    <PressSurface
                      accessibilityRole="button"
                      accessibilityState={{ disabled: cooldown.active }}
                      onPress={() => {
                        if (cooldown.active) return;
                        void requestFresh();
                      }}
                      style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.xxs }}>
                      <AppText variant="label" style={{ color: cooldown.active ? colors.authInkSubtle : colors.authInk }}>
                        {cooldown.active ? `New code in ${cooldown.remaining}s` : 'Request a new code'}
                      </AppText>
                    </PressSurface>
                  </View>
                  {challenge.demoCode && <DemoCodeWell code={challenge.demoCode} note="Demo provider: no SMS or authenticator push is sent." />}
                  {error && <AuthErrorMessage message={error} />}
                  <View style={{ marginTop: spacing.xs }}>
                    <Button
                      label={busy ? 'Checking code' : 'Verify and continue'}
                      icon={busy ? undefined : 'shield-checkmark-outline'}
                      fullWidth
                      loading={busy}
                      disabled={busy || code.length < 6}
                      variant="primarySoft"
                      onPress={onVerify}
                    />
                  </View>
                </View>
              )}
            </AuthCard>
          </RiseIn>
        </ScrollView>
      </AuthPanel>
    </View>
  );
}
