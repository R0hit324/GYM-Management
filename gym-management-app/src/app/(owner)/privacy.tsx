/**
 * WS-8 — Owner privacy request queue.
 *
 * This screen records a reviewed workflow decision. It deliberately does
 * not delete an auth user, member, payment, receipt or audit row: those
 * actions are performed separately by the Owner under the approved process
 * and the note is recorded here. Owner + AAL2 is enforced by the server.
 */
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AppText } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { ModalSheet } from '@/components/ui/modal-sheet';
import { PressSurface } from '@/components/ui/press-surface';
import { SkeletonRow } from '@/components/ui/feedback';
import { SignOut } from '@/components/workspace-meta';
import {
  OwnerScreen,
  OwnerSection,
  OwnerCard,
  OwnerWell,
  OwnerRowDivider,
} from '@/components/owner/owner-ui';
import { useTokens } from '@/hooks/use-tokens';
import { useAuth } from '@/services/auth';
import {
  listAllPrivacyRequests,
  privacyRequestStateLabel,
  privacyRequestTypeLabel,
  resolvePrivacyRequest,
  type PrivacyRequestRecord,
  type PrivacyResolutionState,
} from '@/services/privacy';
import { formatDate } from '@/utils/format';

interface PendingAction {
  request: PrivacyRequestRecord;
  state: PrivacyResolutionState;
}

export default function OwnerPrivacyRequestsScreen() {
  const tokens = useTokens();
  const { colors, spacing } = tokens;
  const { provider } = useAuth();
  const live = provider.mode === 'live';

  const [requests, setRequests] = useState<PrivacyRequestRecord[]>([]);
  const [loading, setLoading] = useState(live);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [action, setAction] = useState<PendingAction | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    if (!live) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await listAllPrivacyRequests();
    if (result.ok) setRequests(result.data);
    else setError(result.error);
    setLoading(false);
  }, [live]);

  useEffect(() => {
    // Deferred one tick so the effect body never calls setState synchronously
    // (React Compiler lint) and refreshing is a real external sync.
    const timer = setTimeout(() => {
      void refresh();
    }, 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  const openAction = (request: PrivacyRequestRecord, state: PrivacyResolutionState) => {
    // Decision controls exist only against a live backend; demo mode keeps
    // the queue empty and must not offer (or accept) decision actions.
    if (!live) return;
    setAction({ request, state });
    setNote('');
    setError(null);
    setNotice(null);
  };

  const submitAction = async () => {
    if (!action || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await resolvePrivacyRequest(action.request.id, action.state, note);
    if (!result.ok) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    setAction(null);
    setNote('');
    setSubmitting(false);
    setNotice('Workflow status recorded. No member, payment, receipt or audit row was deleted.');
    await refresh();
  };

  const actionTitle =
    action?.state === 'in_review'
      ? 'Start review'
      : action?.state === 'completed'
        ? 'Mark completed'
        : 'Reject request';

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Stack.Screen options={{ headerShown: false }} />
      <OwnerScreen
        title="Privacy requests"
        eyebrow="Administration"
        subtitle="Reviewed requests — workflow only, no automatic erasure"
        actions={<SignOut />}>
        {!live && (
          <OwnerWell>
            <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
              Demo mode: no requests exist and no decision can be recorded.
            </AppText>
          </OwnerWell>
        )}

        {error && (
          <OwnerWell>
            <AppText variant="caption" style={{ color: colors.dangerStrong }}>
              {error}
            </AppText>
            {live && (
              <View style={{ marginTop: spacing.xs }}>
                <Button label="Try again" size="small" variant="secondary" onPress={() => void refresh()} />
              </View>
            )}
          </OwnerWell>
        )}

        {notice && (
          <OwnerWell>
            <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
              {notice}
            </AppText>
          </OwnerWell>
        )}

        <OwnerSection
          title="Queue"
          action={
            live ? (
              <Button label="Refresh" size="small" variant="ghost" onPress={() => void refresh()} />
            ) : undefined
          }>
          {loading ? (
            <OwnerCard>
              <SkeletonRow />
              <SkeletonRow />
            </OwnerCard>
          ) : requests.length === 0 ? (
            <OwnerCard>
              <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
                {live
                  ? 'No privacy requests have been submitted.'
                  : 'Nothing is stored in demo mode.'}
              </AppText>
            </OwnerCard>
          ) : (
            <OwnerCard>
              {requests.map((request, index) => (
                <View key={request.id}>
                  {index > 0 && <OwnerRowDivider />}
                  <View style={{ paddingVertical: spacing.xs, gap: spacing['3xs'] }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: spacing.sm,
                      }}>
                      <AppText variant="label" style={{ color: colors.ownerInk, flex: 1 }}>
                        {privacyRequestTypeLabel(request.requestType)}
                      </AppText>
                      <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
                        {privacyRequestStateLabel(request.state)}
                      </AppText>
                    </View>
                    <AppText variant="caption" style={{ color: colors.ownerInkSubtle }}>
                      Submitted {formatDate(request.createdAt)} · user {request.authUserId.slice(0, 8)}
                    </AppText>
                    {request.details && (
                      <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
                        Member note: {request.details}
                      </AppText>
                    )}
                    {request.resolutionNote && (
                      <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
                        Owner note: {request.resolutionNote}
                      </AppText>
                    )}
                    {live && request.state === 'submitted' && (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: 2 }}>
                        <Button
                          label="Start review"
                          size="small"
                          variant="secondary"
                          onPress={() => openAction(request, 'in_review')}
                        />
                        <PressSurface
                          accessibilityRole="button"
                          accessibilityLabel="Reject privacy request"
                          onPress={() => openAction(request, 'rejected')}
                          style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.xs }}>
                          <AppText variant="label" style={{ color: colors.dangerStrong }}>
                            Reject
                          </AppText>
                        </PressSurface>
                      </View>
                    )}
                    {live && request.state === 'in_review' && (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: 2 }}>
                        <Button
                          label="Mark completed"
                          size="small"
                          variant="secondary"
                          onPress={() => openAction(request, 'completed')}
                        />
                        <PressSurface
                          accessibilityRole="button"
                          accessibilityLabel="Reject privacy request"
                          onPress={() => openAction(request, 'rejected')}
                          style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.xs }}>
                          <AppText variant="label" style={{ color: colors.dangerStrong }}>
                            Reject
                          </AppText>
                        </PressSurface>
                      </View>
                    )}
                  </View>
                </View>
              ))}
            </OwnerCard>
          )}
        </OwnerSection>

        <AppText variant="caption" align="center" style={{ color: colors.ownerInkSubtle, marginTop: spacing.lg }}>
          Marking a request completed does not delete any data. Perform the approved action separately, then keep
          the note and audit trail. Payment, receipt and audit records may be retained.
        </AppText>
      </OwnerScreen>

      <ModalSheet
        visible={action !== null}
        onClose={() => {
          if (!submitting) setAction(null);
        }}
        title={actionTitle}
        subtitle={action ? privacyRequestTypeLabel(action.request.requestType) : undefined}>
        {action && (
          <View style={{ gap: spacing.sm }}>
            <AppText variant="caption" style={{ color: colors.inkMuted }}>
              {action.state === 'completed'
                ? 'This records the workflow decision only. Confirm that the approved action has been or will be performed separately; this button deletes nothing.'
                : action.state === 'rejected'
                  ? 'Explain why the request is rejected, including any retention obligation that applies.'
                  : 'Record that the Owner has started reviewing this request.'}
            </AppText>
            <TextField
              label="Owner note"
              value={note}
              onChangeText={setNote}
              placeholder="Reason, action taken, or retention obligation"
              multiline
              numberOfLines={4}
              style={{ minHeight: 96, textAlignVertical: 'top' }}
            />
            {error && (
              <AppText variant="caption" style={{ color: colors.danger }}>
                {error}
              </AppText>
            )}
            <Button
              label={submitting ? 'Recording' : actionTitle}
              fullWidth
              loading={submitting}
              disabled={submitting}
              onPress={() => void submitAction()}
            />
            <AppText variant="caption" style={{ color: colors.inkMuted }}>
              Owner + AAL2 is checked by the server. A non-owner or an AAL1 session is refused.
            </AppText>
          </View>
        )}
      </ModalSheet>
    </View>
  );
}
