/**
 * Transaction History — the desk's financial register (Stage 5).
 *
 * A complete operational register over the session payment store: today by
 * default, month/year navigation with a month picker (year boundaries
 * handled by utils/calendar), name/phone/member-ID search, the
 * All/UPI/Cash/Pending/Verified filters, expandable per-transaction
 * details, and a month-level financial summary that stays independent of
 * search and filters so it remains a reliable month total.
 *
 * Data honesty:
 * - Demo mode reads the session store — the same source Payment QR and
 *   Collect Payment read and write; desk-recorded entries appear here
 *   immediately and reset on restart. Live mode reads the payment rows the
 *   signed-in staff role is authorised to select and performs the authority
 *   actions through the verified RPCs.
 * - Only verified entries are collected revenue; a recorded UTR is just a
 *   recorded reference, never verification; pending is never revenue.
 * - Verification, rejection and reversal are server decisions. The screen
 *   shows the server's answer verbatim, never simulates one, refuses to
 *   offer an action the server would deny to the same person, and never
 *   edits an original payment (a reversal is a new verified row).
 * - Missing fields are never invented: a record without a UTR shows "No
 *   reference on record"; the totals helper reports all zeros for months
 *   without records instead of fabricating transactions.
 * - Phone search joins the members store (records themselves carry no
 *   phone numbers — a data-model limitation, disclosed below the list).
 */
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { StatRow } from '@/components/ui/stat-tile';
import { SearchBar } from '@/components/ui/search-bar';
import { ModalSheet } from '@/components/ui/modal-sheet';
import { FilterChip } from '@/components/ui/segmented-tabs';
import { RiseIn } from '@/components/ui/rise-in';
import { SignOut } from '@/components/workspace-meta';
import {
  WorkspaceScreen,
  WorkspaceBottomNavigation,
  WorkspaceSection,
  WorkspaceRowDivider,
  WorkspaceWell,
} from '@/components/workspace/workspace-ui';
import {
  OwnerStatTile,
  OwnerListGroup,
  OwnerListRow,
  OwnerMemberAvatar,
  OwnerStatusText,
  OwnerEmptyState,
  OwnerWell,
} from '@/components/owner/owner-ui';
import { PressSurface } from '@/components/ui/press-surface';
import { AnimatedIcon } from '@/components/ui/animated-icon';
import { useTokens } from '@/hooks/use-tokens';
import { useAuth } from '@/services/auth/auth-context';
import { useSessionPayments, useSessionMembers } from '@/data/session';
import {
  createReversal,
  rejectPayment,
  useMembers,
  usePayments,
  usePlans,
  verifyPayment,
} from '@/services/data';
import { DataRefreshControl, ErrorState, SkeletonRow } from '@/components/ui/feedback';
import { paymentStatusInfo, monthPaymentTotals } from '@/utils/payment';
import {
  formatCurrency,
  formatDate,
  formatTime,
  isSameLocalDay,
  memberDisplayId,
  pluralise,
} from '@/utils/format';
import { addMonth, MONTH_NAMES, type MonthPosition } from '@/utils/calendar';
import type { PaymentRecord } from '@/types/domain';

const navItems = [
  { key: 'home', label: 'Home', icon: 'home-outline', href: '/(reception)/home' },
  { key: 'members', label: 'Members', icon: 'people-outline', href: '/(reception)/members' },
  { key: 'more', label: 'More', icon: 'apps-outline', href: '/(reception)/more' },
] as const;

/** List filters; each combines with the period and the search query. */
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'upi', label: 'UPI' },
  { key: 'cash', label: 'Cash' },
  { key: 'pending', label: 'Pending' },
  { key: 'verified', label: 'Verified' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

function matchesFilter(p: PaymentRecord, filter: FilterKey): boolean {
  if (filter === 'upi') return p.method === 'upi';
  if (filter === 'cash') return p.method === 'cash';
  if (filter === 'pending') return p.state === 'awaitingVerification';
  if (filter === 'verified') return p.state === 'verified';
  return true;
}

/** Plan names by id — plan prices change, but a recorded transaction keeps
 * its planId and amounts; the name is joined for display only. */

export default function TransactionHistoryScreen() {
  const tokens = useTokens();
  const { colors, spacing } = tokens;

  const paymentsResource = usePayments();
  const membersResource = useMembers();
  const plansResource = usePlans();
  const sessionPayments = useSessionPayments();
  const sessionMembers = useSessionMembers();
  const live = paymentsResource.isLive;
  // Demo mode keeps the session stores so desk-recorded entries and staged
  // contact edits still appear; live mode reads authorised backend rows.
  const records = live ? paymentsResource.data : sessionPayments;
  const members = live ? membersResource.data : sessionMembers;
  const planById = useMemo(
    () => new Map(plansResource.data.map((p) => [p.id, p.name] as const)),
    [plansResource.data],
  );
  const liveLoading =
    paymentsResource.status === 'loading' ||
    membersResource.status === 'loading' ||
    plansResource.status === 'loading';
  const hasError =
    paymentsResource.status === 'error' ||
    membersResource.status === 'error' ||
    plansResource.status === 'error';
  const refreshAll = () => {
    paymentsResource.refresh();
    membersResource.refresh();
    plansResource.refresh();
  };
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [openId, setOpenId] = useState<string | null>(null);

  // Period: today by default; the month bar browses months (and their
  // summaries) without mixing today's figures into a browsed month.
  const [todayMode, setTodayMode] = useState(true);
  const [yearMonth, setYearMonth] = useState<MonthPosition | null>(null); // null = current month
  const [pickerOpen, setPickerOpen] = useState(false);

  // Authority actions (live only). Every decision is made by the server;
  // these states only carry the server's answer and the in-flight UI state.
  const { session } = useAuth();
  const myUserId = session?.userId ?? null;
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [reversalFor, setReversalFor] = useState<PaymentRecord | null>(null);
  const [reversalAmount, setReversalAmount] = useState('');
  const [reversalNote, setReversalNote] = useState('');
  const [reversalError, setReversalError] = useState<string | null>(null);

  // Verified reversals already recorded against each original payment.
  const reversedByOriginal = useMemo(() => {
    const map = new Map<string, number>();
    for (const record of records) {
      if (record.entryType === 'reversal' && record.state === 'verified' && record.reversalOf) {
        map.set(record.reversalOf, (map.get(record.reversalOf) ?? 0) + record.payable);
      }
    }
    return map;
  }, [records]);

  const remainingFor = (record: PaymentRecord) =>
    Math.max(0, record.payable - (reversedByOriginal.get(record.id) ?? 0));

  // The server refuses self-verification/self-rejection and a reversal by
  // the person who recorded or verified the original. The UI simply does
  // not offer an action the server would refuse.
  const selfRecorded = (record: PaymentRecord) =>
    myUserId !== null && record.recordedBy === myUserId;
  const selfVerified = (record: PaymentRecord) =>
    myUserId !== null && record.verifiedById === myUserId;
  const reversalBlocked = (record: PaymentRecord) =>
    selfRecorded(record) || selfVerified(record);

  const clearActionMessages = () => {
    setActionError(null);
    setActionNotice(null);
  };

  const handleVerify = async (record: PaymentRecord) => {
    if (!live || actionBusy !== null) return;
    clearActionMessages();
    setActionBusy(record.id);
    const outcome = await verifyPayment(record.id);
    setActionBusy(null);
    if (!outcome.ok) {
      setActionError(outcome.error);
      return;
    }
    setActionNotice(
      `Payment for ${record.memberName} verified on the server. Membership validity is now derived from the verified record.`,
    );
    refreshAll();
  };

  const handleReject = async (record: PaymentRecord) => {
    if (!live || actionBusy !== null) return;
    clearActionMessages();
    setActionBusy(record.id);
    const outcome = await rejectPayment(record.id);
    setActionBusy(null);
    if (!outcome.ok) {
      setActionError(outcome.error);
      return;
    }
    setActionNotice(`Payment for ${record.memberName} rejected. The row stays on record and never extends membership.`);
    refreshAll();
  };

  const openReversal = (record: PaymentRecord) => {
    clearActionMessages();
    setReversalError(null);
    setReversalAmount('');
    setReversalNote('');
    setReversalFor(record);
  };

  const closeReversal = () => {
    if (actionBusy !== null) return;
    setReversalFor(null);
    setReversalError(null);
    setReversalAmount('');
    setReversalNote('');
  };

  const submitReversal = async () => {
    if (!reversalFor || actionBusy !== null) return;
    const original = reversalFor;
    const amount = Number(reversalAmount);
    const remaining = remainingFor(original);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
      setReversalError('Enter the refund amount in whole rupees, greater than zero.');
      return;
    }
    if (amount > remaining) {
      setReversalError(`The remaining amount on this payment is ${formatCurrency(remaining)}.`);
      return;
    }
    setReversalError(null);
    setActionBusy(original.id);
    const outcome = await createReversal(original.id, amount, reversalNote);
    setActionBusy(null);
    if (!outcome.ok) {
      setReversalError(outcome.error);
      return;
    }
    setActionNotice(
      `Reversal of ${formatCurrency(amount)} recorded for ${original.memberName}. It is verified immediately, is deducted from revenue, and never edits the original payment.`,
    );
    setReversalFor(null);
    setReversalAmount('');
    setReversalNote('');
    refreshAll();
  };

  // Midnight today, stable across renders (same pattern as the register).
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const pos = useMemo<MonthPosition>(
    () => yearMonth ?? { year: today.getFullYear(), month: today.getMonth() },
    [yearMonth, today],
  );

  // Browsable years: bounded by the records and the current year, so months
  // without transactions stay reachable but arbitrary years do not appear.
  const years = useMemo(() => {
    let min = today.getFullYear();
    let max = today.getFullYear();
    for (const p of records) {
      const y = new Date(p.createdAt).getFullYear();
      if (y < min) min = y;
      if (y > max) max = y;
    }
    const list: number[] = [];
    for (let y = min; y <= max; y++) list.push(y);
    return list;
  }, [records, today]);

  // Phone numbers live on the member records, not on payment records — the
  // phone search joins the members store by memberId.
  const phoneById = useMemo(() => new Map(members.map((m) => [m.id, m.phone] as const)), [members]);

  const inPeriod = useMemo(() => {
    if (todayMode) return records.filter((p) => isSameLocalDay(p.createdAt, today));
    return records.filter((p) => {
      const d = new Date(p.createdAt);
      return d.getFullYear() === pos.year && d.getMonth() === pos.month;
    });
  }, [records, todayMode, pos, today]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    return [...inPeriod]
      .filter((p) => matchesFilter(p, filter))
      .filter((p) => {
        if (!q) return true;
        const phone = phoneById.get(p.memberId) ?? '';
        const nameMatch = p.memberName.toLowerCase().includes(q);
        const idMatch = digits.length > 0 && p.memberId.includes(digits);
        const phoneMatch = digits.length > 0 && phone.replace(/\D/g, '').includes(digits);
        const phoneTextMatch = phone.replace(/\s/g, '').toLowerCase().includes(q.replace(/\s/g, ''));
        // The reference stays searchable as a practical desk extra.
        const utrMatch = (p.utr ?? '').toLowerCase().includes(q);
        return nameMatch || idMatch || phoneMatch || phoneTextMatch || utrMatch;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [inPeriod, filter, query, phoneById]);

  // The financial summary is MONTH-LEVEL and independent of search and
  // filters — a reliable month total (the list above can be narrowed).
  const totals = useMemo(
    () => monthPaymentTotals(records, pos.year, pos.month),
    [records, pos],
  );

  const periodLabel = todayMode
    ? `Today · ${formatDate(today)}`
    : `${MONTH_NAMES[pos.month]} ${pos.year}`;
  const filtersActive = filter !== 'all' || query.trim().length > 0;

  const goToday = () => {
    setTodayMode(true);
    setYearMonth(null);
  };

  const resetFilters = () => {
    setQuery('');
    setFilter('all');
  };

  const detailRow = (label: string, value: string, strong = false) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', minHeight: 30, alignItems: 'center' }}>
      <AppText variant="label" style={{ color: colors.ownerInkMuted }}>
        {label}
      </AppText>
      <AppText variant={strong ? 'bodyStrong' : 'label'} style={{ color: strong ? colors.ownerAccentDeep : colors.ownerInk, fontWeight: strong ? '600' : '500' }} numberOfLines={1}>
        {value}
      </AppText>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <WorkspaceScreen
        title="Transaction History"
        eyebrow="Payments"
        subtitle="Every recorded entry, pending and verified"
        demo={!live}
        actions={<SignOut />}
        refreshControl={<DataRefreshControl refreshing={liveLoading} onRefresh={refreshAll} />}>
        {hasError && (
          <RiseIn>
            <ErrorState
              title="Transaction history could not load"
              message={
                paymentsResource.error ??
                membersResource.error ??
                plansResource.error ??
                'The payment register is unavailable right now.'
              }
              onRetry={refreshAll}
            />
          </RiseIn>
        )}
        {live && paymentsResource.status === 'loading' && records.length === 0 ? (
          <RiseIn style={{ marginTop: spacing.sm }}>
            <SkeletonRow count={4} />
          </RiseIn>
        ) : null}
        {/* Period: today by default; chevrons browse months, the label opens
            the month/year picker. The selected period is always visible. */}
        <RiseIn>
          <WorkspaceSection title="Period" action={todayMode ? undefined : <Button label="Show today" size="small" variant="secondary" icon="today-outline" onPress={goToday} />}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
              <PressSurface
                accessibilityRole="button"
                accessibilityLabel="Previous month"
                accessibilityHint={`Show ${MONTH_NAMES[(pos.month + 11) % 12]}`}
                onPress={() => {
                  const next = addMonth(pos, -1);
                  setYearMonth(next);
                  setTodayMode(false);
                  setOpenId(null);
                }}
                hitPadding={6}>
                <View accessible={false} style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="chevron-back" size={20} color={colors.ownerInk} />
                </View>
              </PressSurface>
              <PressSurface
                accessibilityRole="button"
                accessibilityLabel={`Change period, currently ${todayMode ? 'today' : `${MONTH_NAMES[pos.month]} ${pos.year}`}`}
                accessibilityHint="Opens the month and year picker"
                onPress={() => setPickerOpen(true)}
                hitPadding={6}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing['3xs'],
                  paddingHorizontal: spacing.sm,
                  paddingVertical: spacing['3xs'],
                  borderRadius: tokens.radius.sm,
                }}>
                <AppText variant="heading" style={{ color: colors.ownerInk }}>{todayMode ? `Today · ${formatDate(today)}` : `${MONTH_NAMES[pos.month]} ${pos.year}`}</AppText>
                <Ionicons name="chevron-down" size={16} color={colors.ownerInkMuted} />
              </PressSurface>
              <PressSurface
                accessibilityRole="button"
                accessibilityLabel="Next month"
                accessibilityHint={`Show ${MONTH_NAMES[(pos.month + 1) % 12]}`}
                onPress={() => {
                  const next = addMonth(pos, 1);
                  setYearMonth(next);
                  setTodayMode(false);
                  setOpenId(null);
                }}
                hitPadding={6}>
                <View accessible={false} style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="chevron-forward" size={20} color={colors.ownerInk} />
                </View>
              </PressSurface>
            </View>
            <AppText variant="caption" style={{ color: colors.ownerInkSubtle, marginTop: spacing.xs }}>
              {todayMode
                ? `Showing today's transactions · ${pluralise(inPeriod.length, 'transaction', 'transactions')} recorded today.`
                : `Showing every ${MONTH_NAMES[pos.month]} ${pos.year} transaction · ${pluralise(inPeriod.length, 'transaction', 'transactions')} in the month.`}
            </AppText>
          </WorkspaceSection>
        </RiseIn>

        {/* Search and filters — they combine with the selected period */}
        <RiseIn index={1} style={{ marginTop: spacing.sm }}>
          <WorkspaceSection title="Search and filters">
            <SearchBar
              label="Search by member name, phone or member ID"
              value={query}
              onChange={setQuery}
              placeholder="Name, phone or member number"
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm }}>
              {FILTERS.map((f) => (
                <FilterChip
                  key={f.key}
                  label={f.label}
                  variant="owner"
                  selected={filter === f.key}
                  onPress={() => setFilter(f.key)}
                />
              ))}
              {filtersActive && (
                <FilterChip
                  label="Reset filters"
                  variant="owner"
                  onPress={resetFilters}
                  icon={<AnimatedIcon name="close" size={16} color={colors.ownerInkMuted} />}
                />
              )}
            </View>
          </WorkspaceSection>
        </RiseIn>

        {/* The register list — every row shows the record's real fields */}
        <RiseIn index={2} style={{ marginTop: spacing.sm }}>
          <WorkspaceSection title={`${periodLabel} — ${pluralise(rows.length, 'matching transaction', 'matching transactions')}`}>
            {live && (actionError || actionNotice) ? (
              <View style={{ marginBottom: spacing.sm }}>
                {actionError ? (
                  <AppText variant="label" style={{ color: colors.dangerStrong }}>
                    The server refused the action: {actionError}
                  </AppText>
                ) : null}
                {actionNotice ? (
                  <AppText variant="label" style={{ color: colors.ownerSuccessDeep }}>
                    {actionNotice}
                  </AppText>
                ) : null}
              </View>
            ) : null}
            {inPeriod.length === 0 ? (
              <OwnerEmptyState
                icon="receipt-outline"
                title={todayMode ? 'No transactions today' : `No transactions in ${MONTH_NAMES[pos.month]} ${pos.year}`}
                hint="The register shows only actual records — months without transactions stay empty."
              />
            ) : rows.length === 0 ? (
              <OwnerEmptyState
                icon="search-outline"
                title="No matching transactions"
                hint="Nothing in this period matches the search and filters together."
                actionLabel="Reset filters"
                onAction={resetFilters}
              />
            ) : (
              <OwnerListGroup label={`${pluralise(rows.length, 'transaction', 'transactions')}`}>
                {rows.map((p, rowIndex) => {
                  const status = paymentStatusInfo(p.state);
                  const isOpen = p.id === openId;
                  const planName = planById.get(p.planId) ?? p.planId;
                  const isReversal = p.entryType === 'reversal';
                  const remaining = remainingFor(p);
                  const canDecide = live && p.state === 'awaitingVerification' && !isReversal;
                  const canReverse = live && p.state === 'verified' && !isReversal && remaining > 0;
                  return (
                    <View key={p.id}>
                      {rowIndex > 0 && <WorkspaceRowDivider />}
                      <OwnerListRow
                        leading={<OwnerMemberAvatar name={p.memberName} />}
                        title={
                          isReversal
                            ? `Reversal · ${p.memberName} · ${formatCurrency(p.payable)}`
                            : `${p.memberName} · ${formatCurrency(p.payable)}`
                        }
                        detail={`${formatDate(p.createdAt)} · ${formatTime(p.createdAt)} · ${p.method.toUpperCase()} · ${memberDisplayId(p.memberId)}`}
                        status={
                          isReversal
                            ? <OwnerStatusText label="Reversal" tone="action" />
                            : <OwnerStatusText {...status} />
                        }
                        chevron
                        onPress={() => setOpenId(isOpen ? null : p.id)}
                      />
                      {/* Expanded details — only real stored fields, with an
                          honest fallback for anything missing */}
                      {isOpen && (
                        <View style={{ paddingBottom: spacing.sm }}>
                          {/* Flat inset well — not a second elevated card.
                              The group card already carries the border and
                              lift; nesting another card on it produced the
                              doubled card effect. */}
                          <OwnerWell>
                            {detailRow('Plan', planName)}
                            {detailRow('Original amount', formatCurrency(p.originalPrice))}
                            {detailRow('Discount', p.discountPct > 0 ? `${p.discountPct}% off` : 'None')}
                            {detailRow('Final amount', formatCurrency(p.payable), true)}
                            {detailRow('Method', p.method === 'upi' ? 'UPI' : 'Cash')}
                            {detailRow('Recorded', `${formatDate(p.createdAt)} · ${formatTime(p.createdAt)}`)}
                            {detailRow('Reference', p.utr ?? 'No reference on record')}
                            {detailRow('Status', status.label)}
                            {isReversal
                              ? detailRow(
                                  'Reverses',
                                  p.reversalOf ? `Payment ${p.reversalOf.slice(0, 8)}…` : 'Original payment',
                                )
                              : null}
                            {!isReversal && p.state === 'verified' && reversedByOriginal.has(p.id)
                              ? detailRow('Reversed', `${formatCurrency(reversedByOriginal.get(p.id) ?? 0)} of ${formatCurrency(p.payable)}`)
                              : null}
                            {p.verifiedBy ? detailRow('Checked by', p.verifiedBy) : null}
                            {p.verifiedAt
                              ? detailRow('Checked', `${formatDate(p.verifiedAt)} · ${formatTime(p.verifiedAt)}`)
                              : null}
                            {detailRow('Receipt', p.receiptIssued ? 'Issued' : 'Not issued')}
                            {p.note ? (
                              <AppText variant="caption" style={{ color: colors.ownerInkMuted, marginTop: spacing.xs }}>
                                {p.note}
                              </AppText>
                            ) : null}

                            {/* Verify / reject — server-authoritative. The
                                server refuses self-verification, so the
                                control is not offered in that case. */}
                            {canDecide && (
                              <View style={{ marginTop: spacing.sm }}>
                                {selfRecorded(p) ? (
                                  <AppText variant="caption" style={{ color: colors.ownerWarningDeep }}>
                                    You recorded this entry. A different receptionist must verify or reject it — the server refuses self-verification.
                                  </AppText>
                                ) : (
                                  <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                                    <Button
                                      label={actionBusy === p.id ? 'Verifying…' : 'Verify payment'}
                                      icon="shield-checkmark-outline"
                                      size="small"
                                      disabled={actionBusy !== null}
                                      onPress={() => {
                                        void handleVerify(p);
                                      }}
                                    />
                                    <Button
                                      label={actionBusy === p.id ? 'Rejecting…' : 'Reject'}
                                      variant="secondary"
                                      size="small"
                                      disabled={actionBusy !== null}
                                      onPress={() => {
                                        void handleReject(p);
                                      }}
                                    />
                                  </View>
                                )}
                                <AppText variant="caption" style={{ color: colors.ownerInkSubtle, marginTop: spacing['3xs'] }}>
                                  Verification also requires a multi-factor (AAL2) session; the server enforces it.
                                </AppText>
                              </View>
                            )}

                            {/* Reversal — a new verified row, capped by the
                                remaining amount, never an edit. */}
                            {canReverse && (
                              <View style={{ marginTop: spacing.sm }}>
                                {reversalBlocked(p) ? (
                                  <AppText variant="caption" style={{ color: colors.ownerWarningDeep }}>
                                    You recorded or verified this payment. A different receptionist must record any reversal — the server refuses self-reversal.
                                  </AppText>
                                ) : (
                                  <>
                                    <Button
                                      label="Record reversal"
                                      icon="return-down-back-outline"
                                      size="small"
                                      variant="secondary"
                                      disabled={actionBusy !== null}
                                      onPress={() => openReversal(p)}
                                    />
                                    <AppText variant="caption" style={{ color: colors.ownerInkSubtle, marginTop: spacing['3xs'] }}>
                                      Up to {formatCurrency(remaining)} remains reversible. A reversal is a new verified record and never edits this payment.
                                    </AppText>
                                  </>
                                )}
                              </View>
                            )}
                          </OwnerWell>
                        </View>
                      )}
                    </View>
                  );
                })}
              </OwnerListGroup>
            )}
          </WorkspaceSection>
        </RiseIn>

        {/* Month-level financial summary — independent of search and filters */}
        <RiseIn index={3} style={{ marginTop: spacing.md }}>
          <WorkspaceSection title={`${MONTH_NAMES[pos.month]} ${pos.year} financial summary`}>
            <StatRow>
              <OwnerStatTile
                label="Verified UPI"
                value={formatCurrency(totals.verifiedUpi)}
                count={totals.verifiedUpi}
                countCurrency
                hint="Collected — verified entries only"
                icon="card-outline"
                tone="blue"
              />
              <OwnerStatTile
                label="Verified cash"
                value={formatCurrency(totals.verifiedCash)}
                count={totals.verifiedCash}
                countCurrency
                hint="Collected — verified entries only"
                icon="cash-outline"
                tone="cyan"
              />
            </StatRow>
            <StatRow>
              <OwnerStatTile
                label="Total verified"
                value={formatCurrency(totals.totalVerified)}
                count={totals.totalVerified}
                countCurrency
                hint="Collected revenue after reversals"
                icon="shield-checkmark-outline"
                tone="mint"
              />
              <OwnerStatTile
                label="Pending amount"
                value={formatCurrency(totals.pendingAmount)}
                count={totals.pendingAmount}
                countCurrency
                hint="Awaiting verification — never revenue"
                icon="hourglass-outline"
                tone="amber"
              />
            </StatRow>
            <StatRow>
              <OwnerStatTile
                label="Pending entries"
                value={String(totals.pendingCount)}
                count={totals.pendingCount}
                hint="Not verified — not revenue"
                icon="hourglass-outline"
                tone="amber"
              />
              <OwnerStatTile
                label="Total transactions"
                value={String(totals.totalCount)}
                count={totals.totalCount}
                hint="Every record in the month, any state"
                icon="receipt-outline"
                tone="violet"
              />
            </StatRow>
            <StatRow>
              <OwnerStatTile
                label="Reversal amount"
                value={formatCurrency(totals.reversalAmount)}
                count={totals.reversalAmount}
                countCurrency
                hint="Deducted — never revenue"
                icon="return-down-back-outline"
                tone="red"
              />
              <OwnerStatTile
                label="Reversal entries"
                value={String(totals.reversalCount)}
                count={totals.reversalCount}
                hint="Verified rows in this month"
                icon="return-down-back-outline"
                tone="red"
              />
            </StatRow>
            <AppText variant="caption" style={{ color: colors.ownerInkSubtle, marginTop: spacing.xs }}>
              {MONTH_NAMES[pos.month]} {pos.year} totals from every record in the month — search and filters apply to the list above, never to this summary. Only verified entries count as collected revenue; verified reversals are deducted from the month they were recorded in and are never revenue; a recorded UTR alone never verifies a payment; pending is reported separately and is never revenue; nothing is counted twice.
            </AppText>
          </WorkspaceSection>
        </RiseIn>

        <RiseIn index={4} style={{ marginTop: spacing.md }}>
          <WorkspaceWell>
            <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
              {live
                ? 'Showing the payment records your signed-in staff role is authorised to read. Verify and reject call the server authority functions (self-verification is refused); reversals are new verified rows capped by the remaining amount and never edit the original. Only verified entries count as collected revenue; a recorded UTR alone never verifies a payment; pending is reported separately and is never revenue. Phone search matches the members’ recorded phone numbers; transaction records themselves carry no phone field.'
                : 'Entries recorded at the desk live in the session and reset when the app restarts — nothing here is saved to a database or server. Phone search matches the members’ recorded phone numbers; transaction records themselves carry no phone field.'}{' '}
              {totals.totalCount === 0 ? `${MONTH_NAMES[pos.month]} ${pos.year} has no recorded transactions yet.` : ''}
            </AppText>
          </WorkspaceWell>
        </RiseIn>
      </WorkspaceScreen>

      {/* Month/year picker — months across the browsable years */}
      <ModalSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Select month and year"
        subtitle="Browses the register and the month summary">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          {MONTH_NAMES.map((m, i) => (
            <Button
              key={m}
              label={m.slice(0, 3)}
              size="small"
              variant={i === pos.month ? 'primary' : 'secondary'}
              onPress={() => {
                setYearMonth({ year: pos.year, month: i });
                setTodayMode(false);
                setOpenId(null);
                setPickerOpen(false);
              }}
            />
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm }}>
          {years.map((y) => (
            <Button
              key={y}
              label={String(y)}
              size="small"
              variant={y === pos.year ? 'primary' : 'secondary'}
              onPress={() => {
                setYearMonth({ year: y, month: pos.month });
                setTodayMode(false);
                setOpenId(null);
                setPickerOpen(false);
              }}
            />
          ))}
        </View>
        <AppText variant="caption" style={{ color: colors.ownerInkSubtle, marginTop: spacing.xs }}>
          The range covers the current year and the years that hold records; months without transactions show empty — nothing is generated.
        </AppText>
      </ModalSheet>

      {/* Reversal form — the server caps the amount by the remaining payable
          and refuses a reversal by the person who recorded or verified the
          original. This sheet only collects the input. */}
      <ModalSheet
        visible={reversalFor !== null}
        onClose={closeReversal}
        title="Record reversal"
        subtitle="Creates a new verified reversal row; the original payment is never edited">
        {reversalFor ? (
          <View style={{ gap: spacing.sm }}>
            <AppText variant="bodyStrong" style={{ color: colors.ink }}>
              {reversalFor.memberName} · {formatCurrency(reversalFor.payable)}
            </AppText>
            <AppText variant="caption" style={{ color: colors.inkMuted }}>
              Recorded {formatDate(reversalFor.createdAt)} · {reversalFor.method.toUpperCase()} · remaining{' '}
              {formatCurrency(remainingFor(reversalFor))}
            </AppText>
            <TextField
              label="Amount (whole rupees)"
              placeholder="0"
              keyboardType="number-pad"
              inputMode="numeric"
              value={reversalAmount}
              onChangeText={(value) => {
                setReversalAmount(value);
                setReversalError(null);
              }}
              error={reversalError}
            />
            <TextField
              label="Note (optional)"
              placeholder="Reason for the reversal"
              value={reversalNote}
              onChangeText={setReversalNote}
            />
            <AppText variant="caption" style={{ color: colors.inkMuted }}>
              A reversal is a separate verified record, counts as a deduction in the month it is
              recorded, and never changes the original payment. The server refuses amounts above the
              remaining payable and refuses self-reversal.
            </AppText>
            <Button
              label={actionBusy ? 'Recording…' : 'Record reversal'}
              icon="return-down-back-outline"
              fullWidth
              disabled={actionBusy !== null}
              onPress={() => {
                void submitReversal();
              }}
            />
            <Button label="Cancel" variant="secondary" fullWidth onPress={closeReversal} />
          </View>
        ) : null}
      </ModalSheet>

      <WorkspaceBottomNavigation active="more" items={navItems} />
    </View>
  );
}
