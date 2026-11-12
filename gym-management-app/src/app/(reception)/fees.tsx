/**
 * Screen 5 — Fees entry (receptionist).
 *
 * Full payment only: no partial amounts are representable. Verification of
 * money happens at the UPI statement / server in Part 4 — a submitted UTR or
 * screenshot never marks a payment as verified from this screen, and the
 * demo makes that stance explicit.
 */
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Screen } from '@/components/scaffold';
import { AppText } from '@/components/ui/text';
import { Button, IconButton } from '@/components/ui/button';
import { Card, Section, Divider, Well } from '@/components/ui/card';
import { StatTile, StatRow } from '@/components/ui/stat-tile';
import { StatusBadge } from '@/components/ui/status-badge';
import { TextField } from '@/components/ui/text-field';
import { SearchBar } from '@/components/ui/search-bar';
import { ListGroup, ListRow, RowDivider, MemberAvatar } from '@/components/ui/list-row';
import { EmptyState } from '@/components/ui/feedback';
import { ModalSheet } from '@/components/ui/modal-sheet';
import { QrDisplay } from '@/components/ui/qr-display';
import { PressSurface } from '@/components/ui/press-surface';
import { RiseIn } from '@/components/ui/rise-in';
import { WorkspaceMeta, SignOut } from '@/components/workspace-meta';
import { useTokens } from '@/hooks/use-tokens';
import { demoPlans, demoMembers, demoPayments, demoGymUpiId, demoGymName } from '@/data/demo';
import { formatCurrency, formatDate } from '@/utils/format';
import type { Member } from '@/types/domain';

export default function FeesEntryScreen() {
  const tokens = useTokens();
  const { colors, spacing } = tokens;

  const [query, setQuery] = useState('');
  const [memberId, setMemberId] = useState<string | null>(null);
  const [discountPct, setDiscountPct] = useState('');
  const [utr, setUtr] = useState('');
  const [method, setMethod] = useState<'upi' | 'cash'>('upi');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [upiOpen, setUpiOpen] = useState(false);
  const [recordedOpen, setRecordedOpen] = useState(false);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return demoMembers.filter((m) => m.name.toLowerCase().includes(q) || m.id.replace('m-', '').includes(q));
  }, [query]);

  const member: Member | null = demoMembers.find((m) => m.id === memberId) ?? null;
  const plan = member ? demoPlans.find((p) => p.id === member.planId) ?? null : null;
  const original = member ? member.priceLocked : 0; // existing subscriptions keep their agreed price
  const discount = Math.max(0, Math.min(50, Number(discountPct) || 0));
  const payable = Math.round(original * (1 - discount / 100));
  const invalidDiscount = discountPct !== '' && (Number.isNaN(Number(discountPct)) || discount !== Number(discountPct));

  const pending = demoPayments.filter((p) => p.state === 'awaitingVerification');

  const submit = () => {
    const next: Record<string, string | undefined> = {};
    if (!member) next.member = 'Select a member.';
    if (invalidDiscount) next.discount = 'Discount is a percentage, for example 10.';
    if (method === 'upi' && utr.trim().length < 6) next.utr = 'Enter the UTR or transaction reference from your UPI app.';
    setErrors(next);
    if (Object.keys(next).length === 0) {
      setRecordedOpen(true);
    }
  };

  return (
    <Screen
      title="Fees entry"
      subtitle="Full payment only, verified before membership activates"
      demo
      roleTag="reception"
      actions={<SignOut />}>
      <WorkspaceMeta role="reception" demo />

      {/* Member search */}
      <RiseIn style={{ marginTop: spacing.md }}>
        <Section title="Find the member" style={{ marginTop: 0 }}>
          <SearchBar label="Search member for payment" value={query} onChange={setQuery} placeholder="Name or member number" />
          {member && (
            <Card style={{ marginTop: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <MemberAvatar name={member.name} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'center' }}>
                    <AppText variant="bodyStrong">{member.name}</AppText>
                    <StatusBadge
                      label={member.status === 'active' ? 'Active' : member.status === 'expiring' ? 'Expiring' : member.status === 'expired' ? 'Expired' : member.status}
                      tone={member.status === 'active' ? 'success' : member.status === 'expiring' ? 'warning' : 'danger'}
                      small
                    />
                  </View>
                  <AppText variant="caption" tone="muted">
                    {member.id.replace('m-', 'GB-').toUpperCase()}
                    {member.membershipEnd ? ` · ends ${formatDate(member.membershipEnd)}` : ' · not active yet'}
                  </AppText>
                </View>
                <IconButton name="close-circle" label="Clear selected member" onPress={() => setMemberId(null)} />
              </View>
            </Card>
          )}
          {results.length > 0 && !member && (
            <View style={{ marginTop: spacing.sm }}>
              <ListGroup label="Search results">
                {results.slice(0, 4).map((m, i) => (
                  <View key={m.id}>
                    {i > 0 && <RowDivider />}
                    <ListRow
                      leading={<MemberAvatar name={m.name} />}
                      title={m.name}
                      detail={`${m.id.replace('m-', 'GB-')}`}
                      onPress={() => {
                        setMemberId(m.id);
                        setQuery('');
                      }}
                    />
                  </View>
                ))}
              </ListGroup>
            </View>
          )}
          {!member && query.length > 0 && results.length === 0 && (
            <EmptyState
              icon="search-outline"
              title="No member matches"
              hint="Members join through the online application. New applicants appear here after the owner approves them."
            />
          )}
          {errors.member && (
            <AppText variant="caption" style={{ color: colors.danger }}>
              {errors.member}
            </AppText>
          )}
        </Section>
      </RiseIn>

      {/* Amount section */}
      {member && plan && (
        <RiseIn index={1}>
          <Section title="Amount">
            <Card padded={false} style={{ overflow: 'hidden' }}>
              <View style={{ padding: spacing.md }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', minHeight: 34, alignItems: 'center' }}>
                  <AppText variant="label" tone="muted">
                    Plan
                  </AppText>
                  <AppText variant="bodyStrong">
                    {plan.name} · joined {formatDate(member.joinedOn)}
                  </AppText>
                </View>
                <Divider />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', minHeight: 34, alignItems: 'center' }}>
                  <AppText variant="label" tone="muted">
                    Agreed price (locked)
                  </AppText>
                  <AppText variant="bodyStrong">{formatCurrency(original)}</AppText>
                </View>
                <Divider />
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 58 }}>
                  <AppText variant="label" tone="muted">
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
                      error={errors.discount ?? (invalidDiscount ? 'Discount is a percentage, for example 10.' : null)}
                    />
                  </View>
                </View>
                <Divider />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', minHeight: 34, alignItems: 'center' }}>
                  <AppText variant="label" tone="muted">
                    Final payable
                  </AppText>
                  <AppText variant="figure" tone="accent">
                    {formatCurrency(payable)}
                  </AppText>
                </View>
              </View>
            </Card>
            <Well style={{ marginTop: spacing.xs }}>
              <AppText variant="caption" tone="muted">
                Discounts need the owner or receptionist authorisation and are audited. Corrections later go through reversal records, never silent edits.
              </AppText>
            </Well>
          </Section>

          {/* Payment method + proof */}
          <RiseIn index={2}>
            <Section title="Pay using">
              <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                <MethodOption
                  label="UPI"
                  selected={method === 'upi'}
                  icon="phone-portrait-outline"
                  onPress={() => setMethod('upi')}
                />
                <MethodOption
                  label="Cash"
                  selected={method === 'cash'}
                  icon="cash-outline"
                  onPress={() => setMethod('cash')}
                />
              </View>
              {method === 'upi' ? (
                <Card style={{ marginTop: spacing.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <AppText variant="bodyStrong">Gym UPI QR</AppText>
                    <Button label="Show QR" size="small" variant="secondary" icon="qr-code-outline" onPress={() => setUpiOpen(true)} />
                  </View>
                  <AppText variant="caption" tone="muted" style={{ marginTop: 2 }}>
                    Member pays {formatCurrency(payable)} into {demoGymName}&apos;s {demoGymUpiId}.
                  </AppText>
                  <View style={{ marginTop: spacing.sm }}>
                    <TextField
                      label="UTR or transaction reference"
                      placeholder="12-digit UTR from the payment app"
                      value={utr}
                      onChangeText={setUtr}
                      error={errors.utr}
                      autoCapitalize="characters"
                    />
                  </View>
                  <AppText variant="caption" tone="warning" style={{ color: colors.warning, marginTop: spacing.xs }}>
                    A submitted UTR or screenshot marks this entry from the desk for verification. It does not verify the payment. Money checks out in Part 4.
                  </AppText>
                  {/* Optional evidence upload */}
                  <Button
                    label="Attach payment evidence (optional)"
                    size="small"
                    variant="secondary"
                    icon="document-attach-outline"
                    onPress={noop}
                    style={{ marginTop: spacing.xs, alignSelf: 'flex-start' }}
                  />
                  <AppText variant="caption" tone="subtle" style={{ marginTop: 4 }}>
                    Evidence is stored privately; replacing or deleting it is restricted once submitted.
                  </AppText>
                </Card>
              ) : (
                <Well style={{ marginTop: spacing.sm }}>
                  <AppText variant="label" tone="muted">
                    Cash is counted at the desk and recorded against {formatCurrency(payable)}. The owner verifies physical collections daily in the report.
                  </AppText>
                </Well>
              )}

              <View style={{ marginTop: spacing.md, flexDirection: 'column', gap: spacing.xs }}>
                <Button label="Record payment for verification" icon="checkmark-outline" fullWidth onPress={submit} />
                <AppText variant="caption" tone="subtle" align="center">
                  Nothing is sent in this preview. Receipt is issued after verification only.
                </AppText>
              </View>
            </Section>
          </RiseIn>
        </RiseIn>
      )}

      {/* Pending verification queue */}
      <RiseIn index={5}>
        <Section title={`Awaiting verification (${pending.length})`}>
          {pending.length === 0 ? (
            <EmptyState icon="time-outline" title="Queue is clear" hint="Verified and waiting entries appear here." />
          ) : (
            <ListGroup label="Payments awaiting verification">
              {pending.map((p, i) => (
                <View key={p.id}>
                  {i > 0 && <RowDivider />}
                  <ListRow
                    leading={<MemberAvatar name={p.memberName} />}
                    title={p.memberName}
                    detail={`${p.utr ?? 'Reference pending'} · ${formatCurrency(p.payable)}`}
                    status={<StatusBadge label="Awaiting check" tone="warning" small />}
                  />
                </View>
              ))}
            </ListGroup>
          )}
          <AppText variant="caption" tone="muted" style={{ marginTop: 6 }}>
            Awaiting-check entries never activate membership and never read as verified.
          </AppText>
        </Section>
      </RiseIn>

      <RiseIn index={6}>
        <Section title="Receipt status">
          <StatRow>
            <StatTile label="Receipts issued after check" value={String(demoPayments.filter((p) => p.receiptIssued).length)} tone="success" />
            <StatTile label="Recorded for verification" value={String(demoPayments.filter((p) => !p.receiptIssued).length)} tone="muted" hint="Not yet receipts" />
          </StatRow>
        </Section>
      </RiseIn>

      {/* UPI QR sheet */}
      <ModalSheet visible={upiOpen} onClose={() => setUpiOpen(false)} title="Gym UPI QR" subtitle="One code, only at the counter" toneBadge={<StatusBadge label="Demo display" tone="warning" small />}>
        <QrDisplay
          payload={`upi://pay?pa=${demoGymUpiId}&am=${payable || 1200}&cu=INR`}
          caption={`Pays ${demoGymName}. The real gym QR comes at go-live; Amount inclusion means the desk receipt and UPI statement agree for reconciliation.`}
        />
      </ModalSheet>

      {/* Honest recording sheet */}
      <ModalSheet
        visible={recordedOpen}
        onClose={() => setRecordedOpen(false)}
        title="Recorded for verification"
        subtitle="Not verified yet">
        <AppText variant="body">
          The entry is written to the queue with {member ? formatCurrency(payable) : 'the payable amount'}, {method.toUpperCase()}
          {utr ? `, reference ${utr}` : ''}. Verification against the UPI statement happens in Part 4; only then does membership extend and the receipt print.
        </AppText>
        <AppText variant="label" tone="muted" style={{ marginTop: spacing.xs }}>
          Duplicate references are rejected server-side, and financial records are immutable once verified.
        </AppText>
        <View style={{ marginTop: spacing.sm }}>
          <Button label="Close" variant="secondary" fullWidth onPress={() => setRecordedOpen(false)} />
        </View>
      </ModalSheet>
    </Screen>
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
        borderColor: props.selected ? colors.accentDeep : colors.rule,
        backgroundColor: props.selected ? colors.accentDeep : colors.surface,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.xs,
      }}>
      <Ionicons name={props.icon} size={18} color={props.selected ? colors.accent : colors.inkMuted} />
      <AppText
        variant="label"
        style={{ color: props.selected ? colors.accentInk : colors.ink, fontWeight: props.selected ? '600' : '500' }}>
        {props.label}
      </AppText>
    </PressSurface>
  );
}

function noop() {}
