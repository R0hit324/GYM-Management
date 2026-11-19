/**
 * Membership Plans — the desk's plan book (Stage 7: price management).
 *
 * View every plan (name, duration, price, benefits, validity) drawn from
 * the single shared plan data structure (no duplicate plan tables), assign
 * a plan to a member, and adjust a plan's price for the session. Editing
 * a price is a session-only demo change staged in the shared session
 * store: it shows across the Receptionist workspace (Collect Payment uses
 * it for new memberships), resets when the app restarts, and is never
 * presented as a server or database save. Creating plans remains
 * Owner-only — stated on-screen.
 *
 * Integrity rules preserved: members' locked prices and historical
 * transactions are never touched by a price edit — renewals keep
 * `priceLocked`, and recorded amounts stay exactly as they were.
 *
 * Honesty rule: an assignment never silently rewrites the member's plan or
 * locked price. It is recorded as a pending assignment that applies with
 * the member's next verified payment; the backend enforces this in Part 2.
 */
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { SearchBar } from '@/components/ui/search-bar';
import { ModalSheet } from '@/components/ui/modal-sheet';
import { StatusBadge } from '@/components/ui/status-badge';
import { SuccessPop } from '@/components/ui/motion';
import { RiseIn } from '@/components/ui/rise-in';
import { SignOut } from '@/components/workspace-meta';
import {
  WorkspaceScreen,
  WorkspaceBottomNavigation,
  WorkspaceCard,
  WorkspaceSection,
  WorkspaceWell,
  WorkspaceRowDivider,
} from '@/components/workspace/workspace-ui';
import {
  OwnerListGroup,
  OwnerListRow,
  OwnerMemberAvatar,
  OwnerStatusText,
  OwnerEmptyState,
} from '@/components/owner/owner-ui';
import { useTokens } from '@/hooks/use-tokens';
import { demoPlans, demoMembers } from '@/data/demo';
import {
  useSessionPlanPrices,
  effectivePlanPrice,
  updateSessionPlanPrice,
  resetSessionPlanPrices,
} from '@/data/session';
import { parsePlanPrice } from '@/utils/payment';
import { formatCurrency } from '@/utils/format';
import { useAuth } from '@/services/auth';
import type { MembershipPlan, PlanDuration } from '@/types/domain';

const navItems = [
  { key: 'home', label: 'Home', icon: 'home-outline', href: '/(reception)/home' },
  { key: 'members', label: 'Members', icon: 'people-outline', href: '/(reception)/members' },
  { key: 'more', label: 'More', icon: 'apps-outline', href: '/(reception)/more' },
] as const;

const durationLabel: Record<PlanDuration, string> = {
  monthly: '1 month',
  quarterly: '3 months',
  halfYearly: '6 months',
  yearly: '12 months',
};

interface PlanAssignment {
  id: string;
  memberId: string;
  memberName: string;
  planId: string;
  planName: string;
}

export default function ReceptionPlansScreen() {
  const tokens = useTokens();
  const { colors, spacing } = tokens;
  const { provider } = useAuth();
  const live = provider.mode === 'live';

  // Session price overrides — the single shared store; editing a price
  // here shows across the Receptionist workspace for this session only.
  // In live mode, plan price updates are owner-only (update_plan_price RPC),
  // so the receptionist screen presents prices as read-only.
  const planPrices = useSessionPlanPrices();
  const priceOf = (p: MembershipPlan) => effectivePlanPrice(p.id, p.price, planPrices);
  const overridesActive = Object.keys(planPrices).length > 0;

  const [assignments, setAssignments] = useState<PlanAssignment[]>([]);
  const [assignPlan, setAssignPlan] = useState<MembershipPlan | null>(null);
  const [query, setQuery] = useState('');
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [doneOpen, setDoneOpen] = useState(false);

  // Price edit sheet: current vs proposed, strict validation, explicit
  // confirmation. Cancel discards; confirm stages one session override.
  const [editPlan, setEditPlan] = useState<MembershipPlan | null>(null);
  const [priceDraft, setPriceDraft] = useState('');
  const [priceError, setPriceError] = useState<string | null>(null);
  const [priceNote, setPriceNote] = useState<string | null>(null);

  const openPriceEdit = (plan: MembershipPlan) => {
    setEditPlan(plan);
    setPriceDraft(String(priceOf(plan)));
    setPriceError(null);
  };

  const closePriceEdit = () => {
    setEditPlan(null);
    setPriceDraft('');
    setPriceError(null);
  };

  const proposedPrice = parsePlanPrice(priceDraft);

  const confirmPriceEdit = () => {
    if (!editPlan) return;
    const n = parsePlanPrice(priceDraft);
    if (n === null) {
      setPriceError('Enter a price as a positive number — digits only, at most two decimals, for example 1300 or 1300.50.');
      return;
    }
    updateSessionPlanPrice(editPlan.id, n);
    closePriceEdit();
    setPriceNote(
      `${editPlan.name} is ${formatCurrency(n)} for this session. New memberships use it immediately; members' locked renewal prices and recorded transactions are unchanged. It resets when the app restarts — nothing was saved to a server or database.`,
    );
  };

  const resetPrices = () => {
    resetSessionPlanPrices();
    setPriceNote('Plan prices are back to the demo figures. Session price changes are gone.');
  };

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return demoMembers.filter(
      (m) => m.name.toLowerCase().includes(q) || m.id.replace('m-', '').includes(q),
    );
  }, [query]);

  const picked = demoMembers.find((m) => m.id === pickedId) ?? null;

  const confirmAssign = () => {
    if (!assignPlan || !picked) {
      setAssignError('Pick a member to assign this plan to.');
      return;
    }
    // One pending assignment per member: re-assigning replaces the request
    // instead of stacking duplicates.
    setAssignments((prev) => [
      {
        id: `assign-${picked.id}`,
        memberId: picked.id,
        memberName: picked.name,
        planId: assignPlan.id,
        planName: assignPlan.name,
      },
      ...prev.filter((a) => a.memberId !== picked.id),
    ]);
    setAssignError(null);
    setAssignPlan(null);
    setPickedId(null);
    setQuery('');
    setDoneOpen(true);
  };

  return (
    <View style={{ flex: 1 }}>
      <WorkspaceScreen
        title="Membership Plans"
        eyebrow="Memberships"
        subtitle="View plans, assign to members"
        demo
        actions={<SignOut />}>
        {/* Session price note */}
        {priceNote && (
          <RiseIn>
            <WorkspaceWell>
              <AppText variant="caption" style={{ color: colors.ownerSuccessDeep }}>
                {priceNote}
              </AppText>
            </WorkspaceWell>
          </RiseIn>
        )}

        {/* Permission note */}
        <RiseIn index={priceNote ? 1 : 0}>
          <WorkspaceWell>
            <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
              {live
                ? 'Receptionists can view plans and assign them to members. Plan price changes are owner-only (update_plan_price RPC). The prices shown here are the current live prices from the server.'
                : 'Receptionists can view plans, assign them to members, and adjust a plan&apos;s price for this session. Creating plans stays Owner-only, enforced by the backend in Part 2. Price edits are session-only — they reset when the app restarts and are never saved to a server or database.'}
            </AppText>
          </WorkspaceWell>
        </RiseIn>

        {/* Plan cards */}
        {demoPlans.map((plan, i) => (
          <RiseIn key={plan.id} index={(priceNote ? 2 : 1) + i} style={{ marginTop: spacing.sm }}>
            <WorkspaceCard>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AppText variant="bodyStrong" style={{ color: colors.ownerInk }}>
                    {plan.name}
                  </AppText>
                  <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
                    Valid for {durationLabel[plan.duration]} from the payment date
                  </AppText>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <AppText variant="figureSmall" style={{ color: colors.ownerAccentDeep }}>
                    {formatCurrency(priceOf(plan))}
                  </AppText>
                  <AppText variant="caption" style={{ color: colors.ownerInkSubtle }}>
                    {planPrices[plan.id] !== undefined
                      ? `session price · demo was ${formatCurrency(plan.price)}`
                      : `per ${durationLabel[plan.duration]}`}
                  </AppText>
                </View>
              </View>
              {plan.highlights && plan.highlights.length > 0 && (
                <View style={{ marginTop: spacing.sm, gap: spacing['3xs'] }}>
                  {plan.highlights.map((line) => (
                    <View key={line} style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start' }}>
                      <AppText variant="label" style={{ color: colors.ownerSuccessDeep }}>
                        ·
                      </AppText>
                      <AppText variant="label" style={{ flex: 1, color: colors.ownerInkMuted }}>
                        {line}
                      </AppText>
                    </View>
                  ))}
                </View>
              )}
              <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm }}>
                {!live && (
                  <Button
                    label="Edit price"
                    size="small"
                    variant="secondary"
                    icon="create-outline"
                    onPress={() => openPriceEdit(plan)}
                    style={{ alignSelf: 'flex-start' }}
                  />
                )}
                <Button
                  label="Assign to member"
                  size="small"
                  variant="secondary"
                  icon="person-add-outline"
                  onPress={() => {
                    setAssignPlan(plan);
                    setPickedId(null);
                    setQuery('');
                    setAssignError(null);
                  }}
                  style={{ alignSelf: 'flex-start' }}
                />
              </View>
            </WorkspaceCard>
          </RiseIn>
        ))}

        {/* Reset session prices */}
        {overridesActive && (
          <RiseIn index={demoPlans.length + (priceNote ? 3 : 2)} style={{ marginTop: spacing.sm }}>
            <Button label="Reset prices to demo" variant="secondary" icon="refresh-outline" onPress={resetPrices} />
          </RiseIn>
        )}

        {/* Pending assignments */}
        <RiseIn index={demoPlans.length + 3} style={{ marginTop: spacing.sm }}>
          <WorkspaceSection title="Pending plan assignments">
            {assignments.length === 0 ? (
              <OwnerEmptyState
                icon="swap-horizontal-outline"
                title="No assignments pending"
                hint="Assignments appear here and apply with the member's next verified payment."
              />
            ) : (
              <OwnerListGroup label="Assignments awaiting the next payment">
                {assignments.map((a, i) => (
                  <View key={a.id}>
                    {i > 0 && <WorkspaceRowDivider />}
                    <OwnerListRow
                      leading={<OwnerMemberAvatar name={a.memberName} />}
                      title={`${a.memberName} → ${a.planName}`}
                      detail="Applies with the next verified payment"
                      status={<OwnerStatusText label="Pending payment" tone="warning" />}
                    />
                  </View>
                ))}
              </OwnerListGroup>
            )}
          </WorkspaceSection>
        </RiseIn>

        <AppText variant="caption" style={{ color: colors.ownerInkSubtle, textAlign: 'center', marginTop: spacing.lg }}>
          The locked price rule is untouched: a member keeps their agreed price even if the plan&apos;s list price changes here. Recorded transaction amounts never change either.
        </AppText>
      </WorkspaceScreen>

      {/* Price edit sheet — demo mode only. In live mode, plan price updates
          are owner-only via the update_plan_price RPC. */}
      {!live && (
        <ModalSheet
          visible={!!editPlan}
          onClose={closePriceEdit}
          title={`Edit ${editPlan?.name ?? ''} price`}
          subtitle="Session-only change"
          toneBadge={<StatusBadge label="Session only" tone="warning" small />}>
          {editPlan && (
          <View style={{ gap: spacing.sm }}>
            <WorkspaceCard>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', minHeight: 30, alignItems: 'center' }}>
                <AppText variant="label" style={{ color: colors.ownerInkMuted }}>
                  Plan
                </AppText>
                <AppText variant="label" style={{ color: colors.ownerInk, fontWeight: '600' }}>
                  {editPlan.name} · {durationLabel[editPlan.duration]}
                </AppText>
              </View>
              <WorkspaceRowDivider />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', minHeight: 30, alignItems: 'center' }}>
                <AppText variant="label" style={{ color: colors.ownerInkMuted }}>
                  {planPrices[editPlan.id] !== undefined ? 'Current price (session)' : 'Current price'}
                </AppText>
                <AppText variant="label" style={{ color: colors.ownerInk, fontWeight: '600' }}>
                  {formatCurrency(priceOf(editPlan))}
                </AppText>
              </View>
              {planPrices[editPlan.id] !== undefined && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', minHeight: 30, alignItems: 'center' }}>
                  <AppText variant="label" style={{ color: colors.ownerInkMuted }}>
                    Demo price
                  </AppText>
                  <AppText variant="label" style={{ color: colors.ownerInkMuted }}>
                    {formatCurrency(editPlan.price)}
                  </AppText>
                </View>
              )}
              {proposedPrice !== null && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', minHeight: 34, alignItems: 'center' }}>
                  <AppText variant="label" style={{ color: colors.ownerInkMuted }}>
                    Proposed price
                  </AppText>
                  <AppText variant="bodyStrong" style={{ color: colors.ownerAccentDeep }}>
                    {formatCurrency(proposedPrice)}
                  </AppText>
                </View>
              )}
            </WorkspaceCard>

            <TextField
              label="New price (₹)"
              placeholder="For example 1300 or 1300.50"
              value={priceDraft}
              onChangeText={(v) => {
                setPriceDraft(v);
                setPriceError(null);
              }}
              keyboardType="decimal-pad"
              inputMode="decimal"
              error={priceError}
              helper="Positive number, digits only, at most two decimal places."
            />
            {proposedPrice !== null && proposedPrice === priceOf(editPlan) && (
              <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
                That is the same as the current price — confirming would change nothing.
              </AppText>
            )}

            <View style={{ gap: spacing.xs }}>
              <Button label="Confirm new price" icon="checkmark-outline" fullWidth onPress={confirmPriceEdit} />
              <Button label="Cancel — keep current price" variant="secondary" fullWidth onPress={closePriceEdit} />
            </View>
            <AppText variant="caption" style={{ color: colors.ownerInkSubtle }}>
              Applies to this session only and resets when the app restarts — nothing is saved to a server or database. Members&apos; locked renewal prices and recorded transactions are never changed by this edit.
            </AppText>
          </View>
        )}
      </ModalSheet>
      )}

      {/* Assign sheet */}
      <ModalSheet
        visible={!!assignPlan}
        onClose={() => setAssignPlan(null)}
        title={`Assign ${assignPlan?.name ?? ''}`}
        subtitle="Plan change applies with the next verified payment"
        toneBadge={<StatusBadge label="Demo" tone="warning" small />}>
        {assignPlan && (
          <View style={{ gap: spacing.sm }}>
            <WorkspaceCard>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', minHeight: 30, alignItems: 'center' }}>
                <AppText variant="label" style={{ color: colors.ownerInkMuted }}>
                  Plan
                </AppText>
                <AppText variant="label" style={{ color: colors.ownerInk, fontWeight: '600' }}>
                  {assignPlan.name} · {formatCurrency(priceOf(assignPlan))}
                </AppText>
              </View>
              <WorkspaceRowDivider />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', minHeight: 30, alignItems: 'center' }}>
                <AppText variant="label" style={{ color: colors.ownerInkMuted }}>
                  Duration
                </AppText>
                <AppText variant="label" style={{ color: colors.ownerInk, fontWeight: '600' }}>
                  {durationLabel[assignPlan.duration]}
                </AppText>
              </View>
            </WorkspaceCard>

            <SearchBar label="Search member" value={query} onChange={setQuery} placeholder="Name or member number" />
            {picked ? (
              <OwnerListRow
                leading={<OwnerMemberAvatar name={picked.name} />}
                title={picked.name}
                detail={picked.id.replace('m-', 'GB-').toUpperCase()}
                status={<OwnerStatusText label="Selected" tone="action" />}
              />
            ) : results.length > 0 ? (
              <OwnerListGroup label="Pick a member">
                {results.slice(0, 5).map((m, i) => (
                  <View key={m.id}>
                    {i > 0 && <WorkspaceRowDivider />}
                    <OwnerListRow
                      leading={<OwnerMemberAvatar name={m.name} />}
                      title={m.name}
                      detail={m.id.replace('m-', 'GB-').toUpperCase()}
                      chevron
                      onPress={() => {
                        setPickedId(m.id);
                        setQuery('');
                      }}
                    />
                  </View>
                ))}
              </OwnerListGroup>
            ) : query.length > 0 ? (
              <OwnerEmptyState icon="search-outline" title="No member matches" hint="Try a shorter name or the member number." />
            ) : (
              <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
                Search for the member this plan is for.
              </AppText>
            )}

            {assignError && (
              <AppText variant="caption" style={{ color: colors.ownerErrorDeep }}>
                {assignError}
              </AppText>
            )}

            <Button label="Record assignment" fullWidth onPress={confirmAssign} />
            <AppText variant="caption" style={{ color: colors.ownerInkSubtle }}>
              The member&apos;s current plan and locked price stay exactly as they are until the next verified payment; nothing is edited silently.
            </AppText>
          </View>
        )}
      </ModalSheet>

      {/* Honest confirmation */}
      <ModalSheet
        visible={doneOpen}
        onClose={() => setDoneOpen(false)}
        title="Assignment recorded"
        subtitle="Applies with the next verified payment">
        <View style={{ alignItems: 'center', marginBottom: spacing.sm }}>
          <SuccessPop size={54} color={colors.success} />
        </View>
        <AppText variant="body" style={{ color: colors.ownerInk }}>
          The pending assignment is listed on this screen. In production the plan change is applied server-side when the member&apos;s next payment is verified, keeping the price lock and audit trail intact.
        </AppText>
        <View style={{ marginTop: spacing.sm }}>
          <Button label="Close" variant="secondary" fullWidth onPress={() => setDoneOpen(false)} />
        </View>
      </ModalSheet>

      <WorkspaceBottomNavigation active="more" items={navItems} />
    </View>
  );
}
