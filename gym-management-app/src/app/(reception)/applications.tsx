/**
 * Join applications — the desk's review queue.
 *
 * The member app submits a join application; only a receptionist may decide
 * it. Approval calls `decide_application`, which creates the member record
 * from the stored application. The caller never supplies prices, verification
 * flags or a role, and membership does not activate until a payment is
 * verified — the same rule as every other join path.
 *
 * Data honesty: live mode reads the application rows the signed-in role may
 * select and shows the server's refusal verbatim. Demo mode keeps a small
 * labelled example queue; its decisions are staged in this screen's state and
 * explicitly claim nothing was written to a server.
 */
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { StatRow } from '@/components/ui/stat-tile';
import { ModalSheet } from '@/components/ui/modal-sheet';
import { SuccessPop } from '@/components/ui/motion';
import { RiseIn } from '@/components/ui/rise-in';
import { SignOut } from '@/components/workspace-meta';
import {
  WorkspaceScreen,
  WorkspaceBottomNavigation,
  WorkspaceSection,
  WorkspaceWell,
} from '@/components/workspace/workspace-ui';
import {
  OwnerStatTile,
  OwnerListGroup,
  OwnerListRow,
  OwnerMemberAvatar,
  OwnerStatusText,
  OwnerEmptyState,
} from '@/components/owner/owner-ui';
import { DataRefreshControl, ErrorState, SkeletonRow } from '@/components/ui/feedback';
import { useTokens } from '@/hooks/use-tokens';
import { demoJoinApplications } from '@/data/demo-applications';
import { useJoinApplications, usePlans, decideApplication } from '@/services/data';
import { formatDate } from '@/utils/format';
import type { ApplicationState, JoinApplication } from '@/types/domain';

const navItems = [
  { key: 'home', label: 'Home', icon: 'home-outline', href: '/(reception)/home' },
  { key: 'members', label: 'Members', icon: 'people-outline', href: '/(reception)/members' },
  { key: 'more', label: 'More', icon: 'apps-outline', href: '/(reception)/more' },
] as const;

const stateLabel: Record<ApplicationState, string> = {
  draft: 'Draft',
  pendingVerification: 'Verification pending',
  submitted: 'Submitted',
  approved: 'Approved',
  rejected: 'Rejected',
};

function stateTone(state: ApplicationState): 'up' | 'down' | 'neutral' | 'warning' | 'action' {
  if (state === 'approved') return 'up';
  if (state === 'rejected') return 'down';
  if (state === 'submitted') return 'warning';
  if (state === 'pendingVerification') return 'action';
  return 'neutral';
}

/** Demo-only example queue; the live screen reads the authorised rows. */

export default function ReceptionApplicationsScreen() {
  const tokens = useTokens();
  const { colors, spacing } = tokens;

  const applicationsResource = useJoinApplications();
  const plansResource = usePlans();
  const live = applicationsResource.isLive;

  const [demoDecisions, setDemoDecisions] = useState<Record<string, 'approved' | 'rejected'>>({});
  const [decision, setDecision] = useState<{ application: JoinApplication; approve: boolean } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [doneOpen, setDoneOpen] = useState(false);

  const loading = applicationsResource.status === 'loading' || plansResource.status === 'loading';
  const hasError = applicationsResource.status === 'error' || plansResource.status === 'error';

  const refreshAll = () => {
    applicationsResource.refresh();
    plansResource.refresh();
  };

  const planNames = useMemo(
    () => new Map(plansResource.data.map((plan) => [plan.id, plan.name] as const)),
    [plansResource.data],
  );

  const applications = useMemo<JoinApplication[]>(() => {
    if (live) return applicationsResource.data;
    return demoJoinApplications.map((application) =>
      demoDecisions[application.id]
        ? { ...application, state: demoDecisions[application.id] }
        : application,
    );
  }, [live, applicationsResource.data, demoDecisions]);

  const queue = applications.filter((application) => application.state === 'submitted');
  const decided = applications.filter(
    (application) => application.state === 'approved' || application.state === 'rejected',
  );
  const other = applications.filter(
    (application) =>
      application.state === 'draft' || application.state === 'pendingVerification',
  );

  const openDecision = (application: JoinApplication, approve: boolean) => {
    setActionError(null);
    setNotice(null);
    setDecision({ application, approve });
  };

  const closeDecision = () => {
    if (busy) return;
    setDecision(null);
  };

  const confirmDecision = async () => {
    if (!decision || busy) return;
    const { application, approve } = decision;
    setActionError(null);

    if (!live) {
      setDemoDecisions((prev) => ({
        ...prev,
        [application.id]: approve ? 'approved' : 'rejected',
      }));
      setDecision(null);
      setNotice(
        approve
          ? `${application.fullName}'s application was approved for this session only — no member record was created.`
          : `${application.fullName}'s application was rejected for this session only — nothing was written to a server.`,
      );
      return;
    }

    setBusy(true);
    const outcome = await decideApplication(application.id, approve);
    setBusy(false);
    if (!outcome.ok) {
      setActionError(outcome.error);
      return;
    }
    setDecision(null);
    setDoneOpen(true);
    setNotice(
      approve
        ? `${application.fullName} was added as a member. Membership activates when their first payment is verified; no price or plan was set by this screen.`
        : `${application.fullName}'s application was rejected. No member record was created.`,
    );
    refreshAll();
  };

  return (
    <View style={{ flex: 1 }}>
      <WorkspaceScreen
        title="Join applications"
        eyebrow="Members"
        subtitle={live ? 'Submitted applications awaiting a decision' : 'Demo review queue'}
        demo={!live}
        actions={<SignOut />}
        refreshControl={<DataRefreshControl refreshing={loading} onRefresh={refreshAll} />}>
        {hasError && (
          <RiseIn>
            <ErrorState
              title="Applications could not load"
              message={
                applicationsResource.error ??
                plansResource.error ??
                'The application queue is unavailable right now.'
              }
              onRetry={refreshAll}
            />
          </RiseIn>
        )}
        {live && loading && applications.length === 0 ? (
          <RiseIn style={{ marginTop: spacing.sm }}>
            <SkeletonRow count={3} />
          </RiseIn>
        ) : null}

        <RiseIn>
          <WorkspaceWell>
            <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
              {live
                ? 'Approving an application creates the member record on the server from the stored application. Membership still activates only when a payment is verified — the approval never sets a price, locks a price or marks a payment received.'
                : 'This demo queue is illustrative. Decisions change only this screen for the session; no member record, payment or server state is written.'}
            </AppText>
          </WorkspaceWell>
        </RiseIn>

        <RiseIn index={1} style={{ marginTop: spacing.sm }}>
          <StatRow>
            <OwnerStatTile
              label="Awaiting decision"
              value={String(queue.length)}
              count={queue.length}
              hint="Submitted applications"
              icon="hourglass-outline"
              tone="amber"
            />
            <OwnerStatTile
              label="Decided"
              value={String(decided.length)}
              count={decided.length}
              hint="Approved or rejected"
              icon="checkmark-done-outline"
              tone="mint"
            />
          </StatRow>
        </RiseIn>

        {(actionError || notice) && (
          <RiseIn index={2} style={{ marginTop: spacing.sm }}>
            {actionError ? (
              <AppText variant="label" style={{ color: colors.dangerStrong }}>
                The server refused the decision: {actionError}
              </AppText>
            ) : null}
            {notice ? (
              <AppText variant="label" style={{ color: colors.ownerSuccessDeep }}>
                {notice}
              </AppText>
            ) : null}
          </RiseIn>
        )}

        <RiseIn index={3} style={{ marginTop: spacing.sm }}>
          <WorkspaceSection
            title={`Awaiting decision — ${queue.length === 1 ? '1 application' : `${queue.length} applications`}`}>
            {queue.length === 0 ? (
              <OwnerEmptyState
                icon="file-tray-outline"
                title="No applications waiting"
                hint="A submitted join application appears here for review; drafts and unverified applications do not."
              />
            ) : (
              <OwnerListGroup>
                {queue.map((application) => {
                  const planName = planNames.get(application.planId) ?? application.planId;
                  const reached = [
                    application.phoneVerified ? 'phone verified' : 'phone not verified',
                    application.emailVerified ? 'email verified' : 'email not verified',
                  ].join(' · ');
                  return (
                    <View key={application.id} style={{ gap: spacing.xs }}>
                      <OwnerListRow
                        leading={<OwnerMemberAvatar name={application.fullName} />}
                        title={application.fullName}
                        detail={`${planName} · ${formatDate(application.createdAt)}`}
                        status={<OwnerStatusText label="Submitted" tone="warning" />}
                        meta={
                          <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
                            {application.phone} · {application.email}
                          </AppText>
                        }
                      />
                      <AppText variant="caption" style={{ color: colors.ownerInkSubtle }}>
                        {reached}
                      </AppText>
                      <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                        <Button
                          label="Approve"
                          icon="checkmark-outline"
                          size="small"
                          onPress={() => openDecision(application, true)}
                        />
                        <Button
                          label="Reject"
                          variant="secondary"
                          size="small"
                          onPress={() => openDecision(application, false)}
                        />
                      </View>
                    </View>
                  );
                })}
              </OwnerListGroup>
            )}
          </WorkspaceSection>
        </RiseIn>

        <RiseIn index={4} style={{ marginTop: spacing.sm }}>
          <WorkspaceSection title="Decided applications">
            {decided.length === 0 ? (
              <OwnerEmptyState
                icon="time-outline"
                title="No decisions yet"
                hint="Approved and rejected applications stay on record here."
              />
            ) : (
              <OwnerListGroup>
                {decided.map((application) => {
                  const planName = planNames.get(application.planId) ?? application.planId;
                  return (
                    <OwnerListRow
                      key={application.id}
                      leading={<OwnerMemberAvatar name={application.fullName} />}
                      title={application.fullName}
                      detail={`${planName} · ${formatDate(application.createdAt)}`}
                      status={
                        <OwnerStatusText
                          label={stateLabel[application.state]}
                          tone={stateTone(application.state)}
                        />
                      }
                    />
                  );
                })}
              </OwnerListGroup>
            )}
          </WorkspaceSection>
        </RiseIn>

        {other.length > 0 && (
          <RiseIn index={5} style={{ marginTop: spacing.sm }}>
            <WorkspaceSection title="Not yet submitted">
              <OwnerListGroup>
                {other.map((application) => (
                  <OwnerListRow
                    key={application.id}
                    leading={<OwnerMemberAvatar name={application.fullName} />}
                    title={application.fullName}
                    detail={`${planNames.get(application.planId) ?? application.planId} · ${formatDate(application.createdAt)}`}
                    status={
                      <OwnerStatusText
                        label={stateLabel[application.state]}
                        tone={stateTone(application.state)}
                      />
                    }
                  />
                ))}
              </OwnerListGroup>
              <AppText variant="caption" style={{ color: colors.ownerInkSubtle, marginTop: spacing.xs }}>
                An application can only be decided once it is submitted; drafts and unverified
                applications are listed for completeness and have no decision control.
              </AppText>
            </WorkspaceSection>
          </RiseIn>
        )}

        <RiseIn index={6} style={{ marginTop: spacing.md }}>
          <WorkspaceWell>
            <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
              Decisions require a receptionist session with a multi-factor (AAL2) session; the server
              enforces the role and the session level, refuses a second decision on the same
              application, and records the actor in the audit trail.
            </AppText>
          </WorkspaceWell>
        </RiseIn>
      </WorkspaceScreen>

      <ModalSheet
        visible={decision !== null}
        onClose={closeDecision}
        title={decision?.approve ? 'Approve application' : 'Reject application'}
        subtitle={decision?.application.fullName}>
        {decision ? (
          <View style={{ gap: spacing.sm }}>
            <AppText variant="body" style={{ color: colors.ownerInk }}>
              {decision.approve
                ? 'Approving creates the member record from this application. Membership activates when the first payment is verified — no price is set or locked here.'
                : 'Rejecting closes the application without creating a member record. It stays on record with the decision.'}
            </AppText>
            <AppText variant="caption" style={{ color: colors.ownerInkSubtle }}>
              {decision.application.phoneVerified && decision.application.emailVerified
                ? 'Phone and email are recorded as verified on the application.'
                : 'One or more contact checks are not verified on this application; the server records the decision as given.'}
            </AppText>
            {actionError ? (
              <AppText variant="caption" style={{ color: colors.dangerStrong }}>
                {actionError}
              </AppText>
            ) : null}
            <Button
              label={
                busy
                  ? 'Recording…'
                  : decision.approve
                    ? 'Approve and create member'
                    : 'Reject application'
              }
              fullWidth
              variant={decision.approve ? 'primary' : 'secondary'}
              disabled={busy}
              onPress={() => void confirmDecision()}
            />
            <Button label="Cancel" variant="secondary" fullWidth disabled={busy} onPress={closeDecision} />
            <AppText variant="caption" style={{ color: colors.ownerInkSubtle }}>
              {live
                ? 'The server enforces the receptionist role, the decision state and the audit entry.'
                : 'This demo changes only this screen for the session — nothing is saved.'}
            </AppText>
          </View>
        ) : null}
      </ModalSheet>

      <ModalSheet
        visible={doneOpen}
        onClose={() => setDoneOpen(false)}
        title="Decision recorded"
        subtitle="Applied by the server">
        <View style={{ alignItems: 'center', marginBottom: spacing.sm }}>
          <SuccessPop size={54} color={colors.success} />
        </View>
        <AppText variant="body" style={{ color: colors.ownerInk }}>
          {notice ?? 'The decision was recorded on the server.'}
        </AppText>
        <View style={{ marginTop: spacing.sm }}>
          <Button label="Close" variant="secondary" fullWidth onPress={() => setDoneOpen(false)} />
        </View>
      </ModalSheet>

      <WorkspaceBottomNavigation active="members" items={navItems} />
    </View>
  );
}
