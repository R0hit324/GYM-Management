/**
 * Derive the reception desk's in-app notifications.
 *
 * Every item is computed from rows the signed-in receptionist may already
 * read through the normal data hooks — pending verifications, unissued
 * receipts, submitted applications, pending freeze requests and expiring
 * memberships. Nothing is fetched from a new source and no item claims an
 * external message was sent: delivery is not configured in this build.
 *
 * Items with a zero count are omitted, so an empty list means the desk has
 * nothing waiting rather than a list of fabricated zeros.
 */
import { useMemo } from 'react';

import { demoJoinApplications } from '@/data/demo-applications';
import { useFreezes, useJoinApplications, useMembers, usePayments } from '@/services/data';
import { displayMembershipStatus, EXPIRING_SOON_DAYS } from '@/utils/membership';
import { formatCurrency, pluralise } from '@/utils/format';
import type { InAppNotification } from '@/types/domain';

export interface ReceptionNotificationsResult {
  items: InAppNotification[];
  /** Sum of the item counts, for the bell badge. */
  total: number;
  isLive: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useReceptionNotifications(): ReceptionNotificationsResult {
  const paymentsResource = usePayments();
  const applicationsResource = useJoinApplications();
  const freezesResource = useFreezes();
  const membersResource = useMembers();

  const isLive = paymentsResource.isLive;
  // Demo mode uses the shared demo application rows; freezes and receipt
  // flags only exist in live rows, so demo mode honestly omits them.
  const applications = useMemo(
    () => (isLive ? applicationsResource.data : demoJoinApplications),
    [isLive, applicationsResource.data],
  );
  const freezes = useMemo(
    () => (isLive ? freezesResource.data : []),
    [isLive, freezesResource.data],
  );

  const items = useMemo<InAppNotification[]>(() => {
    const list: InAppNotification[] = [];
    const payments = paymentsResource.data;

    const pendingPayments = payments.filter(
      (payment) => payment.state === 'awaitingVerification',
    );
    if (pendingPayments.length > 0) {
      const amount = pendingPayments.reduce((sum, payment) => sum + payment.payable, 0);
      list.push({
        id: 'payments-awaiting-verification',
        title: `${pluralise(pendingPayments.length, 'payment', 'payments')} awaiting verification`,
        detail: `${formatCurrency(amount)} recorded — not revenue until a different receptionist verifies`,
        href: '/(reception)/transaction-history',
        tone: 'warning',
        count: pendingPayments.length,
      });
    }

    const unissuedReceipts = payments.filter(
      (payment) =>
        payment.state === 'verified' &&
        payment.entryType !== 'reversal' &&
        !payment.receiptIssued,
    );
    if (unissuedReceipts.length > 0) {
      list.push({
        id: 'receipts-unissued',
        title: `${pluralise(unissuedReceipts.length, 'verified payment', 'verified payments')} without a receipt`,
        detail: 'Issue the receipt flag from the transaction details',
        href: '/(reception)/transaction-history',
        tone: 'info',
        count: unissuedReceipts.length,
      });
    }

    const submitted = applications.filter((application) => application.state === 'submitted');
    if (submitted.length > 0) {
      list.push({
        id: 'applications-submitted',
        title: `${pluralise(submitted.length, 'join application', 'join applications')} awaiting a decision`,
        detail: 'Review the submitted applications in the desk queue',
        href: '/(reception)/applications',
        tone: 'info',
        count: submitted.length,
      });
    }

    const pendingFreezes = freezes.filter((freeze) => freeze.state === 'pending');
    if (pendingFreezes.length > 0) {
      list.push({
        id: 'freezes-pending',
        title: `${pluralise(pendingFreezes.length, 'freeze request', 'freeze requests')} awaiting a decision`,
        detail: 'Approve or reject from the freeze book',
        href: '/(reception)/freeze',
        tone: 'warning',
        count: pendingFreezes.length,
      });
    }

    const expiring = membersResource.data.filter(
      (member) => displayMembershipStatus(member) === 'expiring',
    );
    if (expiring.length > 0) {
      list.push({
        id: 'memberships-expiring',
        title: `${pluralise(expiring.length, 'membership', 'memberships')} expiring in ${EXPIRING_SOON_DAYS} days`,
        detail: 'Reach out before the end date',
        href: '/(reception)/renewals',
        tone: 'warning',
        count: expiring.length,
      });
    }

    return list;
  }, [applications, freezes, membersResource.data, paymentsResource.data]);

  const total = items.reduce((sum, item) => sum + item.count, 0);

  const loading =
    isLive &&
    (paymentsResource.status === 'loading' ||
      applicationsResource.status === 'loading' ||
      freezesResource.status === 'loading' ||
      membersResource.status === 'loading');

  const error =
    paymentsResource.error ??
    applicationsResource.error ??
    freezesResource.error ??
    membersResource.error ??
    null;

  const refresh = () => {
    paymentsResource.refresh();
    applicationsResource.refresh();
    freezesResource.refresh();
    membersResource.refresh();
  };

  return { items, total, isLive, loading, error, refresh };
}
