/**
 * Member payments and receipts — the member's own money, read-only.
 *
 * `useMyPayments` resolves the caller's member row and reads only that
 * member's payment rows; RLS is the gate (the query filter is defence in
 * depth). Nothing here can select another member's row, and there is no
 * write path: a member never records, verifies, reverses or issues anything.
 *
 * Only verified entries count as paid. A recorded UTR is a reference, not a
 * verification, so a pending row is shown separately. A receipt is the
 * one-way flag the desk issues on a verified row plus a PDF kept in the
 * private receipts bucket; members open it through short-lived signed URLs
 * and Storage RLS restricts every member to their own folder.
 */
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { AppText } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { RiseIn } from '@/components/ui/rise-in';
import { SignOut } from '@/components/workspace-meta';
import {
  WorkspaceScreen,
  WorkspaceCard,
  WorkspaceSection,
  WorkspaceWell,
  WorkspaceRowDivider,
} from '@/components/workspace/workspace-ui';
import {
  OwnerStatTile,
  OwnerEmptyState,
  OwnerStatusText,
} from '@/components/owner/owner-ui';
import { StatRow } from '@/components/ui/stat-tile';
import { DataRefreshControl, ErrorState, SkeletonRow } from '@/components/ui/feedback';
import { useTokens } from '@/hooks/use-tokens';
import { useMyPayments, usePlans } from '@/services/data';
import { getSupabaseClient } from '@/services/supabase/client';
import { createReceiptStorage, type ReceiptStorageClientLike } from '@/services/receipts';
import { paymentStatusInfo } from '@/utils/payment';
import { formatCurrency, formatDate, formatTime, pluralise } from '@/utils/format';
import type { PaymentRecord } from '@/types/domain';

export default function MemberPaymentsScreen() {
  const tokens = useTokens();
  const { colors, spacing } = tokens;

  const paymentsResource = useMyPayments();
  const plansResource = usePlans();
  const live = paymentsResource.isLive;
  const loading =
    paymentsResource.status === 'loading' || plansResource.status === 'loading';
  const hasError =
    paymentsResource.status === 'error' || plansResource.status === 'error';

  const planNames = useMemo(
    () => new Map(plansResource.data.map((plan) => [plan.id, plan.name] as const)),
    [plansResource.data],
  );

  const rows = useMemo(
    () =>
      [...paymentsResource.data].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [paymentsResource.data],
  );

  const [openingId, setOpeningId] = useState<string | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);

  /** Short-lived signed URL: Storage RLS permits only the member's folder. */
  const handleOpenReceipt = async (payment: PaymentRecord) => {
    if (openingId !== null || !payment.receiptPath) return;
    setReceiptError(null);
    const client = await getSupabaseClient();
    if (!client) {
      setReceiptError('Receipt storage is not configured for this build.');
      return;
    }
    setOpeningId(payment.id);
    const storage = createReceiptStorage(client as unknown as ReceiptStorageClientLike);
    const signed = await storage.createSignedUrl(payment.receiptPath);
    setOpeningId(null);
    if (!signed.ok || !signed.url) {
      setReceiptError(signed.error?.message ?? 'The receipt link could not be created.');
      return;
    }
    try {
      await WebBrowser.openBrowserAsync(signed.url);
    } catch {
      // The OS decides whether a handler exists; a failure here must surface
      // honestly rather than surface as an unhandled rejection.
      setReceiptError('The receipt could not be opened on this device.');
    }
  };

  const totals = useMemo(() => {
    let verified = 0;
    let reversals = 0;
    let pendingAmount = 0;
    let pendingCount = 0;
    for (const payment of rows) {
      if (payment.state === 'verified') {
        if (payment.entryType === 'reversal') reversals += payment.payable;
        else verified += payment.payable;
      } else if (payment.state === 'awaitingVerification') {
        pendingAmount += payment.payable;
        pendingCount += 1;
      }
    }
    return { verified, reversals, net: verified - reversals, pendingAmount, pendingCount };
  }, [rows]);

  const refreshAll = () => {
    paymentsResource.refresh();
    plansResource.refresh();
  };

  return (
    <View style={{ flex: 1 }}>
      <WorkspaceScreen
        title="Payments & receipts"
        eyebrow="Your membership"
        subtitle={live ? 'Your own records, read-only' : 'Demo records'}
        demo={!live}
        actions={<SignOut />}
        refreshControl={<DataRefreshControl refreshing={loading} onRefresh={refreshAll} />}>
        {hasError && (
          <RiseIn>
            <ErrorState
              title="Your payments could not load"
              message={
                paymentsResource.error ??
                plansResource.error ??
                'Your payment records are unavailable right now.'
              }
              onRetry={refreshAll}
            />
          </RiseIn>
        )}
        {live && loading && rows.length === 0 ? (
          <RiseIn style={{ marginTop: spacing.sm }}>
            <SkeletonRow count={3} />
          </RiseIn>
        ) : null}

        <RiseIn>
          <WorkspaceWell>
            <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
              {live
                ? 'These are the payment rows linked to your membership. Only verified entries count as paid; a reference you or the desk recorded does not verify anything by itself. The desk issues receipts; your view is read-only.'
                : 'Demo records from the approved sample ledger. Nothing here is saved, and no receipt was really issued.'}
            </AppText>
          </WorkspaceWell>
        </RiseIn>

        <RiseIn index={1} style={{ marginTop: spacing.sm }}>
          <StatRow>
            <OwnerStatTile
              label="Verified paid"
              value={formatCurrency(totals.net)}
              count={totals.net}
              countCurrency
              hint="After verified reversals"
              icon="shield-checkmark-outline"
              tone="mint"
            />
            <OwnerStatTile
              label="Pending"
              value={formatCurrency(totals.pendingAmount)}
              count={totals.pendingAmount}
              countCurrency
              hint={`${pluralise(totals.pendingCount, 'entry', 'entries')} · never counted as paid`}
              icon="hourglass-outline"
              tone="amber"
            />
          </StatRow>
        </RiseIn>

        <RiseIn index={2} style={{ marginTop: spacing.sm }}>
          <WorkspaceSection
            title={`Records — ${pluralise(rows.length, 'entry', 'entries')}`}>
            {rows.length === 0 ? (
              <OwnerEmptyState
                icon="receipt-outline"
                title="No payments yet"
                hint={
                  live
                    ? 'Your first recorded payment will appear here after the desk records it. Verification and receipts follow from the desk.'
                    : 'The demo member has no sample payment rows in this view yet.'
                }
              />
            ) : (
              <WorkspaceCard>
                {rows.map((payment, index) => {
                  const status = paymentStatusInfo(payment.state);
                  const isReversal = payment.entryType === 'reversal';
                  return (
                    <View key={payment.id}>
                      {index > 0 && <WorkspaceRowDivider />}
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                          gap: spacing.sm,
                          paddingVertical: spacing.xs,
                        }}>
                        <View style={{ flex: 1, minWidth: 0, gap: spacing['3xs'] }}>
                          <AppText variant="bodyStrong" style={{ color: colors.ownerInk }}>
                            {isReversal ? '−' : ''}
                            {formatCurrency(payment.payable)} · {payment.method.toUpperCase()}
                            {isReversal ? ' · reversal' : ''}
                          </AppText>
                          <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
                            {formatDate(payment.createdAt)} · {formatTime(payment.createdAt)} ·{' '}
                            {planNames.get(payment.planId) ?? 'Plan not on record'}
                          </AppText>
                          <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
                            Reference: {payment.utr ?? 'None recorded'}
                          </AppText>
                          <AppText variant="caption" style={{ color: colors.ownerInkSubtle }}>
                            Receipt:{' '}
                            {payment.receiptPath
                              ? 'Issued · PDF stored privately'
                              : payment.receiptIssued
                                ? 'Issued · PDF not stored'
                                : 'Not issued'}
                          </AppText>
                          {payment.receiptPath && !isReversal ? (
                            <View style={{ marginTop: spacing['3xs'] }}>
                              <Button
                                label={openingId === payment.id ? 'Opening…' : 'Open receipt PDF'}
                                icon="open-outline"
                                size="small"
                                variant="secondary"
                                disabled={openingId !== null}
                                onPress={() => {
                                  void handleOpenReceipt(payment);
                                }}
                              />
                            </View>
                          ) : null}
                        </View>
                        <OwnerStatusText {...status} />
                      </View>
                    </View>
                  );
                })}
              </WorkspaceCard>
            )}
            <AppText variant="caption" style={{ color: colors.ownerInkSubtle, marginTop: spacing.xs }}>
              {live
                ? 'A receipt PDF is stored privately when the desk issues it. Only you and authorised staff can open it, through short-lived signed links enforced by the server.'
                : 'Demo records do not issue receipts and never create a PDF.'}
            </AppText>
            {receiptError ? (
              <AppText variant="caption" style={{ color: colors.dangerStrong, marginTop: spacing.xs }}>
                {receiptError}
              </AppText>
            ) : null}
          </WorkspaceSection>
        </RiseIn>

        <RiseIn index={3} style={{ marginTop: spacing.md }}>
          <WorkspaceWell>
            <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
              Questions about a payment are handled at the reception desk. The desk can see the same
              record and, when needed, record a verified reversal; this screen never edits a payment
              or a receipt.
            </AppText>
          </WorkspaceWell>
        </RiseIn>
      </WorkspaceScreen>
    </View>
  );
}
