/**
 * Collect Payment — the desk's six-step payment workflow (Stage 6).
 *
 * One guided flow: 1 select member → 2 select plan → 3 apply discount →
 * 4 choose UPI or cash → 5 review → 6 record, with a step progress bar,
 * per-step validation gates and an in-flow Back that keeps every entered
 * value (all state lives in this one component, so stepping back or forth
 * never erases the form).
 *
 * Pricing rules (unchanged from the approved model): a renewal — the
 * member's own plan — uses the member's locked subscription price and is
 * never silently replaced by the current plan price; a new membership (a
 * different plan) uses the currently configured plan price. The discount
 * is the authorised desk discount (0–50%, clamped and validated exactly as
 * Fees always validated it); the final amount updates immediately and can
 * never go negative because the percentage is capped below 100.
 *
 * UPI shows the gym's session-configured payment QR (Stage 4 store) — the
 * generated code carries the member's payable amount; a configured image
 * is shown as-is with its no-decoding disclosure. Entering a UTR is only
 * recording a reference: every recorded entry (UPI and cash alike) is
 * written as `awaitingVerification` — nothing in this demo verifies a
 * payment, and there is no fake gateway or fake success.
 *
 * Recording is guarded against double taps and duplicate UTRs. Demo mode
 * writes one record into the shared session store (the same source
 * Transaction History, Home and Payment QR read) and labels it
 * session-only. Live mode sends the authorised `payments` INSERT: the
 * server's BEFORE INSERT trigger sets the prices, state, entry type and
 * attribution, and the screen displays the returned row — a refusal is
 * shown verbatim and never replaced by a success. Historical records are
 * never modified; corrections are reversal records, not edits.
 */
import { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';

import { AppText } from '@/components/ui/text';
import { Button, IconButton } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { SearchBar } from '@/components/ui/search-bar';
import { PressSurface } from '@/components/ui/press-surface';
import { AnimatedIcon } from '@/components/ui/animated-icon';
import { RiseIn } from '@/components/ui/rise-in';
import { CountUp, SuccessPop } from '@/components/ui/motion';
import { QrDisplay } from '@/components/ui/qr-display';
import { DataRefreshControl, ErrorState, SkeletonRow } from '@/components/ui/feedback';
import { SignOut } from '@/components/workspace-meta';
import {
  WorkspaceScreen,
  WorkspaceBottomNavigation,
  WorkspaceSection,
  WorkspaceCard,
  WorkspaceRowDivider,
  WorkspaceWell,
} from '@/components/workspace/workspace-ui';
import {
  OwnerListGroup,
  OwnerListRow,
  OwnerMemberAvatar,
  OwnerStatusText,
  OwnerEmptyState,
} from '@/components/owner/owner-ui';
import { useTokens } from '@/hooks/use-tokens';
import { demoPlans, demoGymName } from '@/data/demo';
import { useSessionMembers, useSessionPayments, addSessionPayment, useSessionQrConfig, useSessionPlanPrices, effectivePlanPrice } from '@/data/session';
import { recordPayment, toPayment, useGymSettings, useMembers, usePayments, usePlans } from '@/services/data';
import { computePayable, paymentStatusInfo } from '@/utils/payment';
import { buildUpiPayload } from '@/utils/upi';
import { displayMembershipStatus } from '@/utils/membership';
import { formatCurrency, formatDate, pluralise } from '@/utils/format';
import type { Member, MembershipPlan, MembershipStatus, PaymentMethod, PaymentRecord, PlanDuration } from '@/types/domain';

const navItems = [
  { key: 'home', label: 'Home', icon: 'home-outline', href: '/(reception)/home' },
  { key: 'members', label: 'Members', icon: 'people-outline', href: '/(reception)/members' },
  { key: 'more', label: 'More', icon: 'apps-outline', href: '/(reception)/more' },
] as const;

const STEP_LABELS = ['Member', 'Plan', 'Discount', 'Method', 'Review', 'Done'] as const;

const durationLabel: Record<PlanDuration, string> = {
  monthly: '1 month',
  quarterly: '3 months',
  halfYearly: '6 months',
  yearly: '12 months',
};

const statusTone: Record<MembershipStatus, 'up' | 'down' | 'neutral' | 'warning' | 'action'> = {
  active: 'up',
  expiring: 'warning',
  expired: 'down',
  frozen: 'neutral',
  pendingPayment: 'action',
};

const statusLabel: Record<MembershipStatus, string> = {
  active: 'Active',
  expiring: 'Expiring',
  expired: 'Expired',
  frozen: 'Frozen',
  pendingPayment: 'Payment pending',
};

/** The member's business display number (GB-XXXX), the app-wide convention. */
const memberDisplayId = (memberId: string) => memberId.replace('m-', 'GB-').toUpperCase();

export default function CollectPaymentScreen() {
  const tokens = useTokens();
  const { colors, spacing } = tokens;

  // Demo mode: the session stores the desk already uses. Live mode: the
  // authorised backend rows through the shared read hooks. The same screen
  // structure and pricing rules apply to both.
  const sessionQrConfig = useSessionQrConfig();
  const sessionMembers = useSessionMembers();
  const sessionPayments = useSessionPayments();
  const membersResource = useMembers();
  const plansResource = usePlans();
  const paymentsResource = usePayments();
  const settingsResource = useGymSettings();
  const live = membersResource.isLive;

  const members = live ? membersResource.data : sessionMembers;
  const plans = live ? plansResource.data : demoPlans;
  const records = live ? paymentsResource.data : sessionPayments;

  // The gym's UPI ID is session-configured in demo mode and read from the
  // server settings row in live mode. No image is decoded either way.
  const upiId = live ? settingsResource.data?.upiId ?? null : sessionQrConfig.upiId;
  const customImageUri = live ? null : sessionQrConfig.customImageUri;

  const refreshAll = () => {
    membersResource.refresh();
    plansResource.refresh();
    paymentsResource.refresh();
    settingsResource.refresh();
  };
  const liveLoading =
    membersResource.status === 'loading' ||
    plansResource.status === 'loading' ||
    paymentsResource.status === 'loading';
  const loadError =
    membersResource.status === 'error' ||
    plansResource.status === 'error' ||
    paymentsResource.status === 'error';

  // Session plan price overrides (Membership Plans edits) — new
  // memberships price from the effective plan price; locked renewals never
  // read this store.
  const planPrices = useSessionPlanPrices();

  // Member Profile hands over ?id=<id> — preselected when it resolves
  // to a real member; an invalid id falls back to step 1 with a note.
  const params = useLocalSearchParams<{ id?: string }>();

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [memberId, setMemberId] = useState<string | null>(() => {
    const id = typeof params.id === 'string' ? params.id : null;
    return id !== null && members.some((m) => m.id === id) ? id : null;
  });
  const [query, setQuery] = useState('');
  // A valid ?id= handoff preselects that member's own plan (renewal).
  const [planId, setPlanId] = useState<string | null>(() => {
    const id = typeof params.id === 'string' ? params.id : null;
    const m = id !== null ? (members.find((x) => x.id === id) ?? null) : null;
    return m ? m.planId : null;
  });
  const [discountPct, setDiscountPct] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('upi');
  const [utr, setUtr] = useState('');
  const [utrError, setUtrError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Double-submission guard: stays latched after a successful record and is
  // only released by "Collect another payment", so a queued second tap can
  // never create a second record.
  const savingRef = useRef(false);
  const [recorded, setRecorded] = useState<PaymentRecord | null>(null);
  // Server refusal shown verbatim — never replaced by a friendlier guess.
  const [recordError, setRecordError] = useState<string | null>(null);

  const member: Member | null = memberId ? (members.find((m) => m.id === memberId) ?? null) : null;
  const paramInvalid = typeof params.id === 'string' && member === null;

  // Step 1 search: name, phone and member ID (mirrors the register/search
  // conventions; digits match the masked demo phone numbers honestly).
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    if (!q) return [];
    return members.filter((m) => {
      const phone = m.phone.replace(/\s/g, '').toLowerCase();
      return (
        m.name.toLowerCase().includes(q) ||
        phone.includes(q.replace(/\s/g, '')) ||
        (digits.length > 0 && (m.id.includes(digits) || m.phone.replace(/\D/g, '').includes(digits)))
      );
    });
  }, [members, query]);

  const plan: MembershipPlan | null = planId ? (plans.find((p) => p.id === planId) ?? null) : null;

  // Live plan prices come from the server catalogue; the session price
  // overrides belong to demo mode only.
  const effectivePriceOf = (p: MembershipPlan) =>
    live ? p.price : effectivePlanPrice(p.id, p.price, planPrices);

  // Pricing: the member's own plan is a RENEWAL at their locked price —
  // never silently replaced by the current plan price. Any other plan is a
  // NEW membership at the currently configured (session-effective) price.
  const isRenewal = member !== null && plan !== null && plan.id === member.planId && member.priceLocked > 0;
  const basePrice = plan
    ? isRenewal && member
      ? member.priceLocked
      : effectivePriceOf(plan)
    : 0;

  // Authorised desk discount: 0–50, clamped; an entry that is not exactly
  // representable (negative, >50 or non-numeric) is invalid and blocks the
  // flow — the same validation Fees has always applied.
  const discount = Math.max(0, Math.min(50, Number(discountPct) || 0));
  const invalidDiscount = discountPct !== '' && (Number.isNaN(Number(discountPct)) || discount !== Number(discountPct));
  const payable = computePayable(basePrice, discount);
  const discountAmount = basePrice - payable;

  const utrValue = utr.trim();
  const utrValid = utrValue.length >= 6;
  const utrDuplicate = records.some((p) => (p.utr ?? '').toLowerCase() === utrValue.toLowerCase());

  // Per-step gates: Continue is disabled until the step's inputs validate.
  const stepReady: Record<number, boolean> = {
    1: member !== null,
    2: plan !== null,
    3: !invalidDiscount,
    4: method === 'cash' || (utrValid && !utrDuplicate),
    5: true,
  };

  const selectMember = (id: string) => {
    setMemberId(id);
    setQuery('');
    // A new member resets the plan choice to their own plan (renewal) and
    // clears everything downstream — no stale amounts can survive.
    const m = members.find((x) => x.id === id);
    setPlanId(m ? m.planId : null);
    setDiscountPct('');
    setMethod('upi');
    setUtr('');
    setUtrError(null);
  };

  const clearMember = () => {
    setMemberId(null);
    setPlanId(null);
    setDiscountPct('');
    setMethod('upi');
    setUtr('');
    setUtrError(null);
  };

  const goBack = () => {
    if (step > 1 && step < 6) setStep((step - 1) as 1 | 2 | 3 | 4 | 5);
  };

  const goNext = () => {
    if (!stepReady[step]) return;
    setUtrError(null);
    setStep((step + 1) as 2 | 3 | 4 | 5 | 6);
  };

  // Step 6 — validate the whole transaction again, then write exactly one
  // record. The latched ref makes repeated taps impossible to double-book;
  // it is released only on a server refusal or "Collect another payment".
  const confirmRecord = async () => {
    if (savingRef.current) return;
    if (member === null || plan === null || invalidDiscount || payable <= 0) return;
    if (method === 'upi' && (!utrValid || utrDuplicate)) {
      setUtrError(
        utrDuplicate
          ? 'This reference is already on record. Check the Transaction History screen.'
          : 'Enter the UTR or transaction reference from the UPI app (6+ characters).',
      );
      setStep(4);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setRecordError(null);

    if (live) {
      // Authorised INSERT. The server owns prices, state, entry type and
      // attribution; the returned row is what this screen must display.
      const outcome = await recordPayment({
        memberId: member.id,
        planId: plan.id,
        method,
        discountPct: discount,
        utr: method === 'upi' ? utrValue : undefined,
        note: 'Recorded from Collect Payment (desk)',
      });
      if (!outcome.ok) {
        savingRef.current = false;
        setSaving(false);
        setRecordError(outcome.error);
        return;
      }
      setRecorded(toPayment(outcome.data, member.name));
      setSaving(false);
      setStep(6);
      paymentsResource.refresh();
      return;
    }

    // Real recorded time; the id derives from the member and the reference
    // (UPI) or the recorded time (cash) — no invented identifiers.
    const createdAt = new Date().toISOString();
    const entry: PaymentRecord = {
      id: method === 'upi' ? `pay-local-${member.id}-${utrValue}` : `pay-local-${member.id}-cash-${createdAt}`,
      memberId: member.id,
      memberName: member.name,
      planId: plan.id,
      originalPrice: basePrice,
      discountPct: discount,
      payable,
      method,
      utr: method === 'upi' ? utrValue : undefined,
      state: 'awaitingVerification',
      receiptIssued: false,
      createdAt,
      note: 'Recorded from Collect Payment (desk)',
    };
    addSessionPayment(entry);
    setRecorded(entry);
    setSaving(false);
    setStep(6);
    // savingRef stays latched: only "Collect another payment" releases it.
  };

  const resetForNewPayment = () => {
    savingRef.current = false;
    setRecorded(null);
    setRecordError(null);
    setStep(1);
    setPlanId(member ? member.planId : null);
    setDiscountPct('');
    setMethod('upi');
    setUtr('');
    setUtrError(null);
  };

  const pending = records.filter((p) => p.state === 'awaitingVerification');
  const upiPayload = method === 'upi' && upiId ? buildUpiPayload(upiId, payable) : null;

  const detailRow = (label: string, value: string, strong = false) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', minHeight: 32, alignItems: 'center' }}>
      <AppText variant="label" style={{ color: colors.ownerInkMuted }}>
        {label}
      </AppText>
      <AppText
        variant={strong ? 'bodyStrong' : 'label'}
        numberOfLines={1}
        style={{ color: strong ? colors.ownerAccentDeep : colors.ownerInk, fontWeight: strong ? '700' : '500' }}>
        {value}
      </AppText>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <WorkspaceScreen
        title="Collect Payment"
        eyebrow="Payments"
        subtitle="Member, plan, discount, method, review, record"
        demo={!live}
        actions={<SignOut />}
        refreshControl={<DataRefreshControl refreshing={live && liveLoading} onRefresh={refreshAll} />}>
        {live && loadError ? (
          <RiseIn>
            <ErrorState
              title="Payment data could not load"
              message={
                membersResource.error ??
                plansResource.error ??
                paymentsResource.error ??
                'The payment sources are unavailable right now.'
              }
              onRetry={refreshAll}
            />
          </RiseIn>
        ) : null}
        {live && liveLoading && members.length === 0 && !recorded ? (
          <RiseIn style={{ marginTop: spacing.sm }}>
            <SkeletonRow count={3} />
          </RiseIn>
        ) : null}
        {/* Progress indicator — always visible, never animated mid-step */}
        <StepProgress current={recorded ? 6 : step} />

        {recorded ? (
          /* Step 6 — confirmation. Session-only, never a "saved" claim. */
          <RiseIn>
            <WorkspaceSection title="Payment recorded">
              <WorkspaceCard>
                <View style={{ alignItems: 'center', gap: spacing.xs }}>
                  <SuccessPop size={54} color={colors.ownerSuccessDeep} />
                  <AppText variant="bodyStrong" style={{ color: colors.ownerInk }}>
                    {recorded.memberName} · {formatCurrency(recorded.payable)}
                  </AppText>
                  <OwnerStatusText label="Awaiting verification" tone="warning" />
                </View>
                <WorkspaceRowDivider />
                <View style={{ marginTop: spacing.xs, gap: spacing['3xs'] }}>
                  {detailRow('Member', `${recorded.memberName} · ${memberDisplayId(recorded.memberId)}`)}
                  {detailRow('Plan', plans.find((p) => p.id === recorded.planId)?.name ?? recorded.planId)}
                  {detailRow('Original price', formatCurrency(recorded.originalPrice))}
                  {detailRow('Discount', recorded.discountPct > 0 ? `${recorded.discountPct}% off` : 'None')}
                  {detailRow('Final amount', formatCurrency(recorded.payable), true)}
                  {detailRow('Method', recorded.method === 'upi' ? 'UPI' : 'Cash')}
                  {detailRow('Reference', recorded.utr ?? 'Not applicable — cash')}
                  {detailRow('Recorded at', formatDate(recorded.createdAt))}
                </View>
              </WorkspaceCard>
              <AppText variant="caption" style={{ color: colors.ownerInkMuted, marginTop: spacing.sm }}>
                {live
                  ? 'Recorded on the server as awaiting verification. Nothing is verified here: authorised staff check it against the UPI statement or the cash count, and only then does membership extend. The transaction row is never edited later — corrections are reversal records.'
                  : 'Demo record for this session only — it resets when the app restarts and nothing was saved to a server or database. The entry is awaiting verification: the owner checks it against the UPI statement or the cash count before membership extends and a receipt issues. A recorded reference is not proof of payment.'}
              </AppText>
              <View style={{ gap: spacing.xs, marginTop: spacing.sm }}>
                <Button
                  label="Open Transaction History"
                  icon="time-outline"
                  fullWidth
                  onPress={() => router.push('/(reception)/transaction-history' as never)}
                />
                {member && (
                  <Button
                    label="Open Member Profile"
                    variant="secondary"
                    icon="person-outline"
                    fullWidth
                    onPress={() => router.push(`/(reception)/member-profile?id=${member.id}` as never)}
                  />
                )}
                <Button label="Collect another payment" variant="secondary" fullWidth onPress={resetForNewPayment} />
              </View>
            </WorkspaceSection>
          </RiseIn>
        ) : (
          <View key={step}>
            {/* Step 1 — Select member */}
            {step === 1 && (
            <RiseIn>
              <WorkspaceSection title="1 · Select member">
                <SearchBar
                  label="Search by member name, phone or member ID"
                  value={query}
                  onChange={setQuery}
                  placeholder="Name, phone or member number"
                />
                {paramInvalid && (
                  <AppText variant="caption" style={{ color: colors.ownerWarningDeep, marginTop: spacing.xs }}>
                    The linked member could not be found — search below to select one.
                  </AppText>
                )}
                {member && (
                  <WorkspaceCard style={{ marginTop: spacing.sm }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <OwnerMemberAvatar name={member.name} />
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'center' }}>
                          <AppText variant="bodyStrong" style={{ color: colors.ownerInk }}>
                            {member.name}
                          </AppText>
                          <OwnerStatusText label={statusLabel[displayMembershipStatus(member)]} tone={statusTone[displayMembershipStatus(member)]} />
                        </View>
                        <AppText variant="caption" numberOfLines={1} style={{ color: colors.ownerInkMuted }}>
                          {memberDisplayId(member.id)} · {member.phone}
                        </AppText>
                        <AppText variant="caption" numberOfLines={1} style={{ color: colors.ownerInkMuted }}>
                          {plans.find((p) => p.id === member.planId)?.name ?? member.planId}
                          {member.membershipEnd ? ` · ends ${formatDate(member.membershipEnd)}` : ' · not active yet'}
                        </AppText>
                      </View>
                      <IconButton name="close-circle" label="Clear selected member" onPress={clearMember} />
                    </View>
                  </WorkspaceCard>
                )}
                {results.length > 0 && !member && (
                  <View style={{ marginTop: spacing.sm }}>
                    <OwnerListGroup label="Search results">
                      {results.slice(0, 5).map((m, i) => (
                        <View key={m.id}>
                          {i > 0 && <WorkspaceRowDivider />}
                          <OwnerListRow
                            leading={<OwnerMemberAvatar name={m.name} />}
                            title={m.name}
                            detail={`${memberDisplayId(m.id)} · ${m.phone}`}
                            status={<OwnerStatusText label={statusLabel[displayMembershipStatus(m)]} tone={statusTone[displayMembershipStatus(m)]} />}
                            chevron
                            onPress={() => selectMember(m.id)}
                          />
                        </View>
                      ))}
                    </OwnerListGroup>
                  </View>
                )}
                {!member && query.trim().length > 0 && results.length === 0 && (
                  <OwnerEmptyState
                    icon="search-outline"
                    title="No member matches"
                    hint="Try a shorter name, the phone digits or the member number."
                    actionLabel="Clear search"
                    onAction={() => setQuery('')}
                  />
                )}
              </WorkspaceSection>
            </RiseIn>
            )}

            {/* Step 2 — Select plan */}
            {member && step === 2 && (
              <RiseIn index={1} style={{ marginTop: spacing.sm }}>
                <WorkspaceSection title="2 · Select plan">
                  {plans.map((p) => {
                    const renewal = p.id === member.planId && member.priceLocked > 0;
                    const effectivePrice = effectivePriceOf(p);
                    const price = renewal ? member.priceLocked : effectivePrice;
                    const selected = planId === p.id;
                    return (
                      <PressSurface
                        key={p.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected: selected ? selected : undefined }}
                        accessibilityLabel={`${p.name}, ${durationLabel[p.duration]}, ${renewal ? `renewal at the locked price ${formatCurrency(price)}` : `new membership at ${formatCurrency(price)}`}`}
                        onPress={() => setPlanId(p.id)}
                        scaleOnPress={false}
                        style={{
                          marginTop: selected ? 0 : spacing.xs,
                          minHeight: 68,
                          borderRadius: tokens.radius.md,
                          borderWidth: selected ? 2 : 1,
                          borderColor: selected ? colors.ownerAccentDeep : colors.ownerRule,
                          backgroundColor: selected ? colors.ownerAccentTint : colors.ownerPanel,
                          padding: spacing.sm,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: spacing.sm,
                        }}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                            <AppText variant="bodyStrong" numberOfLines={1} style={{ color: colors.ownerInk }}>
                              {p.name}
                            </AppText>
                            <OwnerStatusText
                              label={renewal ? 'Renewal · locked price' : 'New membership'}
                              tone={renewal ? 'up' : 'neutral'}
                            />
                          </View>
                          <AppText variant="caption" numberOfLines={1} style={{ color: colors.ownerInkMuted }}>
                            Valid for {durationLabel[p.duration]}
                            {renewal && member.priceLocked !== effectivePrice
                              ? ` · current price ${formatCurrency(effectivePrice)} — the member's locked ${formatCurrency(member.priceLocked)} applies`
                              : renewal
                                ? ' · the member\'s locked price applies'
                                : ` · current plan price ${formatCurrency(effectivePrice)}`}
                          </AppText>
                        </View>
                        <AppText variant="bodyStrong" style={{ color: selected ? colors.ownerAccentDeep : colors.ownerInk }}>
                          {formatCurrency(price)}
                        </AppText>
                        {selected && <Ionicons name="checkmark-circle" size={18} color={colors.ownerAccentDeep} />}
                      </PressSurface>
                    );
                  })}
                  <AppText variant="caption" style={{ color: colors.ownerInkSubtle, marginTop: spacing.xs }}>
                    {isRenewal
                      ? `Renewal of ${member.name}'s own plan — their locked ${formatCurrency(member.priceLocked)} is used, never the current ${formatCurrency(plan ? effectivePriceOf(plan) : 0)}.`
                      : live
                        ? 'A plan different from the member\'s current one is a new membership at the server catalogue price. The server recalculates the amount when it records the payment.'
                        : 'A plan different from the member\'s current one is a new membership at the currently configured price for this session.'}
                  </AppText>
                </WorkspaceSection>
              </RiseIn>
            )}

            {/* Step 3 — Apply discount */}
            {member && plan && step === 3 && (
              <RiseIn index={2} style={{ marginTop: spacing.sm }}>
                <WorkspaceSection title="3 · Apply discount">
                  <WorkspaceCard>
                    {detailRow(isRenewal ? 'Agreed price (locked)' : 'Current plan price', formatCurrency(basePrice))}
                    <WorkspaceRowDivider />
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 58 }}>
                      <AppText variant="label" style={{ color: colors.ownerInkMuted, flex: 1, paddingRight: spacing.sm }}>
                        Discount % (authorised)
                      </AppText>
                      <View style={{ width: 128 }}>
                        <TextField
                          label=""
                          placeholder="0"
                          keyboardType="number-pad"
                          inputMode="numeric"
                          value={discountPct}
                          onChangeText={setDiscountPct}
                          error={invalidDiscount ? 'Discount is a percentage between 0 and 50, for example 10.' : null}
                        />
                      </View>
                    </View>
                    <WorkspaceRowDivider />
                    {detailRow('Discount amount', discountAmount > 0 ? `− ${formatCurrency(discountAmount)}` : formatCurrency(0))}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', minHeight: 40, alignItems: 'center' }}>
                      <AppText variant="label" style={{ color: colors.ownerInkMuted }}>
                        Final payable
                      </AppText>
                      {/* Counts smoothly to the new figure whenever the
                          discount changes; a11y reads the exact ₹. */}
                      <CountUp value={payable} format={formatCurrency} variant="figure" style={{ color: colors.ownerAccentDeep }} />
                    </View>
                  </WorkspaceCard>
                  <WorkspaceWell style={{ marginTop: spacing.xs }}>
                    <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
                      Discounts need the owner or receptionist authorisation and are audited. Corrections later go through reversal records, never silent edits.
                    </AppText>
                  </WorkspaceWell>
                </WorkspaceSection>
              </RiseIn>
            )}

            {/* Step 4 — Choose method */}
            {member && plan && !invalidDiscount && step === 4 && (
              <RiseIn index={3} style={{ marginTop: spacing.sm }}>
                <WorkspaceSection title="4 · Payment method">
                  <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                    <MethodOption label="UPI" selected={method === 'upi'} icon="phone-portrait-outline" onPress={() => setMethod('upi')} />
                    <MethodOption label="Cash" selected={method === 'cash'} icon="cash-outline" onPress={() => setMethod('cash')} />
                  </View>
                  {method === 'upi' ? (
                    <WorkspaceCard style={{ marginTop: spacing.sm }}>
                      <AppText variant="bodyStrong" style={{ color: colors.ownerInk }}>
                        Pay by UPI
                      </AppText>
                      <AppText variant="caption" style={{ color: colors.ownerInkMuted, marginTop: spacing['3xs'] }}>
                        {live
                          ? upiId
                            ? `The member pays ${formatCurrency(payable)} to the gym's UPI ID ${upiId}. The reference below is recorded for verification — it never verifies the payment.`
                            : settingsResource.status === 'loading'
                              ? "Loading the gym's UPI ID from the server…"
                              : "The server settings have no UPI ID, so no payment QR can be shown. Record the reference or collect by cash."
                          : `The member pays ${formatCurrency(payable)} into ${demoGymName}'s UPI ID ${upiId}.`}
                      </AppText>
                      <View style={{ marginTop: spacing.sm, alignItems: 'center' }}>
                        {customImageUri ? (
                          <View style={{ alignItems: 'center', gap: spacing.xs }}>
                            <View
                              style={{
                                padding: spacing.sm,
                                backgroundColor: '#FFFFFF', // QR modules require max scanner contrast
                                borderRadius: tokens.radius.sm,
                                borderWidth: 1,
                                borderColor: colors.ownerRule,
                              }}>
                              <Image
                                source={{ uri: customImageUri }}
                                style={{ width: 200, height: 200 }}
                                contentFit="contain"
                                accessibilityLabel="The gym's configured payment QR image"
                              />
                            </View>
                            <AppText variant="caption" align="center" style={{ color: colors.ownerInkMuted, maxWidth: 300 }}>
                              The configured QR image carries no member amount — the member keys {formatCurrency(payable)} in their UPI app. The app cannot decode or validate this image; its correctness was confirmed manually on the Payment QR screen.
                            </AppText>
                          </View>
                        ) : upiPayload ? (
                          <QrDisplay
                            payload={upiPayload}
                            size={184}
                            caption={
                              live
                                ? "Standard UPI deep-link carrying this member's payable amount. The UPI ID comes from the server settings row and is not verified by the app."
                                : "Standard UPI deep-link format carrying this member's payable amount. Session-configured UPI ID — edited on the Payment QR screen; the account is not verified."
                            }
                          />
                        ) : (
                          <AppText variant="caption" align="center" style={{ color: colors.ownerWarningDeep }}>
                            {live
                              ? settingsResource.status === 'loading'
                                ? "Waiting for the server settings row before a payment QR can be shown."
                                : "No UPI ID is configured on the server, so no payment QR can be shown. Record the reference or collect by cash."
                              : "The gym's UPI ID is not configured, so no payment QR can be shown. Collect by cash or record the reference without the QR."}
                          </AppText>
                        )}
                      </View>
                      <View style={{ marginTop: spacing.sm }}>
                        <TextField
                          label="UTR or transaction reference"
                          placeholder="Reference from the member's UPI app"
                          value={utr}
                          onChangeText={(v) => {
                            setUtr(v);
                            setUtrError(null);
                          }}
                          error={utrError}
                          autoCapitalize="characters"
                        />
                      </View>
                      <AppText variant="caption" style={{ color: colors.ownerWarningDeep, marginTop: spacing.xs }}>
                        Entering a reference never verifies the payment — verification happens against the UPI statement by authorised staff. The entry is recorded as awaiting verification.
                      </AppText>
                    </WorkspaceCard>
                  ) : (
                    <WorkspaceWell style={{ marginTop: spacing.sm }}>
                      <AppText variant="label" style={{ color: colors.ownerInkMuted }}>
                        Cash is counted at the desk and recorded against {formatCurrency(payable)} for verification. The owner verifies physical collections daily — a recorded cash entry is never treated as verified here.
                      </AppText>
                    </WorkspaceWell>
                  )}
                  <AppText variant="caption" style={{ color: colors.ownerInkSubtle, marginTop: spacing.xs }}>
                    {live
                      ? 'Recording sends one payment row to the server, which sets the prices and state. Membership extends only after authorised verification.'
                      : 'Recorded entries live in this session only and reset when the app restarts — nothing is sent to a server.'}
                  </AppText>
                </WorkspaceSection>
              </RiseIn>
            )}

            {/* Step 5 — Review */}
            {member && plan && !invalidDiscount && step === 5 && (
              <RiseIn index={4} style={{ marginTop: spacing.sm }}>
                <WorkspaceSection title="5 · Review before recording">
                  <WorkspaceCard>
                    {detailRow('Member', `${member.name} · ${memberDisplayId(member.id)}`)}
                    {detailRow('Plan', `${plan.name} · ${durationLabel[plan.duration]}`)}
                    {detailRow('Type', isRenewal ? 'Renewal (locked price)' : 'New membership')}
                    {detailRow('Original price', formatCurrency(basePrice))}
                    {detailRow('Discount', discount > 0 ? `${discount}% · − ${formatCurrency(discountAmount)}` : 'None')}
                    {detailRow('Final amount', formatCurrency(payable), true)}
                    {detailRow('Payment method', method === 'upi' ? 'UPI' : 'Cash')}
                    {detailRow('Reference', method === 'upi' ? utrValue : 'Not applicable — cash')}
                  </WorkspaceCard>
                  <AppText variant="caption" style={{ color: colors.ownerWarningDeep, marginTop: spacing.xs }}>
                    {method === 'upi'
                      ? 'This will be recorded as awaiting verification. A UTR is a recorded reference, not proof of payment — nothing is marked verified here.'
                      : 'This will be recorded as awaiting verification. Cash entries are verified against the owner\'s daily count, never by this screen.'}
                  </AppText>
                  {live && (
                    <AppText variant="caption" style={{ color: colors.ownerInkSubtle, marginTop: spacing['3xs'] }}>
                      The server recalculates the price from the member&apos;s locked price or the plan catalogue and stores the row as awaiting verification; the amount shown above is confirmed by what the server returns.
                    </AppText>
                  )}
                  {recordError && (
                    <View style={{ marginTop: spacing.xs }}>
                      <AppText variant="label" style={{ color: colors.dangerStrong }}>
                        The payment was not recorded: {recordError}
                      </AppText>
                      <AppText variant="caption" style={{ color: colors.ownerInkMuted, marginTop: spacing['3xs'] }}>
                        If the connection dropped after sending, check Transaction History before trying again — the row may already be there.
                      </AppText>
                    </View>
                  )}
                  <View style={{ gap: spacing.xs, marginTop: spacing.sm }}>
                    <Button
                      label={saving ? 'Recording…' : 'Confirm and record'}
                      icon="checkmark-outline"
                      fullWidth
                      disabled={saving}
                      onPress={confirmRecord}
                    />
                    <Button label="Back — correct details" variant="secondary" fullWidth onPress={() => setStep(4)} />
                  </View>
                </WorkspaceSection>
              </RiseIn>
            )}

            {/* Per-step Continue / Back controls (steps 1–4) */}
            {step < 5 && (
              <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: spacing.md }}>
                {step > 1 && <Button label="Back" variant="secondary" onPress={goBack} />}
                <Button
                  label={step === 4 ? 'Review payment' : 'Continue'}
                  icon="arrow-forward-outline"
                  disabled={!stepReady[step]}
                  onPress={goNext}
                />
              </View>
            )}

            {/* Pending queue (steps 1–4) — session store, never "verified" */}
            {step < 5 && (
              <RiseIn index={5} style={{ marginTop: spacing.md }}>
                <WorkspaceSection title={`Awaiting verification (${pending.length})`}>
                  {pending.length === 0 ? (
                    <OwnerEmptyState icon="time-outline" title="Queue is clear" hint="Recorded entries appear here until the owner verifies them." />
                  ) : (
                    <OwnerListGroup label="Payments awaiting verification">
                      {pending.map((p, i) => (
                        <View key={p.id}>
                          {i > 0 && <WorkspaceRowDivider />}
                          <OwnerListRow
                            leading={<OwnerMemberAvatar name={p.memberName} />}
                            title={`${p.memberName} · ${formatCurrency(p.payable)}`}
                            detail={`${p.utr ?? 'No reference on record'} · ${p.method.toUpperCase()}`}
                            status={<OwnerStatusText {...paymentStatusInfo(p.state)} />}
                          />
                        </View>
                      ))}
                    </OwnerListGroup>
                  )}
                  <AppText variant="caption" style={{ color: colors.ownerInkMuted, marginTop: spacing.xs }}>
                    Awaiting-check entries never activate membership and never read as verified. Full history lives on the Transaction History screen.
                  </AppText>
                </WorkspaceSection>
              </RiseIn>
            )}

            <RiseIn index={6} style={{ marginTop: spacing.md }}>
              <WorkspaceWell>
                <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
                  {live
                    ? `${pluralise(records.length, 'payment row', 'payment rows')} visible to this session. Verification and reversals happen on the Transaction History screen.`
                    : records.length > 0
                      ? `${pluralise(records.length, 'record', 'records')} in this session — every one resets when the app restarts. Nothing here is saved to a database.`
                      : 'No payment records in this session yet.'}
                </AppText>
              </WorkspaceWell>
            </RiseIn>
          </View>
        )}
      </WorkspaceScreen>

      <WorkspaceBottomNavigation active="more" items={navItems} />
    </View>
  );
}

/** Step progress: 6 segments, filled up to the current step, plus the
 * step's label. Restrained — no animated morphs between steps. */
function StepProgress({ current }: { current: number }) {
  const tokens = useTokens();
  const { colors, spacing, radius } = tokens;
  return (
    <View accessibilityLabel={`Step ${current} of 6: ${STEP_LABELS[current - 1]}`} accessible style={{ marginBottom: spacing.sm }}>
      <View style={{ flexDirection: 'row', gap: 3 }}>
        {STEP_LABELS.map((label, i) => (
          <View
            key={label}
            style={{
              flex: 1,
              height: 4,
              borderRadius: radius.pill,
              backgroundColor: i + 1 < current ? colors.ownerSuccessDeep : i + 1 === current ? colors.ownerAccentDeep : colors.ownerRule,
            }}
          />
        ))}
      </View>
      <AppText variant="caption" style={{ color: colors.ownerInkMuted, marginTop: spacing['3xs'] }}>
        Step {current} of 6 · {STEP_LABELS[current - 1]}
      </AppText>
    </View>
  );
}

function MethodOption(props: { label: string; selected: boolean; icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  const tokens = useTokens();
  const { colors, spacing, radius } = tokens;
  return (
    <PressSurface
      accessibilityRole="button"
      accessibilityState={{ selected: props.selected ? props.selected : undefined }}
      onPress={props.onPress}
      scaleOnPress={false}
      style={{
        flex: 1,
        minHeight: 52,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: props.selected ? colors.ownerAccentDeep : colors.ownerRule,
        backgroundColor: props.selected ? colors.ownerAccentTint : colors.ownerPanel,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.xs,
      }}>
      <AnimatedIcon
        name={props.icon}
        active={props.selected}
        size={18}
        color={colors.ownerInkMuted}
        activeColor={colors.ownerAccentDeep}
      />
      <AppText
        variant="label"
        style={{ color: props.selected ? colors.ownerAccentDeep : colors.ownerInk, fontWeight: props.selected ? '600' : '500' }}>
        {props.label}
      </AppText>
    </PressSurface>
  );
}
