/**
 * Screen 2 — Online joining (member registration).
 *
 * Honesty rules for Part 1: phone OTP and email verification interfaces are
 * fully designed but cannot succeed here (no backend exists). Nothing is
 * "verified" locally and no application is submitted — the submit step says
 * plainly that it is not connected yet (Parts 2-3 deliver real delivery and
 * review). Resend cooldown and attempt caps are shown; enforcement arrives
 * with the backend.
 *
 * Visual direction: pixel-referenced to the supplied Travel-App screenshot —
 * the same light dotted upper zone and black rounded panel as the redesigned
 * login, so the two screens read as one application. Step headings adapt the
 * reference's "Check your inbox" treatment. Plan benefits shown here are
 * demo-labelled demo content.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable } from 'react-native';
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
import { AuthHeader, AuthPanel, AuthHeading, AuthPlanCard } from '@/components/auth/auth-ui';
import { useTokens } from '@/hooks/use-tokens';
import { demoPlans } from '@/data/demo';
import { formatCurrency, isEmail, isPhone } from '@/utils/format';

const STEPS = ['Details', 'Verify', 'Review'] as const;

export default function JoinScreen() {
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const { colors, spacing } = tokens;

  const [step, setStep] = useState(0);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [planId, setPlanId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [, setOtp] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  const plan = useMemo(() => demoPlans.find((p) => p.id === planId) ?? null, [planId]);

  const validateDetails = useCallback(() => {
    const next: Record<string, string | undefined> = {};
    if (fullName.trim().split(/\s+/).length < 2) next.fullName = 'Enter your full name, first and last.';
    if (!isPhone(phone)) next.phone = 'Enter a 10-digit Indian mobile number.';
    if (!isEmail(email)) next.email = 'Enter a valid email address. Verification is mandatory.';
    if (!planId) next.planId = 'Choose a membership plan.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [fullName, phone, email, planId]);

  const goDetails = () => {
    if (!validateDetails()) return;
    setStep(1);
  };

  const maxAttempts = 5;

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
                ? `6-digit code entry for ${phone || 'your number'} — nothing is sent in this preview.`
                : 'Check everything, then submit for the owner to review.'}
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
                helper="A verification link is sent here. Checks are mandatory."
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
              {/* Phone OTP */}
              <CardShell>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <AppText variant="heading" style={{ color: colors.authInk }}>
                    Phone code
                  </AppText>
                  <StatusBadge label="Not connected yet" tone="warning" small />
                </View>
                <AppText variant="label" style={{ color: colors.authInkMuted, marginTop: spacing['3xs'] }}>
                  6 digits for {phone || 'your number'}.
                </AppText>
                <View style={{ marginTop: spacing.sm }}>
                  <OtpInput onChange={setOtp} appearance="auth" />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xs }}>
                  <AppText variant="caption" style={{ color: colors.authInkSubtle }}>
                    Attempts used: {attempts} of {maxAttempts}, then the code resets for security.
                  </AppText>
                  <PressSurface
                    accessibilityRole="button"
                    accessibilityState={{ disabled: resendIn > 0 }}
                    onPress={() => {
                      if (resendIn > 0) return;
                      setResendIn(30);
                      setAttempts((a) => Math.min(maxAttempts, a + 1));
                    }}
                    style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.xxs }}>
                    <AppText variant="label" style={{ color: resendIn > 0 ? colors.authInkSubtle : colors.authInk }}>
                      {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
                    </AppText>
                  </PressSurface>
                </View>
                <AppText variant="caption" style={{ color: colors.authInkMuted, marginTop: spacing.sm }}>
                  In this preview no SMS is sent and no code can succeed. Verification completes on the server in Part 2.
                </AppText>
              </CardShell>

              {/* Email verification */}
              <CardShell>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <AppText variant="heading" style={{ color: colors.authInk }}>
                    Email link
                  </AppText>
                  <StatusBadge label="Not connected yet" tone="warning" small />
                </View>
                <AppText variant="label" style={{ color: colors.authInkMuted, marginTop: spacing['3xs'] }}>
                  A verification link would go to {email || 'your email'}.
                </AppText>
                <Well style={{ marginTop: spacing.sm }}>
                  <AppText variant="caption" tone="muted">
                    The link opens this app and confirms ownership of the address. It expires, it is single-use, and its check is cryptographically signed server-side.
                  </AppText>
                </Well>
              </CardShell>

              <Button label="Continue to review" icon="arrow-forward" fullWidth variant="primarySoft" onPress={() => setStep(2)} />
              <AppText variant="caption" style={{ color: colors.authInkSubtle }} align="center">
                Both checks must pass before the owner reviews an application. Nothing is verified in this preview.
              </AppText>
            </RiseIn>
          )}

          {step === 2 && (
            <RiseIn key={`step-${step}`} style={{ gap: spacing.md }}>
              <CardShell>
                <View style={{ gap: spacing.xs }}>
                  <ReviewLine label="Name" value={fullName || 'Not entered'} />
                  <ReviewDivider />
                  <ReviewLine label="Mobile" value={phone || 'Not entered'} />
                  <ReviewDivider />
                  <ReviewLine label="Email" value={email || 'Not entered'} />
                  <ReviewDivider />
                  <ReviewLine label="Plan" value={plan ? `${plan.name} · ${formatCurrency(plan.price)}` : 'Not chosen'} />
                  <ReviewDivider />
                  <ReviewLine label="Phone check" value="Not verified (no server)" />
                  <ReviewDivider />
                  <ReviewLine label="Email check" value="Not verified (no server)" />
                </View>
              </CardShell>
              <Well>
                <AppText variant="caption" tone="muted">
                  Submitting starts nothing yet: there is no backend in this preview. Parts 2-3 connect applications, verification and the owner&apos;s review. Membership activates only after full payment is verified.
                </AppText>
              </Well>
              <Button label="Submit application" icon="paper-plane-outline" fullWidth variant="primarySoft" onPress={() => undefined} disabled />
              <AppText variant="caption" style={{ color: colors.authInkSubtle }} align="center">
                Submit is disabled on purpose. An application that was never delivered must never read as sent.
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

/** Auth-scope card shell: charcoal surface with a hairline border. */
function CardShell({ children }: { children: React.ReactNode }) {
  const tokens = useTokens();
  const { colors, spacing, radius } = tokens;
  return (
    <View
      style={{
        backgroundColor: colors.authSurface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.authRule,
        padding: spacing.md,
      }}>
      {children}
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
