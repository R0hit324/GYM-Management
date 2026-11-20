/**
 * Owner join applications — a read-only view of the review queue.
 *
 * Approval belongs to the reception desk (`decide_application` is
 * receptionist-only). The owner sees the same rows the staff policy allows
 * and never gets a decision control: the server refuses the owner role, so
 * offering one here would be a lie.
 *
 * Demo mode shows the shared demo-labelled applications; live mode reads the
 * server rows. The page is bounded by the query's application limit.
 */
import { useMemo } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AppText } from '@/components/ui/text';
import { RiseIn } from '@/components/ui/rise-in';
import { SignOut } from '@/components/workspace-meta';
import {
  OwnerScreen,
  OwnerBottomNavigation,
  OwnerSection,
  OwnerListGroup,
  OwnerListRow,
  OwnerRowDivider,
  OwnerStatusText,
  OwnerMemberAvatar,
  OwnerEmptyState,
  OwnerWell,
} from '@/components/owner/owner-ui';
import { DataRefreshControl, ErrorState, SkeletonRow } from '@/components/ui/feedback';
import { useTokens } from '@/hooks/use-tokens';
import { demoJoinApplications } from '@/data/demo-applications';
import { useJoinApplications, usePlans } from '@/services/data';
import { formatDate } from '@/utils/format';
import type { ApplicationState } from '@/types/domain';

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

export default function OwnerApplicationsScreen() {
  const tokens = useTokens();
  const { colors, spacing } = tokens;

  const applicationsResource = useJoinApplications();
  const plansResource = usePlans();
  const live = applicationsResource.isLive;
  const loading = applicationsResource.status === 'loading' || plansResource.status === 'loading';
  const hasError =
    applicationsResource.status === 'error' || plansResource.status === 'error';

  const applications = live ? applicationsResource.data : demoJoinApplications;
  const planNames = useMemo(
    () => new Map(plansResource.data.map((plan) => [plan.id, plan.name] as const)),
    [plansResource.data],
  );

  const queue = applications.filter((application) => application.state === 'submitted');
  const history = applications.filter(
    (application) => application.state === 'approved' || application.state === 'rejected',
  );
  const other = applications.filter(
    (application) =>
      application.state === 'draft' || application.state === 'pendingVerification',
  );

  const refreshAll = () => {
    applicationsResource.refresh();
    plansResource.refresh();
  };

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Stack.Screen options={{ headerShown: false }} />
      <OwnerScreen
        title="Join applications"
        eyebrow="Administration"
        subtitle={live ? 'Read-only · the reception desk decides' : 'Demo queue · the desk decides'}
        demo={!live}
        actions={<SignOut />}
        refreshControl={
          live ? <DataRefreshControl refreshing={loading} onRefresh={refreshAll} /> : undefined
        }>
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
          <OwnerWell>
            <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
              {live
                ? 'This page is read-only. Approving an application creates a member record and belongs to the reception desk; the server refuses the owner role for that decision. Membership still activates only when a payment is verified.'
                : 'Demo mode shows the shared illustrative applications. Approving belongs to the reception desk; this console offers no decision control in any mode.'}
            </AppText>
          </OwnerWell>
        </RiseIn>

        <RiseIn index={1} style={{ marginTop: spacing.sm }}>
          <OwnerSection title={`Awaiting decision — ${queue.length}`}>
            {queue.length === 0 ? (
              <OwnerEmptyState
                icon="file-tray-outline"
                title="No applications waiting"
                hint="Submitted applications appear here for the desk to review."
              />
            ) : (
              <OwnerListGroup>
                {queue.map((application, index) => (
                  <View key={application.id}>
                    {index > 0 && <OwnerRowDivider />}
                    <OwnerListRow
                      leading={<OwnerMemberAvatar name={application.fullName} />}
                      title={application.fullName}
                      detail={`${planNames.get(application.planId) ?? application.planId} · ${formatDate(application.createdAt)}`}
                      status={<OwnerStatusText label="Submitted" tone="warning" />}
                      meta={
                        <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
                          {application.phone} · {application.email}
                        </AppText>
                      }
                    />
                  </View>
                ))}
              </OwnerListGroup>
            )}
          </OwnerSection>
        </RiseIn>

        <RiseIn index={2} style={{ marginTop: spacing.sm }}>
          <OwnerSection title="Decided">
            {history.length === 0 ? (
              <OwnerEmptyState
                icon="time-outline"
                title="No decisions yet"
                hint="Approved and rejected applications stay on record here."
              />
            ) : (
              <OwnerListGroup>
                {history.map((application, index) => (
                  <View key={application.id}>
                    {index > 0 && <OwnerRowDivider />}
                    <OwnerListRow
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
                  </View>
                ))}
              </OwnerListGroup>
            )}
          </OwnerSection>
        </RiseIn>

        {other.length > 0 && (
          <RiseIn index={3} style={{ marginTop: spacing.sm }}>
            <OwnerSection title="Not yet submitted">
              <OwnerListGroup>
                {other.map((application, index) => (
                  <View key={application.id}>
                    {index > 0 && <OwnerRowDivider />}
                    <OwnerListRow
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
                  </View>
                ))}
              </OwnerListGroup>
            </OwnerSection>
          </RiseIn>
        )}
      </OwnerScreen>

      <OwnerBottomNavigation active="more" />
    </View>
  );
}
