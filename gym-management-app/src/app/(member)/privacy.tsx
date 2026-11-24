/**
 * WS-8 — member Privacy & data screen.
 *
 * One place to read the two legal documents, see what was accepted, change
 * optional marketing consent, and submit a reviewed privacy request.
 *
 * Honesty rules:
 *   * The documents are drafts and say so.
 *   * A request is not an instant deletion or export.
 *   * Demo mode stores nothing, so the actions are disabled with a reason.
 *   * No request, consent or membership claim is shown unless the server
 *     confirmed it.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  WorkspaceScreen,
  WorkspaceSection,
  WorkspaceCard,
  WorkspaceWell,
  WorkspaceRowDivider,
} from '@/components/workspace/workspace-ui';
import { ConsentCheckbox } from '@/components/legal/consent-checkbox';
import { LegalLink } from '@/components/legal/legal-link';
import { useTokens } from '@/hooks/use-tokens';
import { useAuth } from '@/services/auth';
import {
  CONSENT_DOCUMENT_VERSIONS,
  LEGAL_DRAFT_LABEL,
} from '@/constants/legal';
import {
  consentTypeLabel,
  listMyConsentRecords,
  recordConsent,
  type ConsentHistoryRecord,
  type ConsentType,
} from '@/services/consent';
import {
  listMyPrivacyRequests,
  privacyRequestStateLabel,
  privacyRequestTypeLabel,
  requestPrivacyAction,
  type PrivacyRequestRecord,
  type PrivacyRequestType,
} from '@/services/privacy';
import { formatDate } from '@/utils/format';

const REQUEST_TYPES: PrivacyRequestType[] = [
  'account_deletion',
  'data_export',
  'data_correction',
  'privacy_inquiry',
];

const REQUEST_HELP: Record<PrivacyRequestType, { title: string; body: string; placeholder: string }> = {
  account_deletion: {
    title: 'Request account deletion',
    body:
      'This is a request, not an instant deletion. It does not cancel your membership. Payment, receipt and audit records may be retained for accounting, fraud-prevention and legal reasons. The Owner will review the request and record the outcome.',
    placeholder: 'Anything the Owner should know about this request (optional).',
  },
  data_export: {
    title: 'Request a copy of my data',
    body:
      'Ask the Owner to prepare a copy of your account, membership, attendance and payment records. The app does not generate or email the export automatically.',
    placeholder: 'What would you like a copy of? (optional)',
  },
  data_correction: {
    title: 'Request a correction',
    body:
      'Tell the gym what is wrong. Reception can correct member contact details through an authorised, audited function. Historical payment or attendance records may need an explanation rather than a rewrite.',
    placeholder: 'Which detail is wrong, and what should it be?',
  },
  privacy_inquiry: {
    title: 'Ask a privacy question',
    body:
      'Ask how your information is used, who can see it, or how a privacy rule applies to you. The Owner will review the question.',
    placeholder: 'Your question (optional).',
  },
};

type BusyAction = 'marketing' | PrivacyRequestType | null;

export default function MemberPrivacyScreen() {
  const tokens = useTokens();
  const { colors, spacing } = tokens;
  const { provider } = useAuth();
  const live = provider.mode === 'live';

  const [consents, setConsents] = useState<ConsentHistoryRecord[]>([]);
  const [requests, setRequests] = useState<PrivacyRequestRecord[]>([]);
  const [loading, setLoading] = useState(live);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [sheet, setSheet] = useState<PrivacyRequestType | null>(null);
  const [details, setDetails] = useState('');
  const [requestError, setRequestError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    if (!live) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    const [consentResult, requestResult] = await Promise.all([
      listMyConsentRecords(),
      listMyPrivacyRequests(),
    ]);
    if (!consentResult.ok) setLoadError(consentResult.error);
    else setConsents(consentResult.data);
    if (!requestResult.ok) setLoadError((current) => current ?? requestResult.error);
    else setRequests(requestResult.data);
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

  const latestByType = useMemo(() => {
    const latest = new Map<ConsentType, ConsentHistoryRecord>();
    for (const record of consents) {
      if (!latest.has(record.type)) latest.set(record.type, record);
    }
    return latest;
  }, [consents]);

  const marketingAccepted = latestByType.get('marketing')?.accepted ?? false;

  const changeMarketing = async (next: boolean) => {
    if (!live || busy) return;
    setBusy('marketing');
    setNotice(null);
    setLoadError(null);
    setConsentError(null);
    const outcome = await recordConsent({
      type: 'marketing',
      version: CONSENT_DOCUMENT_VERSIONS.privacyPolicy,
      accepted: next,
      source: 'member_privacy_screen',
    });
    if (!outcome.ok) {
      // A failed consent write is a submit error, never a load error.
      setConsentError(outcome.error);
    } else {
      setConsentError(null);
      setNotice(
        next
          ? 'Marketing consent recorded. This does not affect your membership.'
          : 'Marketing consent withdrawn. This does not affect your membership.',
      );
      await refresh();
    }
    setBusy(null);
  };

  const openRequest = (type: PrivacyRequestType) => {
    setSheet(type);
    setDetails('');
    setRequestError(null);
    setNotice(null);
  };

  const submitRequest = async () => {
    if (!sheet || submitting) return;
    setSubmitting(true);
    setRequestError(null);
    const outcome = await requestPrivacyAction(sheet, details);
    if (!outcome.ok) {
      setRequestError(outcome.error);
      setSubmitting(false);
      return;
    }
    setSheet(null);
    setDetails('');
    setSubmitting(false);
    setNotice('Request submitted. The Owner will review it; no data has been deleted or exported yet.');
    await refresh();
  };

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Stack.Screen options={{ headerShown: false }} />
      <WorkspaceScreen
        title="Privacy & data"
        eyebrow="Your account"
        subtitle="Documents, choices and reviewed requests"
        actions={<SignOut />}
        footerPadding={24}>
        {!live && (
          <WorkspaceWell>
            <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
              Demo mode: nothing is stored. The documents below are readable, but consent changes and
              privacy requests are disabled until the app is connected to a server. No consent record is
              created in this mode.
            </AppText>
          </WorkspaceWell>
        )}

        {loadError && (
          <WorkspaceWell>
            <AppText variant="caption" style={{ color: colors.dangerStrong }}>
              {loadError}
            </AppText>
            {live && (
              <View style={{ marginTop: spacing.xs }}>
                <Button label="Try again" size="small" variant="secondary" onPress={() => void refresh()} />
              </View>
            )}
          </WorkspaceWell>
        )}

        {consentError && (
          <WorkspaceWell>
            <AppText style={{ color: colors.dangerStrong }}>{consentError}</AppText>
          </WorkspaceWell>
        )}

        {notice && (
          <WorkspaceWell>
            <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
              {notice}
            </AppText>
          </WorkspaceWell>
        )}

        <WorkspaceSection title="Legal documents">
          <WorkspaceCard>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
              <LegalLink doc="privacy" label="Privacy Policy" />
              <LegalLink doc="terms" label="Terms of Service" />
            </View>
            <AppText variant="caption" style={{ color: colors.ownerInkSubtle, marginTop: spacing.xs }}>
              Version {CONSENT_DOCUMENT_VERSIONS.privacyPolicy}. {LEGAL_DRAFT_LABEL}. The owner must complete
              the placeholders before publication.
            </AppText>
          </WorkspaceCard>
        </WorkspaceSection>

        <WorkspaceSection title="Your choices">
          <WorkspaceCard>
            <ConsentCheckbox
              checked={marketingAccepted}
              onChange={(next) => void changeMarketing(next)}
              disabled={!live || busy !== null}
              label="Optional gym marketing messages"
              description="Separate from account and membership messages. Not required for membership. Changing this records a new consent event."
            />
            <AppText variant="caption" style={{ color: colors.ownerInkSubtle, marginTop: spacing['3xs'] }}>
              {live
                ? busy === 'marketing'
                  ? 'Recording your choice…'
                  : 'The latest recorded choice is shown. Earlier choices remain in the append-only history.'
                : 'Demo mode: this choice is not saved.'}
            </AppText>
          </WorkspaceCard>
        </WorkspaceSection>

        <WorkspaceSection title="Document acceptances">
          {!live ? (
            <WorkspaceCard>
              <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
                No consent history exists in demo mode.
              </AppText>
            </WorkspaceCard>
          ) : loading ? (
            <WorkspaceCard>
              <SkeletonRow />
              <SkeletonRow />
            </WorkspaceCard>
          ) : consents.length === 0 ? (
            <WorkspaceCard>
              <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
                No consent records were returned for this account. The app does not invent one.
              </AppText>
            </WorkspaceCard>
          ) : (
            <WorkspaceCard>
              {(['privacy_policy', 'terms_of_service', 'marketing'] as ConsentType[]).map((type, index) => {
                const record = latestByType.get(type);
                return (
                  <View key={type}>
                    {index > 0 && <WorkspaceRowDivider />}
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: spacing.sm,
                        paddingVertical: spacing.xs,
                      }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <AppText variant="label" style={{ color: colors.ownerInk }}>
                          {consentTypeLabel(type)}
                        </AppText>
                        <AppText variant="caption" style={{ color: colors.ownerInkSubtle }}>
                          {record
                            ? `Version ${record.version} · ${formatDate(record.recordedAt)}`
                            : 'No record returned'}
                        </AppText>
                      </View>
                      <AppText
                        variant="label"
                        style={{ color: record?.accepted ? colors.ownerSuccessDeep : colors.ownerInkMuted }}>
                        {record ? (record.accepted ? 'Accepted' : 'Declined') : '—'}
                      </AppText>
                    </View>
                  </View>
                );
              })}
            </WorkspaceCard>
          )}
        </WorkspaceSection>

        <WorkspaceSection title="Privacy requests">
          <WorkspaceCard>
            <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
              A request is reviewed by the Owner. It does not delete or export anything immediately, and it is
              not the same as cancelling a membership.
            </AppText>
            <View style={{ gap: spacing.xs, marginTop: spacing.sm }}>
              {REQUEST_TYPES.map((type) => (
                <PressSurface
                  key={type}
                  accessibilityRole="button"
                  accessibilityLabel={privacyRequestTypeLabel(type)}
                  disabled={!live}
                  onPress={() => openRequest(type)}
                  style={{
                    minHeight: 44,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: spacing.sm,
                    opacity: live ? 1 : 0.5,
                    paddingVertical: spacing.xs,
                  }}>
                  <AppText variant="label" style={{ color: colors.ownerInk }}>
                    {privacyRequestTypeLabel(type)}
                  </AppText>
                  <AppText variant="caption" style={{ color: colors.ownerAccentDeep }}>
                    {live ? 'Start' : 'Demo'}
                  </AppText>
                </PressSurface>
              ))}
            </View>
          </WorkspaceCard>
        </WorkspaceSection>

        <WorkspaceSection title="Your requests">
          {!live ? (
            <WorkspaceCard>
              <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
                No requests are recorded in demo mode.
              </AppText>
            </WorkspaceCard>
          ) : loading ? (
            <WorkspaceCard>
              <SkeletonRow />
            </WorkspaceCard>
          ) : requests.length === 0 ? (
            <WorkspaceCard>
              <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
                You have not submitted a privacy request from this account.
              </AppText>
            </WorkspaceCard>
          ) : (
            <WorkspaceCard>
              {requests.map((request, index) => (
                <View key={request.id}>
                  {index > 0 && <WorkspaceRowDivider />}
                  <View style={{ paddingVertical: spacing.xs, gap: 2 }}>
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
                      Submitted {formatDate(request.createdAt)}
                      {request.resolvedAt ? ` · Closed ${formatDate(request.resolvedAt)}` : ''}
                    </AppText>
                    {request.resolutionNote && (
                      <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
                        Owner note: {request.resolutionNote}
                      </AppText>
                    )}
                  </View>
                </View>
              ))}
            </WorkspaceCard>
          )}
        </WorkspaceSection>

        <AppText variant="caption" align="center" style={{ color: colors.ownerInkSubtle, marginTop: spacing.lg }}>
          Deletion requests are reviewed. Payment, receipt and audit records may be retained where the gym
          needs them for accounting, fraud-prevention or legal purposes.
        </AppText>
      </WorkspaceScreen>

      <ModalSheet
        visible={sheet !== null}
        onClose={() => {
          if (!submitting) setSheet(null);
        }}
        title={sheet ? REQUEST_HELP[sheet].title : 'Privacy request'}
        subtitle="Reviewed by the gym owner — not an instant action">
        {sheet && (
          <View style={{ gap: spacing.sm }}>
            <AppText variant="caption" style={{ color: colors.inkMuted }}>
              {REQUEST_HELP[sheet].body}
            </AppText>
            <TextField
              label="Details"
              value={details}
              onChangeText={setDetails}
              placeholder={REQUEST_HELP[sheet].placeholder}
              multiline
              numberOfLines={4}
              style={{ minHeight: 96, textAlignVertical: 'top' }}
            />
            {requestError && (
              <AppText variant="caption" style={{ color: colors.danger }}>
                {requestError}
              </AppText>
            )}
            <Button
              label={submitting ? 'Submitting' : 'Submit request'}
              fullWidth
              loading={submitting}
              disabled={submitting}
              onPress={() => void submitRequest()}
            />
            <AppText variant="caption" style={{ color: colors.inkMuted }}>
              No data is deleted or exported by this button. The Owner records the decision after review.
            </AppText>
          </View>
        )}
      </ModalSheet>
    </View>
  );
}
