/**
 * Account verification at sign-in (Part 2, screens 4 & 5). An account
 * whose email/phone checks are outstanding verifies them here before the
 * sign-in completes — the provider holds the pending sign-in, so the
 * password is checked exactly once and never re-asked.
 *
 * Checks run in the order the provider reports them as missing. When all
 * are satisfied the sign-in completes and hands off to the success screen.
 *
 * Demo honesty: codes are shown in the labelled DemoCodeWell because no
 * SMS/email actually goes out (demo provider only).
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
import { StatusBadge } from '@/components/ui/status-badge';
import { AuthCard, AuthErrorMessage, AuthHeader, AuthHeading, AuthPanel, DemoCodeWell } from '@/components/auth/auth-ui';
import { useTokens } from '@/hooks/use-tokens';
import { useCountdown } from '@/hooks/use-countdown';
import { useAuth } from '@/services/auth';
import type { AuthChallenge, VerificationKind } from '@/services/auth';

const checkLabel: Record<VerificationKind, { title: string; blurb: string }> = {
  email: { title: 'Email code', blurb: 'A 6-digit code confirms this address is yours.' },
  phone: { title: 'Phone code', blurb: 'A 6-digit SMS code confirms this number is yours.' },
};

export default function VerifyScreen() {
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const { colors, spacing } = tokens;
  const { provider, completeSignIn } = useAuth();
  const params = useLocalSearchParams<{ pending?: string; missing?: string; email?: string }>();
  const pendingAuthId = params.pending ?? '';

  const [missing, setMissing] = useState<VerificationKind[]>(() => {
    const list = (params.missing ?? 'email').split(',').filter(Boolean);
    return list.filter((k): k is VerificationKind => k === 'email' || k === 'phone');
  });
  const [contact, setContact] = useState<{ email: string; phone: string | null } | null>(null);
  const [current, setCurrent] = useState<VerificationKind | null>(null);
  const [challenge, setChallenge] = useState<AuthChallenge | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<VerificationKind[]>([]);
  const expiry = useCountdown(0);
  const cooldown = useCountdown(0);

  const startCheck = useCallback(
    async (kind: VerificationKind, info: { email: string; phone: string | null }) => {
      setError(null);
      const outcome =
        kind === 'email'
          ? await provider.requestChallenge({ kind: 'email-code', email: info.email, pendingAuthId })
          : await provider.requestChallenge({ kind: 'phone-otp', phone: info.phone ?? '', pendingAuthId });
      if (outcome.status === 'issued') {
        setChallenge(outcome.challenge);
        setCode('');
        expiry.restart(outcome.challenge.expiresInSeconds);
        cooldown.restart(outcome.challenge.resendCooldownSeconds);
      } else if (outcome.status === 'cooldown') {
        setError(`Wait ${outcome.retryAfterSeconds}s before requesting a new code.`);
      } else if (outcome.status === 'rate_limited') {
        setError(`Too many requests. Try again in ${outcome.retryAfterSeconds}s.`);
      } else {
        setError('This sign-in attempt expired. Start again from the login screen.');
      }
    },
    [provider, pendingAuthId, cooldown, expiry],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const info = await provider.getPendingContact(pendingAuthId);
      if (cancelled) return;
      if (!info) {
        setError('This sign-in attempt expired. Start again from the login screen.');
        return;
      }
      const nextMissing = info.missing.filter((k) => missing.includes(k));
      setContact({ email: info.email, phone: info.phone });
      setMissing(nextMissing);
      if (nextMissing.length > 0) {
        setCurrent(nextMissing[0]);
        await startCheck(nextMissing[0], { email: info.email, phone: info.phone });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onVerify = useCallback(async () => {
    if (!current || !challenge || code.length < 6 || busy) return;
    setBusy(true);
    setError(null);
    const outcome = await provider.verifyChallenge(challenge.challengeId, code);
    if (outcome.status === 'ok') {
      const nextDone = [...done, current];
      const nextMissing = missing.filter((k) => k !== current);
      setDone(nextDone);
      setMissing(nextMissing);
      if (nextMissing.length === 0) {
        const finished = await completeSignIn(pendingAuthId);
        if (finished.status === 'ok') {
          router.replace(
            `/success?mode=signin&role=${finished.session.role}&name=${encodeURIComponent(finished.session.displayName)}` as never,
          );
          return;
        }
        setError('This sign-in attempt expired. Start again from the login screen.');
      } else {
        setCurrent(nextMissing[0]);
        await startCheck(nextMissing[0], { email: contact?.email ?? '', phone: contact?.phone ?? null });
      }
    } else if (outcome.status === 'invalid_code') {
      setError('That code is not correct. Check the demo code and try again.');
    } else if (outcome.status === 'locked') {
      setError('Too many wrong attempts — the code was reset for security.');
      if (contact) await startCheck(current, contact);
    } else {
      setError('The code expired. A new one was issued.');
      if (contact) await startCheck(current, contact);
    }
    setBusy(false);
  }, [current, challenge, code, busy, provider, done, missing, contact, completeSignIn, startCheck, pendingAuthId]);

  const backTarget = done.length > 0 ? undefined : '/login';

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
            onPress={() => router.replace((backTarget ?? '/login') as never)}
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
            <AuthHeading muted="Confirm " emphasis="your account" />
          </RiseIn>
          <RiseIn index={1}>
            <AppText variant="label" style={{ color: colors.authInkSubtle, marginTop: spacing['3xs'] }}>
              One-time checks for the contact details on this account. Your password was already accepted.
            </AppText>
          </RiseIn>

          {/* Progress: every outstanding check as a badge */}
          <RiseIn index={2}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm }}>
              {(['email', 'phone'] as VerificationKind[])
                .filter((k) => missing.includes(k) || done.includes(k))
                .map((k) => (
                  <StatusBadge
                    key={k}
                    label={`${checkLabel[k].title}${done.includes(k) ? ' · verified' : ''}`}
                    tone={done.includes(k) ? 'success' : 'info'}
                    small
                  />
                ))}
            </View>
          </RiseIn>

          <RiseIn index={3} style={{ marginTop: spacing.md }}>
            <AuthCard>
              {current && (
                <View style={{ gap: spacing.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <AppText variant="heading" style={{ color: colors.authInk }}>
                      {checkLabel[current].title}
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
                    {checkLabel[current].blurb} {challenge?.targetHint}
                  </AppText>
                  <View style={{ marginTop: spacing.xs }}>
                    <OtpInput onChange={setCode} appearance="auth" />
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <AppText variant="caption" style={{ color: colors.authInkSubtle }}>
                      {challenge ? `${challenge.remainingAttempts} attempts left` : ''}
                    </AppText>
                    <PressSurface
                      accessibilityRole="button"
                      accessibilityState={{ disabled: cooldown.active }}
                      onPress={() => {
                        if (cooldown.active || !contact) return;
                        void startCheck(current, contact);
                      }}
                      style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.xxs }}>
                      <AppText variant="label" style={{ color: cooldown.active ? colors.authInkSubtle : colors.authInk }}>
                        {cooldown.active ? `Resend in ${cooldown.remaining}s` : 'Resend code'}
                      </AppText>
                    </PressSurface>
                  </View>
                  {challenge?.demoCode && (
                    <DemoCodeWell code={challenge.demoCode} note="Demo provider: no SMS or email is actually sent." />
                  )}
                  {error && <AuthErrorMessage message={error} />}
                  <View style={{ marginTop: spacing.xs }}>
                    <Button
                      label={busy ? 'Checking code' : 'Verify and continue'}
                      icon={busy ? undefined : 'checkmark-circle-outline'}
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
