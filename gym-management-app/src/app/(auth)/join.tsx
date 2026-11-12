/**
 * Screen 2 — Online joining (member registration).
 *
 * Honesty rules for Part 1: phone OTP and email verification interfaces are
 * fully designed but cannot succeed here (no backend exists). Nothing is
 * "verified" locally and no application is submitted — the submit step says
 * plainly that it is not connected yet (Parts 2-3 deliver real delivery and
 * review). Resend cooldown and attempt caps are shown; enforcement arrives
 * with the backend.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/text';
import { Button, IconButton } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { OtpInput } from '@/components/ui/otp-input';
import { Card, Divider, Well } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { PressSurface } from '@/components/ui/press-surface';
import { RiseIn } from '@/components/ui/rise-in';
import { Ionicons } from '@expo/vector-icons';
import { useTokens } from '@/hooks/use-tokens';
import { hapticSelect } from '@/utils/haptics';
import { demoPlans } from '@/data/demo';
import { formatCurrency, isEmail, isPhone } from '@/utils/format';

const STEPS = ['Details', 'Verify', 'Review'] as const;

export default function JoinScreen() {
  const tokens = useTokens();
  const { colors, spacing, radius } = tokens;

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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm }}>
          <IconButton name="arrow-back" label="Back to sign in" tone="ink" onPress={() => (step === 0 ? routerBack() : setStep((s) => Math.max(0, s - 1)))} />
          <StatusBadge label={`Step ${step + 1} of 3`} tone="neutral" small />
        </View>

        <AppText variant="display" style={{ marginTop: spacing.xs }}>
          {step === 0 ? 'Join the gym' : step === 1 ? 'Verify it is you' : 'Review and submit'}
        </AppText>
        <AppText variant="label" tone="muted" style={{ marginTop: 2 }}>
          {step === 0
            ? 'A few details and the plan you want.'
            : step === 1
              ? 'Both phone and email checks are mandatory before an application can be reviewed.'
              : 'Check everything, then submit for the owner to review.'}
        </AppText>

        {/* Step indicator */}
        <View style={{ flexDirection: 'row', gap: 6, marginTop: spacing.md }}>
          {STEPS.map((label, i) => (
            <View key={label} style={{ flex: 1, gap: 4 }}>
              <View
                style={{
                  height: 3,
                  backgroundColor: i <= step ? colors.accent : colors.rule,
                }}
              />
              <AppText variant="caption" tone={i <= step ? 'accent' : 'subtle'} style={{ fontWeight: i === step ? '600' : '400' }}>
                {label}
              </AppText>
            </View>
          ))}
        </View>

        {step === 0 && (
          <RiseIn style={{ marginTop: spacing.lg, gap: spacing.sm }}>
            <TextField
              label="Full name"
              placeholder="As on your ID"
              value={fullName}
              onChangeText={setFullName}
              error={attempted(errors.fullName)}
            />
            <TextField
              label="Mobile number"
              placeholder="10-digit number"
              keyboardType="phone-pad"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChangeText={setPhone}
              error={attempted(errors.phone)}
              helper="We send a one-time code to this number."
            />
            <TextField
              label="Email address"
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
              error={attempted(errors.email)}
              helper="A verification link is sent here. Checks are mandatory."
            />
            <View>
              <AppText variant="label" tone="muted" style={{ marginBottom: spacing.xs }}>
                Membership plan
              </AppText>
              <View style={{ gap: spacing.xs }}>
                {demoPlans.map((p) => {
                  const selected = planId === p.id;
                  return (
                    <PressSurface
                      key={p.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: selected ? selected : undefined }}
                      onPress={() => {
                        hapticSelect();
                        setPlanId(p.id);
                        setErrors((e) => ({ ...e, planId: undefined }));
                      }}
                      scaleOnPress={false}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        minHeight: 56,
                        paddingHorizontal: spacing.md,
                        paddingVertical: spacing.sm,
                        borderRadius: radius.sm,
                        borderWidth: 1,
                        borderColor: selected ? colors.accent : colors.rule,
                        backgroundColor: selected ? colors.surfaceAlt : colors.surface,
                      }}>
                      <View>
                        <AppText variant="bodyStrong" style={{ color: selected ? colors.ink : colors.inkMuted }}>
                          {p.name}
                        </AppText>
                        <AppText variant="caption" tone={selected ? 'accent' : 'subtle'}>
                          {p.price ? `${formatCurrency(p.price)} at today's listed price` : ''}
                        </AppText>
                      </View>
                      <Ionicons
                        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                        size={20}
                        color={selected ? colors.accent : colors.inkSubtle}
                      />
                    </PressSurface>
                  );
                })}
              </View>
              {errors.planId && (
                <AppText variant="caption" style={{ color: colors.danger }}>
                  {errors.planId}
                </AppText>
              )}
              <Well style={{ marginTop: spacing['3xs'] }}>
                <AppText variant="caption" tone="muted">
                  If you ever renew at a later listed price, your agreed price is protected: existing subscriptions keep the price they joined at.
                </AppText>
              </Well>
            </View>
            <View style={{ marginTop: spacing.xs }}>
              <Button label="Continue to verification" icon="arrow-forward" fullWidth onPress={goDetails} />
            </View>
          </RiseIn>
        )}

        {step === 1 && (
          <RiseIn style={{ marginTop: spacing.lg, gap: spacing.lg }}>
            {/* Phone OTP */}
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <AppText variant="heading">Phone code</AppText>
                <StatusBadge label="Not connected yet" tone="warning" small />
              </View>
              <AppText variant="label" tone="muted" style={{ marginTop: 2 }}>
                6 digits sent to {phone || 'your number'}.
              </AppText>
              <View style={{ marginTop: spacing.sm }}>
                <OtpInput onChange={setOtp} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xs }}>
                <AppText variant="caption" tone="subtle">
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
                  <AppText variant="label" tone={resendIn > 0 ? 'subtle' : 'accent'}>
                    {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
                  </AppText>
                </PressSurface>
              </View>
              <AppText variant="caption" tone="muted" style={{ marginTop: spacing.sm }}>
                In this preview no SMS is sent and no code can succeed. Verification completes on the server in Part 2.
              </AppText>
            </Card>

            {/* Email verification */}
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <AppText variant="heading">Email link</AppText>
                <StatusBadge label="Not connected yet" tone="warning" small />
              </View>
              <AppText variant="label" tone="muted" style={{ marginTop: 2 }}>
                A verification link would go to {email || 'your email'}.
              </AppText>
              <Well style={{ marginTop: spacing.sm }}>
                <AppText variant="caption" tone="muted">
                  The link opens this app and confirms ownership of the address. It expires, it is single-use, and its check is cryptographically signed server-side.
                </AppText>
              </Well>
            </Card>

            <Button label="Continue to review" icon="arrow-forward" fullWidth onPress={() => setStep(2)} />
            <AppText variant="caption" tone="subtle" align="center">
              Both checks must pass before the owner reviews an application. Nothing is verified in this preview.
            </AppText>
          </RiseIn>
        )}

        {step === 2 && (
          <RiseIn style={{ marginTop: spacing.lg, gap: spacing.md }}>
            <Card>
              <View style={{ gap: spacing.xs }}>
                <ReviewLine label="Name" value={fullName || 'Not entered'} />
                <Divider />
                <ReviewLine label="Mobile" value={phone || 'Not entered'} />
                <Divider />
                <ReviewLine label="Email" value={email || 'Not entered'} />
                <Divider />
                <ReviewLine label="Plan" value={plan ? `${plan.name} · ${formatCurrency(plan.price)}` : 'Not chosen'} />
                <Divider />
                <ReviewLine label="Phone check" value="Not verified (no server)" />
                <Divider />
                <ReviewLine label="Email check" value="Not verified (no server)" />
              </View>
            </Card>
            <Well>
              <AppText variant="caption" tone="muted">
                Submitting starts nothing yet: there is no backend in this preview. Parts 2-3 connect applications, verification and the owner&apos;s review. Membership activates only after full payment is verified.
              </AppText>
            </Well>
            <Button label="Submit application" icon="paper-plane-outline" fullWidth onPress={() => undefined} disabled />
            <AppText variant="caption" tone="subtle" align="center" style={{ marginBottom: spacing.lg }}>
              Submit is disabled on purpose. An application that was never delivered must never read as sent.
            </AppText>
          </RiseIn>
        )}

        {/* Example states strip (designed states, labelled as examples) */}
        <View style={{ marginTop: spacing.xl }}>
          <AppText variant="label" tone="muted">
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
    </SafeAreaView>
  );
}

function ReviewLine(props: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', minHeight: 32, alignItems: 'center' }}>
      <AppText variant="label" tone="muted">
        {props.label}
      </AppText>
      <AppText variant="label" style={{ textAlign: 'right', flexShrink: 1, fontWeight: '600' }}>
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
