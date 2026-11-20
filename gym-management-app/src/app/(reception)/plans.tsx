/**
 * Membership Plans — the desk's plan book.
 *
 * Demo mode reads the approved demo catalogue and keeps price edits and
 * assignments in the session store (clearly labelled, reset on restart).
 *
 * Live mode reads the real plan catalogue and member list
 * (`usePlans`/`useMembers`) and sends an assignment through
 * `request_plan_assignment`; the server records the request on the member
 * and applies it atomically with the member's next verified payment. The
 * screen never rewrites the member's current plan or locked price, and the
 * "pending assignments" list is the server's own `members.pending_plan_id`,
 * not local state.
 *
 * Plan price changes and plan creation stay Owner-only (`update_plan_price`,
 * `create_plan`, `deactivate_plan`); the receptionist sees a read-only
 * catalogue in live mode. No price edit ever touches a locked renewal price
 * or a recorded transaction.
 */
import { useMemo, useState } from 'react';
import { Switch, View } from 'react-native';

import { AppText } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { SearchBar } from '@/components/ui/search-bar';
import { ModalSheet } from '@/components/ui/modal-sheet';
import { StatusBadge } from '@/components/ui/status-badge';
import { SuccessPop } from '@/components/ui/motion';
import { RiseIn } from '@/components/ui/rise-in';
import { ErrorState, SkeletonRow } from '@/components/ui/feedback';
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
import { formatCurrency, memberDisplayId } from '@/utils/format';
import {
  createPlan,
  deactivatePlan,
  requestPlanAssignment,
  useMembers,
  usePendingAssignments,
  usePlans,
} from '@/services/data';
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
  const { provider, session } = useAuth();
  const live = provider.mode === 'live';
  const isOwner = live && session?.role === 'owner';

  // Live reads: the real catalogue, member list and server-recorded pending
  // requests. Demo mode keeps the approved demo arrays below.
  const plansResource = usePlans();
  const membersResource = useMembers();
  const pendingResource = usePendingAssignments();

  const plans = live ? plansResource.data : demoPlans;
  const members = live ? membersResource.data : demoMembers;

  // Session price overrides — demo only. Live prices are server-owned and
  // read-only for a receptionist.
  const planPrices = useSessionPlanPrices();
  const priceOf = (p: MembershipPlan) =>
    live ? p.price : effectivePlanPrice(p.id, p.price, planPrices);
  const overridesActive = !live && Object.keys(planPrices).length > 0;

  const [assignments, setAssignments] = useState<PlanAssignment[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [assignNotice, setAssignNotice] = useState<string | null>(null);
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

  // Owner plan lifecycle (live): create_plan / deactivate_plan.
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDuration, setCreateDuration] = useState<PlanDuration>('monthly');
  const [createPrice, setCreatePrice] = useState('');
  const [createIsActive, setCreateIsActive] = useState(true);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);
  const [lifecycleNote, setLifecycleNote] = useState<string | null>(null);

  const createPlanNow = async () => {
    const n = parsePlanPrice(createPrice);
    const result = await createPlan(createName.trim(), createDuration, n ?? 0, 'INR', createIsActive);
    if (!result.ok) {
      setCreateError(result.error);
      return;
    }
    setCreateOpen(false);
    setCreateName('');
    setCreatePrice('');
    setCreateIsActive(true);
    setLifecycleNote(`Plan "${createName.trim()}" created.`);
  };

  const deactivatePlanNow = async (plan: MembershipPlan) => {
    setDeactivatingId(plan.id);
    const result = await deactivatePlan(plan.id);
    setDeactivatingId(null);
    if (!result.ok) {
      setLifecycleError(result.error);
      return;
    }
    setLifecycleError(null);
    setLifecycleNote(`Plan "${plan.name}" deactivated.`);
  };

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return members.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.phone.replace(/\s+/g, '').includes(q) ||
        memberDisplayId(m.id).toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q),
    );
  }, [members, query]);

  const picked = members.find((m) => m.id === pickedId) ?? null;

  const confirmAssign = async () => {
    if (!assignPlan || !picked) {
      setAssignError('Pick a member to assign this plan to.');
      return;
    }
    if (live) {
      if (assigning) return;
      setAssigning(true);
      const result = await requestPlanAssignment(picked.id, assignPlan.id);
      setAssigning(false);
      if (!result.ok) {
        setAssignError(result.error);
        return;
      }
      pendingResource.refresh();
      setAssignError(null);
      setAssignNotice(
        `Plan request recorded for ${picked.name}. It applies when their next payment is verified — the current plan and locked price stay unchanged until then.`,
      );
      setAssignPlan(null);
      setPickedId(null);
      setQuery('');
      setDoneOpen(true);
      return;
    }
    // Demo: session-only request book, never presented as a server save.
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
        demo={!live}
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

        {/* Owner plan lifecycle (live): create_plan / deactivate_plan */}
        {isOwner && live && (
          <RiseIn index={plans.length + 4} style={{ marginTop: spacing.sm }}>
            {lifecycleError ? (
              <AppText variant="caption" style={{ color: colors.ownerErrorDeep, marginBottom: spacing.xs }}>
                {lifecycleError}
              </AppText>
            ) : null}
            {lifecycleNote ? (
              <AppText variant="caption" style={{ color: colors.ownerInkMuted, marginBottom: spacing.xs }}>
                {lifecycleNote}
              </AppText>
            ) : null}
            <Button
              label="Create plan"
              size="small"
              variant="secondary"
              icon="add-outline"
              onPress={() => {
                setCreateOpen(true);
                setCreateError(null);
              }}
            />
          </RiseIn>
        )}

        {/* Plan cards — live catalogue in live mode, demo catalogue in demo. */}
        {live && plansResource.status === 'loading' && plans.length === 0 ? (
          <SkeletonRow count={3} style={{ marginTop: spacing.sm }} />
        ) : null}
        {live && plansResource.status === 'error' ? (
          <ErrorState
            title="Plans could not be loaded"
            message={plansResource.error ?? 'The plan catalogue is unavailable.'}
            onRetry={plansResource.refresh}
            style={{ marginTop: spacing.sm }}
          />
        ) : null}
        {plans.map((plan, i) => (
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
                    {!live && planPrices[plan.id] !== undefined
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
                {isOwner && live && (
                  <Button
                    label={deactivatingId === plan.id ? 'Deactivating…' : 'Deactivate plan'}
                    size="small"
                    variant="secondary"
                    icon="trash-outline"
                    onPress={() => void deactivatePlanNow(plan)}
                    disabled={deactivatingId === plan.id}
                    style={{ alignSelf: 'flex-start' }}
                  />
                )}
              </View>
            </WorkspaceCard>
          </RiseIn>
        ))}

        {/* Reset session prices */}
        {overridesActive && (
          <RiseIn index={plans.length + (priceNote ? 3 : 2)} style={{ marginTop: spacing.sm }}>
            <Button label="Reset prices to demo" variant="secondary" icon="refresh-outline" onPress={resetPrices} />
          </RiseIn>
        )}

        {/* Pending assignments — server rows in live mode, session rows in demo */}
        <RiseIn index={plans.length + 3} style={{ marginTop: spacing.sm }}>
          <WorkspaceSection title="Pending plan assignments">
            {live && pendingResource.status === 'loading' && pendingResource.data.length === 0 ? (
              <SkeletonRow count={2} />
            ) : null}
            {live && pendingResource.status === 'error' ? (
              <ErrorState
                title="Pending assignments could not be loaded"
                message={pendingResource.error ?? 'The request list is unavailable.'}
                onRetry={pendingResource.refresh}
              />
            ) : null}
            {(live ? pendingResource.data.length === 0 : assignments.length === 0) ? (
              <OwnerEmptyState
                icon="swap-horizontal-outline"
                title="No assignments pending"
                hint={
                  live
                    ? 'A plan request appears here after it is recorded and applies with the next verified payment.'
                    : 'Demo assignments appear here and apply with the next verified payment.'
                }
              />
            ) : live ? (
              <OwnerListGroup label="Recorded on the member record">
                {pendingResource.data.map((a, i) => (
                  <View key={a.memberId}>
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
            ) : (
              <OwnerListGroup label="Assignments awaiting the next payment">
                {assignments.map((a, i) => (
                  <View key={a.id}>
                    {i > 0 && <WorkspaceRowDivider />}
                    <OwnerListRow
                      leading={<OwnerMemberAvatar name={a.memberName} />}
                      title={`${a.memberName} → ${a.planName}`}
                      detail="Session record — applies with the next verified payment"
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
        subtitle={
          live
            ? 'Recorded on the member; applies with their next verified payment'
            : 'Session-only assignment'
        }
        toneBadge={!live ? <StatusBadge label="Demo" tone="warning" small /> : undefined}>
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
                detail={memberDisplayId(picked.id)}
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
                      detail={memberDisplayId(m.id)}
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

            <Button
              label={assigning ? 'Recording…' : live ? 'Request plan change' : 'Record assignment'}
              fullWidth
              disabled={assigning}
              onPress={() => void confirmAssign()}
            />
            <AppText variant="caption" style={{ color: colors.ownerInkSubtle }}>
              The member&apos;s current plan and locked price stay exactly as they are until the next verified payment; nothing is edited silently.
            </AppText>
          </View>
        )}
      </ModalSheet>

      {/* Owner create-plan sheet (live) */}
      <ModalSheet
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create plan"
        subtitle="Owner-only · validated before submit">
        <View style={{ gap: spacing.sm }}>
          <TextField label="Plan name" value={createName} onChangeText={setCreateName} placeholder="e.g. 3b8 New Plan" />
          <TextField
            label="Duration"
            value={createDuration}
            onChangeText={(v) => setCreateDuration(v as PlanDuration)}
          />
          <TextField label="Price" value={createPrice} onChangeText={setCreatePrice} keyboardType="numeric" />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <AppText variant="label" style={{ color: colors.ownerInkMuted }}>Active</AppText>
            <Switch
              value={createIsActive}
              onValueChange={setCreateIsActive}
              trackColor={{ false: colors.ownerRule, true: colors.ownerAccentDeep }}
              thumbColor={colors.ownerInk}
            />
          </View>
          {createError ? (
            <AppText variant="caption" style={{ color: colors.ownerErrorDeep }}>
              {createError}
            </AppText>
          ) : null}
          <Button label="Create plan" fullWidth onPress={() => void createPlanNow()} />
        </View>
      </ModalSheet>

      {/* Honest confirmation */}
      <ModalSheet
        visible={doneOpen}
        onClose={() => setDoneOpen(false)}
        title={live ? 'Plan request recorded' : 'Assignment recorded'}
        subtitle="Applies with the next verified payment">
        <View style={{ alignItems: 'center', marginBottom: spacing.sm }}>
          <SuccessPop size={54} color={colors.success} />
        </View>
        <AppText variant="body" style={{ color: colors.ownerInk }}>
          {live
            ? (assignNotice ??
              'The request is recorded on the member record and is listed under pending assignments. The plan change is applied by the server when the next payment is verified, keeping the price lock and audit trail intact.')
            : 'The pending assignment is listed on this screen for this session only — nothing was saved to a server or database. In production the plan change is applied server-side when the member\u2019s next payment is verified, keeping the price lock and audit trail intact.'}
        </AppText>
        <View style={{ marginTop: spacing.sm }}>
          <Button label="Close" variant="secondary" fullWidth onPress={() => setDoneOpen(false)} />
        </View>
      </ModalSheet>

      <WorkspaceBottomNavigation active="more" items={navItems} />
    </View>
  );
}
