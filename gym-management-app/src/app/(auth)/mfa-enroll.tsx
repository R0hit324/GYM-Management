/**
 * First-time staff MFA enrolment (WS-5).
 *
 * A newly created Receptionist has no TOTP factor. Sign-in deliberately
 * refuses to report an AAL1 session as signed in, so this screen performs
 * the one missing step: enrol an authenticator factor, verify it, reach
 * AAL2, then complete the same pending sign-in. Nothing is bypassed — if
 * verification fails, the workspace stays closed.
 *
 * The secret and otpauth URI exist only in this screen's state. They are
 * never stored, logged, or sent anywhere by the app.
 */
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import QRCode from 'react-native-qrcode-svg';

import { AppText } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { OtpInput } from '@/components/ui/otp-input';
import { RiseIn } from '@/components/ui/rise-in';
import {
  AuthCard,
  AuthErrorMessage,
  AuthHeader,
  AuthHeading,
  AuthPanel,
} from '@/components/auth/auth-ui';
import { useTokens } from '@/hooks/use-tokens';
import { useAuth } from '@/services/auth';
import type { MfaEnrollment } from '@/services/auth';

export default function MfaEnrollScreen() {
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const { colors, spacing } = tokens;
  const { provider, completeSignIn } = useAuth();
  const params = useLocalSearchParams<{ pending?: string; email?: string }>();
  const pendingAuthId = params.pending ?? '';
  const email = typeof params.email === 'string' ? params.email : '';

  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // First paint: ask the live provider for a fresh TOTP factor. If a
  // verified factor already exists (for example a retry after a lost
  // response), continue with the normal challenge instead.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!pendingAuthId || !provider.startMfaEnrollment) {
        if (!cancelled) {
          setError('This build cannot enrol an authenticator. Use the live app build and try again.');
          setLoading(false);
        }
        return;
      }
      const outcome = await provider.startMfaEnrollment(pendingAuthId);
      if (cancelled) return;
      if (outcome.status === 'ready') {
        setEnrollment(outcome.enrollment);
      } else if (outcome.status === 'already_enrolled') {
        router.replace(`/mfa?pending=${pendingAuthId}` as never);
        return;
      } else {
        setError('This sign-in attempt expired. Start again from the login screen.');
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onVerify = useCallback(async () => {
    if (!enrollment || !provider.completeMfaEnrollment || code.length < 6 || busy) return;
    setBusy(true);
    setError(null);

    const outcome = await provider.completeMfaEnrollment(
      pendingAuthId,
      enrollment.factorId,
      code,
    );

    if (outcome.status === 'ok') {
      const done = await completeSignIn(pendingAuthId);
      if (done.status === 'ok') {
        router.replace(
          `/success?mode=signin&role=${done.session.role}&name=${encodeURIComponent(done.session.displayName)}` as never,
        );
        return;
      }
      setError('The factor was verified but the sign-in could not be completed. Start again from login.');
    } else if (outcome.status === 'invalid_code') {
      setError('That code is not correct. Check the authenticator and try again.');
    } else if (outcome.status === 'locked') {
      setError('Too many attempts. Wait a moment, then start again from the login screen.');
    } else if (outcome.status === 'expired') {
      setError('The enrolment expired. Start again from the login screen.');
    } else {
      setError('The authenticator could not be enrolled. Start again from the login screen.');
    }
    setBusy(false);
  }, [enrollment, provider, code, busy, pendingAuthId, completeSignIn]);

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
          contentContainerStyle={{
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.lg,
            paddingBottom: spacing.xl,
          }}
          keyboardShouldPersistTaps="handled">
          <RiseIn>
            <AuthHeading muted="Secure your " emphasis="account" />
          </RiseIn>
          <RiseIn index={1}>
            <AppText variant="label" style={{ color: colors.authInkSubtle, marginTop: spacing['3xs'] }}>
              Staff accounts need an authenticator before the workspace opens. Scan the code, then
              enter the 6-digit code it shows.
            </AppText>
          </RiseIn>

          <RiseIn index={2} style={{ marginTop: spacing.md }}>
            <AuthCard>
              {loading ? (
                <AppText variant="label" style={{ color: colors.authInkMuted }}>
                  Preparing your authenticator…
                </AppText>
              ) : enrollment ? (
                <View style={{ gap: spacing.sm }}>
                  <AppText variant="heading" style={{ color: colors.authInk }}>
                    Set up authenticator
                  </AppText>
                  {email ? (
                    <AppText variant="caption" style={{ color: colors.authInkSubtle }}>
                      For {email}
                    </AppText>
                  ) : null}

                  <View
                    style={{
                      alignSelf: 'center',
                      padding: spacing.sm,
                      borderRadius: 16,
                      backgroundColor: '#FFFFFF',
                    }}>
                    <QRCode value={enrollment.uri} size={188} color="#111111" backgroundColor="#FFFFFF" />
                  </View>

                  <AppText variant="caption" style={{ color: colors.authInkMuted }}>
                    Can’t scan it? Enter this setup key in your authenticator:
                  </AppText>
                  <AppText
                    variant="bodyStrong"
                    selectable
                    style={{
                      color: colors.authInk,
                      letterSpacing: 1.5,
                      backgroundColor: colors.authField,
                      borderRadius: 10,
                      padding: spacing.sm,
                    }}>
                    {enrollment.secret}
                  </AppText>

                  <View style={{ marginTop: spacing.xs }}>
                    <OtpInput onChange={setCode} appearance="auth" />
                  </View>

                  {error && <AuthErrorMessage message={error} />}

                  <View style={{ marginTop: spacing.xs }}>
                    <Button
                      label={busy ? 'Verifying code' : 'Verify and continue'}
                      icon={busy ? undefined : 'shield-checkmark-outline'}
                      fullWidth
                      loading={busy}
                      disabled={busy || code.length < 6}
                      variant="primarySoft"
                      onPress={() => void onVerify()}
                    />
                  </View>
                  <AppText variant="caption" style={{ color: colors.authInkSubtle }}>
                    The setup key is shown only on this screen. The app never stores it. If you lose
                    the authenticator, the owner must create a new account for you.
                  </AppText>
                </View>
              ) : (
                <View style={{ gap: spacing.sm }}>
                  {error ? (
                    <AuthErrorMessage message={error} />
                  ) : (
                    <AppText variant="label" style={{ color: colors.authInkMuted }}>
                      Enrolment is unavailable.
                    </AppText>
                  )}
                  <Button
                    label="Back to sign in"
                    variant="secondary"
                    fullWidth
                    onPress={() => router.replace('/login' as never)}
                  />
                </View>
              )}
            </AuthCard>
          </RiseIn>
        </ScrollView>
      </AuthPanel>
    </View>
  );
}
