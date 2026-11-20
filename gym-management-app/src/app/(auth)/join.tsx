/**
 * Screen 2 — Online joining (member registration), now connected to the
 * auth provider (Part 2).
 *
 * Flow: details (with a real password) → verification (phone OTP + email
 * code — both real single-use challenges with expiry, cooldown and attempt
 * caps from the provider) → review → submit. Submission creates the
 * account with the verification claims from the verified challenges; a
 * check only counts when its challenge actually passed. After submit the
 * member signs in with the password they chose.
 *
 * Demo honesty: while provider.mode === 'demo' nothing is delivered — the
 * codes appear in labelled DemoCodeWells, and the "not connected" badges
 * become demo-provider badges. A live provider removes the wells; this
 * screen's flow does not change.
 *
 * Visual direction: unchanged from Part 1 — the same light dotted upper
 * zone and black rounded panel as login, so the two screens read as one
 * application.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { OtpInput } from '@/components/ui/otp-input';
import { Well } from '@/components/ui/card';
import { PressSurface } from '@/components/ui/press-surface';
import { StatusBadge } from '@/components/ui/status-badge';
import { StepDots } from '@/components/ui/step-dots';
import { RiseIn } from '@/components/ui/rise-in';
import {
  AuthErrorMessage,
  AuthHeader,
  AuthPanel,
  AuthHeading,
  AuthCard,
  AuthPlanCard,
  DemoCodeWell,
} from '@/components/auth/auth-ui';
import { useTokens } from '@/hooks/use-tokens';
import { useCountdown } from '@/hooks/use-countdown';
import { demoPlans } from '@/data/demo';
import { formatCurrency, isEmail, isPhone } from '@/utils/format';
import { checkPassword, useAuth } from '@/services/auth';
import type { AuthChallenge } from '@/services/auth';
import { submitJoinApplication } from '@/services/data';

const STEPS = ['Details', 'Verify', 'Review'] as const;

export default function JoinScreen() {
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const { colors, spacing } = tokens;
  const { provider } = useAuth();

  const [step, setStep] = useState(0);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [planId, setPlanId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  // Verification state (step 1) — real challenges from the provider.
  const [phoneChallenge, setPhoneChallenge] = useState<AuthChallenge | null>(null);
  const [emailChallenge, setEmailChallenge] = useState<AuthChallenge | null>(null);
  const [phoneCode, setPhoneCode] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null);
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const phoneCooldown = useCountdown(0);
  const emailCooldown = useCountdown(0);

  const plan = useMemo(() => demoPlans.find((p) => p.id === planId) ?? null, [planId]);

  const validateDetails = useCallback(() => {
    const next: Record<string, string | undefined> = {};
    if (fullName.trim().split(/\s+/).length < 2) next.fullName = 'Enter your full name, first and last.';
    if (!isPhone(phone)) next.phone = 'Enter a 10-digit Indian mobile number.';
    if (!isEmail(email)) next.email = 'Enter a valid email address. Verification is mandatory.';
    if (checkPassword(password) === 'short') next.password = 'At least 8 characters.';
    else if (checkPassword(password) === 'weak') next.password = 'Use at least 8 characters with a letter and a number.';
    if (!planId) next.planId = 'Choose a membership plan.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [fullName, phone, email, password, planId]);

  const requestPhoneCode = useCallback(async () => {
    setPhoneError(null);
    const outcome = await provider.requestChallenge({ kind: 'phone-otp', phone: phone.trim() });
    if (outcome.status === 'issued') {
      setPhoneChallenge(outcome.challenge);
      setPhoneCode('');
      phoneCooldown.restart(outcome.challenge.resendCooldownSeconds);
    } else if (outcome.status === 'cooldown') {
      setPhoneError(`Wait ${outcome.retryAfterSeconds}s before requesting a new code.`);
    } else if (outcome.status === 'rate_limited') {
      setPhoneError(`Too many requests. Try again in ${outcome.retryAfterSeconds}s.`);
    } else {
      setPhoneError('This number could not be used. Check it and try again.');
    }
  }, [provider, phone, phoneCooldown]);

  const requestEmailCode = useCallback(async () => {
    setEmailError(null);
    const outcome = await provider.requestChallenge({ kind: 'email-code', email: email.trim().toLowerCase() });
    if (outcome.status === 'issued') {
      setEmailChallenge(outcome.challenge);
      setEmailCode('');
      emailCooldown.restart(outcome.challenge.resendCooldownSeconds);
    } else if (outcome.status === 'cooldown') {
      setEmailError(`Wait ${outcome.retryAfterSeconds}s before requesting a new code.`);
    } else if (outcome.status === 'rate_limited') {
      setEmailError(`Too many requests. Try again in ${outcome.retryAfterSeconds}s.`);
    } else {
      setEmailError('This address could not be used. Check it and try again.');
    }
  }, [provider, email, emailCooldown]);

  // Entering the verify step requests the phone code automatically; the
  // email code is requested by its own button so both cooldowns stay
  // independent and honest. Deferred one tick so its state updates never
  // run synchronously inside the effect body.
  useEffect(() => {
    if (step !== 1) return;
    const t = setTimeout(() => void requestPhoneCode(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const verifyPhoneCode = useCallback(async () => {
    if (!phoneChallenge || phoneCode.length < 6 || phoneBusy) return;
    setPhoneBusy(true);
    const outcome = await provider.verifyChallenge(phoneChallenge.challengeId, phoneCode);
    if (outcome.status === 'ok') {
      setVerifiedPhone(phone.trim());
      setPhoneChallenge(null);
    } else if (outcome.status === 'invalid_code') {
      setPhoneError('That code is not correct. Check the demo code and try again.');
    } else if (outcome.status === 'locked') {
      setPhoneError('Too many wrong attempts — request a fresh code.');
      setPhoneChallenge(null);
    } else {
      setPhoneError('The code expired. Request a new one.');
      setPhoneChallenge(null);
    }
    setPhoneBusy(false);
  }, [phoneChallenge, phoneCode, phoneBusy, provider, phone]);

  const verifyEmailCode = useCallback(async () => {
    if (!emailChallenge || emailCode.length < 6 || emailBusy) return;
    setEmailBusy(true);
    const outcome = await provider.verifyChallenge(emailChallenge.challengeId, emailCode);
    if (outcome.status === 'ok') {
      setVerifiedEmail(email.trim().toLowerCase());
      setEmailChallenge(null);
    } else if (outcome.status === 'invalid_code') {
      setEmailError('That code is not correct. Check the demo code and try again.');
    } else if (outcome.status === 'locked') {
      setEmailError('Too many wrong attempts — request a fresh code.');
      setEmailChallenge(null);
    } else {
      setEmailError('The code expired. Request a new one.');
      setEmailChallenge(null);
    }
    setEmailBusy(false);
  }, [emailChallenge, emailCode, emailBusy, provider, email]);

  const goDetails = () => {
    if (!validateDetails()) return;
    setStep(1);
  };

  const submit = useCallback(async () => {
    if (submitting) return;
    setSubmitError(null);
    setSubmitting(true);
    if (provider.mode === 'live') {
      const result = await submitJoinApplication(
        fullName.trim(),
        phone.trim(),
        email.trim().toLowerCase(),
        planId ?? '',
      );
      if (result.ok) {
        router.replace(`/success?mode=signup&role=member&email=${encodeURIComponent(email.trim().toLowerCase())}` as never);
        return;
      }
      setSubmitError(result.error);
      setSubmitting(false);
      return;
    }
    const result = await provider.signUpMember({
      fullName,
      phone: phone.trim(),
      email: email.trim().toLowerCase(),
      password,
      planId: planId ?? '',
      verifiedPhone,
      verifiedEmail,
    });
    if (result.status === 'ok') {
      router.replace(`/success?mode=signup&role=member&email=${encodeURIComponent(email.trim().toLowerCase())}` as never);
      return;
    }
    if (result.status === 'duplicate') {
      setSubmitError(
        result.field === 'email'
          ? 'An account already uses this email. Sign in instead, or use another address.'
          : 'An account already uses this mobile number. Sign in instead.',
      );
    } else {
      setSubmitError('Some details could not be used. Re-check the highlighted fields.');
    }
    setSubmitting(false);
  }, [submitting, provider, fullName, phone, email, password, planId, verifiedPhone, verifiedEmail]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.authTop, paddingTop: insets.top }}>
      <StatusBar style="dark" />
      <Stack.Screen options={{ headerShown: false }} />
      {/* Light dotted zone: back control + step counter flank the logo */}
      <AuthHeader
        topRow={
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to sign in"
              hitSlop={12}
              onPress={() => (step === 0 ? routerBack() : setStep((s) => Math.max(0, s - 1)))}
              style={({ pressed }) => ({
                width: 44,
                height: 44,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.6 : 1,
              })}>
              <Ionicons name="arrow-back" size={22} color={colors.authBg} />
            </Pressable>
            <AppText variant="caption" style={{ color: colors.authTopInk, fontWeight: '600' }}>
              Step {step + 1} of 3
            </AppText>
          </>
        }
      />

      {/* Black panel — all auth content lives here */}
      <AuthPanel>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xl }}
          keyboardShouldPersistTaps="handled">
          <AuthHeading
            muted={step === 0 ? 'Create ' : step === 1 ? 'Check ' : 'Review '}
            emphasis={step === 0 ? 'your account' : step === 1 ? 'your inbox' : 'and submit'}
          />
          <AppText variant="label" style={{ color: colors.authInkSubtle, marginTop: spacing['3xs'] }}>
            {step === 0
              ? 'Start your fitness journey with Pulse Gym.'
              : step === 1
                ? `One-time codes for ${phone || 'your number'} and ${email || 'your email'} — verified against the demo provider.`
                : 'Check everything, then create your account.'}
          </AppText>

          {/* Step indicator — auth tones (white current, dark numeral) */}
          <View style={{ marginTop: spacing.sm, marginBottom: spacing.md }}>
            <StepDots steps={STEPS} current={step} tone="auth" />
          </View>

          {step === 0 && (
            <RiseIn key={`step-${step}`} style={{ gap: spacing.sm }}>
              <TextField
                label="Full name"
                appearance="auth"
                placeholder="As on your ID"
                value={fullName}
                onChangeText={setFullName}
                error={attempted(errors.fullName)}
                accentColor={colors.authAccent}
              />
              <TextField
                label="Mobile number"
                appearance="auth"
                placeholder="10-digit number"
                keyboardType="phone-pad"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChangeText={setPhone}
                error={attempted(errors.phone)}
                helper="We send a one-time code to this number."
                accentColor={colors.authAccent}
              />
              <TextField
                label="Email address"
                appearance="auth"
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChangeText={setEmail}
                error={attempted(errors.email)}
                helper="A verification code is issued for this address. Checks are mandatory."
                accentColor={colors.authAccent}
              />
              <TextField
                label="Password"
                appearance="auth"
                placeholder="At least 8 characters, a letter and a number"
                secure
                autoComplete="new-password"
                value={password}
                onChangeText={setPassword}
                error={attempted(errors.password)}
                accentColor={colors.authAccent}
              />
              <View>
                <AppText variant="label" style={{ color: colors.authInkMuted, marginBottom: spacing.xs }}>
                  Membership plan
                </AppText>
                <View style={{ gap: spacing.xs }}>
                  {demoPlans.map((p) => (
                    <AuthPlanCard
                      key={p.id}
                      name={p.name}
                      duration={p.duration}
                      price={formatCurrency(p.price)}
                      highlights={p.highlights ?? []}
                      selected={planId === p.id}
                      onPress={() => {
                        setPlanId(p.id);
                        setErrors((e) => ({ ...e, planId: undefined }));
                      }}
                    />
                  ))}
                </View>
                {errors.planId && (
                  <AppText variant="caption" style={{ color: colors.danger, marginTop: spacing['3xs'] }}>
                    {errors.planId}
                  </AppText>
                )}
                <Well style={{ marginTop: spacing.xs }}>
                  <AppText variant="caption" tone="muted">
                    If you ever renew at a later listed price, your agreed price is protected: existing subscriptions keep the price they joined at.
                  </AppText>
                </Well>
              </View>
              <View style={{ marginTop: spacing.xs }}>
                <Button label="Continue to verification" icon="arrow-forward" fullWidth variant="primarySoft" onPress={goDetails} />
              </View>
            </RiseIn>
          )}

          {step === 1 && (
            <RiseIn key={`step-${step}`} style={{ gap: spacing.lg }}>
              {/* Phone OTP — requested on entry, verified against the provider */}
              <AuthCard>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <AppText variant="heading" style={{ color: colors.authInk }}>
                    Phone code
                  </AppText>
                  <StatusBadge
                    label={verifiedPhone ? 'Verified' : phoneChallenge ? 'Code issued' : 'Request a code'}
                    tone={verifiedPhone ? 'success' : 'warning'}
                    small
                  />
                </View>
                <AppText variant="label" style={{ color: colors.authInkMuted, marginTop: spacing['3xs'] }}>
                  {phoneChallenge
                    ? `6 digits for ${phone || 'your number'}. ${phoneChallenge.remainingAttempts} attempts left.`
                    : verifiedPhone
                      ? `${phone} is confirmed for this application.`
                      : `6 digits for ${phone || 'your number'}.`}
                </AppText>
                {verifiedPhone ? (
                  <Well style={{ marginTop: spacing.sm }}>
                    <AppText variant="caption" tone="muted">
                      Phone check passed. It stays valid for this submission only — codes are single-use and expire.
                    </AppText>
                  </Well>
                ) : phoneChallenge ? (
                  <View style={{ marginTop: spacing.sm, gap: spacing.xs }}>
                    <OtpInput onChange={setPhoneCode} appearance="auth" />
                    {phoneChallenge.demoCode && (
                      <DemoCodeWell code={phoneChallenge.demoCode} note="Demo provider: no SMS is actually sent." />
                    )}
                    {phoneError && <AuthErrorMessage message={phoneError} />}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Button
                        label={phoneBusy ? 'Checking' : 'Verify code'}
                        disabled={phoneBusy || phoneCode.length < 6}
                        loading={phoneBusy}
                        size="small"
                        variant="primarySoft"
                        onPress={() => void verifyPhoneCode()}
                      />
                      <PressSurface
                        accessibilityRole="button"
                        accessibilityState={{ disabled: phoneCooldown.active }}
                        onPress={() => {
                          if (phoneCooldown.active) return;
                          void requestPhoneCode();
                        }}
                        style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.xxs }}>
                        <AppText variant="label" style={{ color: phoneCooldown.active ? colors.authInkSubtle : colors.authInk }}>
                          {phoneCooldown.active ? `Resend in ${phoneCooldown.remaining}s` : 'Resend code'}
                        </AppText>
                      </PressSurface>
                    </View>
                  </View>
                ) : (
                  <View style={{ marginTop: spacing.sm }}>
                    <Button
                      label="Request phone code"
                      icon="chatbubble-ellipses-outline"
                      size="small"
                      variant="primarySoft"
                      disabled={phoneCooldown.active}
                      onPress={() => void requestPhoneCode()}
                    />
                  </View>
                )}
              </AuthCard>

              {/* Email code — requested on demand (independent cooldown) */}
              <AuthCard>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <AppText variant="heading" style={{ color: colors.authInk }}>
                    Email code
                  </AppText>
                  <StatusBadge
                    label={verifiedEmail ? 'Verified' : emailChallenge ? 'Code issued' : 'Request a code'}
                    tone={verifiedEmail ? 'success' : 'warning'}
                    small
                  />
                </View>
                <AppText variant="label" style={{ color: colors.authInkMuted, marginTop: spacing['3xs'] }}>
                  {emailChallenge
                    ? `6 digits for ${email || 'your email'}. ${emailChallenge.remainingAttempts} attempts left.`
                    : verifiedEmail
                      ? `${email} is confirmed for this application.`
                      : `A code is issued for ${email || 'your email'}.`}
                </AppText>
                {verifiedEmail ? (
                  <Well style={{ marginTop: spacing.sm }}>
                    <AppText variant="caption" tone="muted">
                      Email check passed. On the live backend this arrives as a signed link; the demo issues a code.
                    </AppText>
                  </Well>
                ) : emailChallenge ? (
                  <View style={{ marginTop: spacing.sm, gap: spacing.xs }}>
                    <OtpInput onChange={setEmailCode} appearance="auth" />
                    {emailChallenge.demoCode && (
                      <DemoCodeWell code={emailChallenge.demoCode} note="Demo provider: no email is actually sent." />
                    )}
                    {emailError && <AuthErrorMessage message={emailError} />}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Button
                        label={emailBusy ? 'Checking' : 'Verify code'}
                        disabled={emailBusy || emailCode.length < 6}
                        loading={emailBusy}
                        size="small"
                        variant="primarySoft"
                        onPress={() => void verifyEmailCode()}
                      />
                      <PressSurface
                        accessibilityRole="button"
                        accessibilityState={{ disabled: emailCooldown.active }}
                        onPress={() => {
                          if (emailCooldown.active) return;
                          void requestEmailCode();
                        }}
                        style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.xxs }}>
                        <AppText variant="label" style={{ color: emailCooldown.active ? colors.authInkSubtle : colors.authInk }}>
                          {emailCooldown.active ? `Resend in ${emailCooldown.remaining}s` : 'Resend code'}
                        </AppText>
                      </PressSurface>
                    </View>
                  </View>
                ) : (
                  <View style={{ marginTop: spacing.sm }}>
                    <Button
                      label="Request email code"
                      icon="mail-outline"
                      size="small"
                      variant="primarySoft"
                      disabled={emailCooldown.active}
                      onPress={() => void requestEmailCode()}
                    />
                  </View>
                )}
              </AuthCard>

              <Button
                label="Continue to review"
                icon="arrow-forward"
                fullWidth
                variant="primarySoft"
                onPress={() => setStep(2)}
              />
              <AppText variant="caption" style={{ color: colors.authInkSubtle }} align="center">
                Both checks count only when their code passed. You can continue without them, but the account stays
                unverified and sign-in will ask for these checks.
              </AppText>
            </RiseIn>
          )}

          {step === 2 && (
            <RiseIn key={`step-${step}`} style={{ gap: spacing.md }}>
              <AuthCard>
                <View style={{ gap: spacing.xs }}>
                  <ReviewLine label="Name" value={fullName || 'Not entered'} />
                  <ReviewDivider />
                  <ReviewLine label="Mobile" value={phone || 'Not entered'} />
                  <ReviewDivider />
                  <ReviewLine label="Email" value={email || 'Not entered'} />
                  <ReviewDivider />
                  <ReviewLine label="Plan" value={plan ? `${plan.name} · ${formatCurrency(plan.price)}` : 'Not chosen'} />
                  <ReviewDivider />
                  <ReviewLine label="Phone check" value={verifiedPhone ? 'Verified' : 'Not verified yet'} />
                  <ReviewDivider />
                  <ReviewLine label="Email check" value={verifiedEmail ? 'Verified' : 'Not verified yet'} />
                </View>
              </AuthCard>
              <Well>
                <AppText variant="caption" tone="muted">
                  Submitting creates the account on the demo provider. Membership activates only after full payment is
                  verified at the desk (Parts 3-4 connect payments).
                </AppText>
              </Well>
              {submitError && <AuthErrorMessage message={submitError} />}
              <Button
                label={submitting ? 'Creating account' : 'Create account'}
                icon={submitting ? undefined : 'person-add-outline'}
                fullWidth
                loading={submitting}
                disabled={submitting}
                variant="primarySoft"
                onPress={() => void submit()}
              />
              <AppText variant="caption" style={{ color: colors.authInkSubtle }} align="center">
                Unverified accounts can be created, but sign-in asks for the outstanding checks — nothing skips
                verification.
              </AppText>
            </RiseIn>
          )}

          {/* Example states strip (designed states, labelled as examples) */}
          <View style={{ marginTop: spacing.xl }}>
            <AppText variant="label" style={{ color: colors.authInkMuted }}>
              Application states the owner will see
            </AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs }}>
              <StatusBadge label="Pending checks" tone="warning" />
              <StatusBadge label="Submitted" tone="info" />
              <StatusBadge label="Approved" tone="success" />
              <StatusBadge label="Rejected" tone="danger" />
            </View>
          </View>
        </ScrollView>
      </AuthPanel>
    </View>
  );
}

function ReviewDivider() {
  const tokens = useTokens();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: tokens.colors.authRule }} />;
}

function ReviewLine(props: { label: string; value: string }) {
  const tokens = useTokens();
  const { colors } = tokens;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', minHeight: 32, alignItems: 'center' }}>
      <AppText variant="label" style={{ color: colors.authInkMuted }}>
        {props.label}
      </AppText>
      <AppText variant="label" style={{ textAlign: 'right', flexShrink: 1, fontWeight: '600', color: colors.authInk }}>
        {props.value}
      </AppText>
    </View>
  );
}

function attempted(error?: string) {
  return error ?? null;
}

function routerBack() {
  router.replace('/login');
}

export const joinScreenStyles = StyleSheet.create({});
