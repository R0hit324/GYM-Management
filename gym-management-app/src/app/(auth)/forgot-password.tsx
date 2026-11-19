/**
 * Forgot password + reset (Part 2, screens 6 & 7). Two steps in one
 * screen: request a reset code for the account's email, then set a new
 * password with that code. Rate limits, cooldowns and attempt caps come
 * from the provider, not from the UI.
 *
 * Enumeration safety: the response to a reset request is coarse — the demo
 * provider issues a challenge for any well-formed email, and only shows
 * the demo code when the account actually exists. The copy never confirms
 * or denies that an account exists.
 */
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { OtpInput } from '@/components/ui/otp-input';
import { PressSurface } from '@/components/ui/press-surface';
import { RiseIn } from '@/components/ui/rise-in';
import { AuthCard, AuthErrorMessage, AuthHeader, AuthHeading, AuthPanel, DemoCodeWell } from '@/components/auth/auth-ui';
import { useTokens } from '@/hooks/use-tokens';
import { useCountdown } from '@/hooks/use-countdown';
import { checkPassword, useAuth } from '@/services/auth';

export default function ForgotPasswordScreen() {
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const { colors, spacing } = tokens;
  const { provider } = useAuth();
  const params = useLocalSearchParams<{ email?: string }>();

  const [step, setStep] = useState<0 | 1>(0);
  const [email, setEmail] = useState(params.email ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ email?: string; password?: string; confirm?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const cooldown = useCountdown(0);

  const requestCode = useCallback(async () => {
    const trimmed = email.trim();
    const next: { email?: string } = {};
    if (!trimmed) next.email = 'Enter the email on your account.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSubmitError(null);
    setBusy(true);
    const outcome = await provider.requestChallenge({ kind: 'password-reset', email: trimmed });
    if (outcome.status === 'issued') {
      setChallengeId(outcome.challenge.challengeId);
      // Enumeration-safe demo: the code only appears when the account exists.
      setDemoCode(outcome.challenge.demoCode ?? null);
      cooldown.restart(outcome.challenge.resendCooldownSeconds);
      setStep(1);
    } else if (outcome.status === 'cooldown') {
      setSubmitError(`Wait ${outcome.retryAfterSeconds}s before requesting another code.`);
    } else if (outcome.status === 'rate_limited') {
      setSubmitError(`Too many requests. Try again in ${outcome.retryAfterSeconds}s.`);
    } else {
      setSubmitError('That email address could not be used. Check it and try again.');
    }
    setBusy(false);
  }, [email, provider, cooldown]);

  const onReset = useCallback(async () => {
    if (!challengeId || busy) return;
    const next: { password?: string; confirm?: string } = {};
    if (checkPassword(password) !== 'ok') {
      next.password = 'At least 8 characters, with a letter and a number.';
    }
    if (confirm !== password) next.confirm = 'The two passwords do not match.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSubmitError(null);
    setBusy(true);
    const outcome = await provider.resetPassword(challengeId, code, password);
    if (outcome.status === 'ok') {
      // Recovery safeguard (provider-side): all existing sessions of the
      // account were revoked. The user signs in fresh.
      setResetDone(true);
    } else if (outcome.status === 'invalid_code') {
      setSubmitError('That code is not correct. Check it and try again.');
    } else if (outcome.status === 'expired') {
      setSubmitError('The code expired. Request a new one.');
      setStep(0);
    } else if (outcome.status === 'locked') {
      setSubmitError('Too many wrong attempts — request a new code.');
      setStep(0);
    } else {
      setSubmitError('Choose a stronger password (8+ characters, a letter and a number).');
    }
    setBusy(false);
  }, [challengeId, code, password, confirm, busy, provider]);

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
          {resetDone ? (
            <RiseIn style={{ gap: spacing.sm }}>
              <AuthHeading muted="Password " emphasis="updated" />
              <AppText variant="label" style={{ color: colors.authInkSubtle }}>
                Your password was changed. Every existing session of the account was signed out — sign in again with the
                new password.
              </AppText>
              <View style={{ marginTop: spacing.sm }}>
                <Button
                  label="Back to sign in"
                  icon="log-in-outline"
                  fullWidth
                  variant="primarySoft"
                  onPress={() => router.replace('/login' as never)}
                />
              </View>
            </RiseIn>
          ) : step === 0 ? (
            <RiseIn style={{ gap: spacing.sm }}>
              <AuthHeading muted="Reset your " emphasis="password" />
              <AppText variant="label" style={{ color: colors.authInkSubtle }}>
                Enter the email on your account and we will issue a single-use reset code.
              </AppText>
              <View style={{ marginTop: spacing.xs }}>
                <TextField
                  label="Email address"
                  appearance="auth"
                  placeholder="you@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChangeText={setEmail}
                  error={errors.email}
                  leadingIcon="mail-outline"
                  accentColor={colors.authAccent}
                />
              </View>
              {submitError && <AuthErrorMessage message={submitError} />}
              <View style={{ marginTop: spacing.xs }}>
                <Button
                  label={busy ? 'Requesting code' : 'Send reset code'}
                  icon={busy ? undefined : 'key-outline'}
                  fullWidth
                  loading={busy}
                  disabled={busy}
                  variant="primarySoft"
                  onPress={requestCode}
                />
              </View>
              <AppText variant="caption" style={{ color: colors.authInkSubtle }}>
                For your security the response never reveals whether an account exists. Members can also ask at the
                reception desk; staff contact the Owner.
              </AppText>
            </RiseIn>
          ) : (
            <RiseIn style={{ gap: spacing.sm }}>
              <AuthHeading muted="Choose a new " emphasis="password" />
              <AuthCard style={{ marginTop: spacing.xs }}>
                <View style={{ gap: spacing.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <AppText variant="heading" style={{ color: colors.authInk }}>
                      Reset code
                    </AppText>
                    {cooldown.active && (
                      <AppText variant="caption" style={{ color: colors.authInkSubtle }}>
                        Resend in {cooldown.remaining}s
                      </AppText>
                    )}
                  </View>
                  <OtpInput onChange={setCode} appearance="auth" />
                  {demoCode ? (
                    <DemoCodeWell code={demoCode} note="Demo provider: no email is actually sent." />
                  ) : (
                    <AppText variant="caption" style={{ color: colors.authInkSubtle }}>
                      If an account exists for this email, its reset code was issued. (Demo: codes are only shown for
                      existing demo accounts.)
                    </AppText>
                  )}
                </View>
              </AuthCard>
              <TextField
                label="New password"
                appearance="auth"
                placeholder="New password"
                secure
                autoComplete="new-password"
                value={password}
                onChangeText={setPassword}
                error={errors.password}
                leadingIcon="lock-closed-outline"
                accentColor={colors.authAccent}
              />
              <TextField
                label="Confirm new password"
                appearance="auth"
                placeholder="Repeat the new password"
                secure
                autoComplete="new-password"
                value={confirm}
                onChangeText={setConfirm}
                error={errors.confirm}
                leadingIcon="lock-closed-outline"
                accentColor={colors.authAccent}
              />
              {submitError && <AuthErrorMessage message={submitError} />}
              <View style={{ marginTop: spacing.xs, gap: spacing.xs }}>
                <Button
                  label={busy ? 'Updating password' : 'Set new password'}
                  icon={busy ? undefined : 'checkmark-circle-outline'}
                  fullWidth
                  loading={busy}
                  disabled={busy || code.length < 6}
                  variant="primarySoft"
                  onPress={onReset}
                />
                <PressSurface
                  accessibilityRole="button"
                  accessibilityState={{ disabled: cooldown.active || busy }}
                  onPress={() => {
                    if (cooldown.active || busy) return;
                    void requestCode();
                  }}
                  scaleOnPress={false}
                  style={{ alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.xs }}>
                  <AppText variant="label" style={{ color: cooldown.active ? colors.authInkSubtle : colors.authInk }}>
                    {cooldown.active ? `Resend code in ${cooldown.remaining}s` : 'Resend code'}
                  </AppText>
                </PressSurface>
              </View>
            </RiseIn>
          )}
        </ScrollView>
      </AuthPanel>
    </View>
  );
}
