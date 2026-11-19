/**
 * Payment QR — the desk's dedicated gym UPI QR configuration surface.
 *
 * The top of the screen manages the gym's payment QR itself (Stage 4):
 * the currently configured QR is displayed prominently — either a QR
 * generated from the configured UPI ID carrying the selected member's
 * payable amount, or a device-picked replacement image applied with
 * explicit manual confirmation (this preview cannot decode QR codes, so a
 * picked image is never assumed to be a valid payment QR). The UPI ID can
 * be edited with a format-only check — account verification never happens
 * here. All configuration is session-only: nothing is uploaded, no server
 * or database exists, and everything resets on restart. No secrets exist
 * client-side; the UPI ID is a public payment address.
 *
 * The payment workflow itself (member, plan, discount, UPI/cash, UTR
 * recording) lives on the Collect Payment screen (Stage 6), which shows
 * the configured QR carrying the member's payable amount — this screen
 * stays the QR's configuration surface, not a second collection flow.
 *
 * Separation is structural: the attendance Door QR is a different screen
 * with a different payload (UPI QR ≠ attendance QR).
 */
import { useState } from 'react';
import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { router } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';

import { AppText } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { StatusBadge } from '@/components/ui/status-badge';
import { ModalSheet } from '@/components/ui/modal-sheet';
import { QrDisplay } from '@/components/ui/qr-display';
import { RiseIn } from '@/components/ui/rise-in';
import { SignOut } from '@/components/workspace-meta';
import {
  WorkspaceScreen,
  WorkspaceBottomNavigation,
  WorkspaceCard,
  WorkspaceSection,
  WorkspaceRowDivider,
} from '@/components/workspace/workspace-ui';
import { useTokens } from '@/hooks/use-tokens';
import { demoGymName, demoGymUpiId } from '@/data/demo';
import { useSessionQrConfig, updateSessionQrConfig, resetSessionQrConfig } from '@/data/session';
import { buildUpiPayload, isValidUpiId } from '@/utils/upi';
import { useAuth } from '@/services/auth';

/** Accepted QR image formats and the size ceiling (5 MB). */
const QR_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const MAX_QR_IMAGE_BYTES = 5 * 1024 * 1024;

const navItems = [
  { key: 'home', label: 'Home', icon: 'home-outline', href: '/(reception)/home' },
  { key: 'members', label: 'Members', icon: 'people-outline', href: '/(reception)/members' },
  { key: 'more', label: 'More', icon: 'apps-outline', href: '/(reception)/more' },
] as const;

export default function PaymentQrScreen() {
  const tokens = useTokens();
  const { colors, spacing } = tokens;
  const { provider } = useAuth();
  const live = provider.mode === 'live';

  const qrConfig = useSessionQrConfig();
  const upiId = qrConfig.upiId;
  const customImageUri = qrConfig.customImageUri;
  const configIsDefault = upiId === demoGymUpiId && customImageUri === null;

  // QR image replacement flow: pick → validate → preview → explicit
  // confirm. Cancellation is a no-op; nothing is assumed valid.
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [previewNote, setPreviewNote] = useState<string | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [configNote, setConfigNote] = useState<string | null>(null);

  // UPI ID editing (format check only — no account verification here).
  const [upiEditOpen, setUpiEditOpen] = useState(false);
  const [upiDraft, setUpiDraft] = useState('');
  const [upiError, setUpiError] = useState<string | null>(null);

  const pickQrImage = async () => {
    setPickerError(null);
    setPreviewNote(null);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setPickerError('Photo access was not granted, so no image can be picked. Allow photo access for the app and try again.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
        exif: false,
        allowsMultipleSelection: false,
      });
      if (result.canceled) return; // cancelled — nothing changes
      const asset = result.assets[0];
      if (!asset?.uri) {
        setPickerError('The picker returned no image. Try again.');
        return;
      }
      if (!asset.mimeType || !QR_IMAGE_TYPES.includes(asset.mimeType)) {
        setPickerError(
          asset.mimeType
            ? `Unsupported format (${asset.mimeType}). Use a PNG, JPEG or WebP image of the QR.`
            : 'The image format could not be determined. Use a PNG, JPEG or WebP image of the QR.',
        );
        return;
      }
      if (typeof asset.fileSize === 'number' && asset.fileSize > MAX_QR_IMAGE_BYTES) {
        setPickerError('The image is larger than 5 MB. Pick a smaller QR image.');
        return;
      }
      setPreviewUri(asset.uri);
      setPreviewNote(
        typeof asset.fileSize === 'number'
          ? `${Math.max(1, Math.round(asset.fileSize / 1024))} KB · ${asset.mimeType}`
          : 'The picker did not report a file size, so the size could not be checked.',
      );
    } catch {
      setPickerError('The image picker did not open. Check the app\'s photo permissions and try again.');
    }
  };

  const confirmPreviewImage = () => {
    if (!previewUri) return;
    updateSessionQrConfig({ customImageUri: previewUri });
    setPreviewUri(null);
    setPreviewNote(null);
    setConfigNote('QR image applied for this session. It resets when the app restarts — nothing was saved to a server.');
  };

  const openUpiEdit = () => {
    setUpiDraft(upiId);
    setUpiError(null);
    setUpiEditOpen(true);
  };

  const saveUpiEdit = () => {
    const value = upiDraft.trim();
    if (!isValidUpiId(value)) {
      setUpiError('That is not a UPI ID format. Use the name@bank shape, for example gym@upi.');
      return;
    }
    updateSessionQrConfig({ upiId: value });
    setUpiEditOpen(false);
    setConfigNote(
      customImageUri
        ? 'UPI ID updated for this session. Format checked only — the account is not verified. The configured QR image does not change with the ID; replace the image to match.'
        : 'UPI ID updated for this session. Format checked only — the account is not verified.',
    );
  };

  const revertImage = () => {
    updateSessionQrConfig({ customImageUri: null });
    setConfigNote('The generated QR is back. The configured image was cleared for this session.');
  };

  const discardPreview = () => {
    setPreviewUri(null);
    setPreviewNote(null);
  };

  const resetConfig = () => {
    resetSessionQrConfig();
    setConfigNote('Configuration reverted to the demo defaults. Session changes are gone.');
    setPickerError(null);
    discardPreview();
  };

  // The generated QR is the plain UPI code for the configured ID — no
  // member amount is encoded here. The Collect Payment flow shows a code
  // carrying the selected member's payable amount when used there.
  const qrPayload = buildUpiPayload(upiId);
  const upiEdited = upiId !== demoGymUpiId;

  return (
    <View style={{ flex: 1 }}>
      <WorkspaceScreen
        title="Payment QR"
        eyebrow="Payments"
        subtitle={live ? 'The gym\'s UPI code (owner-configured)' : 'The gym\'s UPI code and its configuration'}
        demo={!live}
        actions={<SignOut />}>
        {/* Gym UPI QR configuration — display, replace, UPI ID edit. Session
            only; the UPI ID is a public payment address, never a secret.
            In live mode, UPI/QR configuration is owner-only via update_gym_settings RPC. */}
        <RiseIn>
          <WorkspaceSection
            title="Currently configured QR"
            action={live ? <StatusBadge label="Live" tone="success" small /> : <StatusBadge label="Session only" tone="warning" small />}>
            <WorkspaceCard>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Ionicons name="business-outline" size={22} color={colors.ownerAccentDeep} />
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong" style={{ color: colors.ownerInk }}>
                    {demoGymName}
                  </AppText>
                  <AppText variant="caption" numberOfLines={1} style={{ color: colors.ownerInkMuted }}>
                    UPI ID: {upiId}
                  </AppText>
                </View>
              </View>
              <WorkspaceRowDivider />
              <View style={{ marginTop: spacing.sm, alignItems: 'center' }}>
                {customImageUri ? (
                  <View style={{ alignItems: 'center', gap: spacing.xs }}>
                    <View
                      style={{
                        padding: spacing.md,
                        backgroundColor: '#FFFFFF', // QR modules require max scanner contrast
                        borderRadius: tokens.radius.sm,
                        borderWidth: 1,
                        borderColor: colors.ownerRule,
                      }}>
                      <Image
                        source={{ uri: customImageUri }}
                        style={{ width: 248, height: 248 }}
                        contentFit="contain"
                        accessibilityLabel="The gym's configured payment QR image for this session"
                      />
                    </View>
                    <AppText variant="caption" align="center" style={{ color: colors.ownerInkMuted, maxWidth: 300 }}>
                      Configured QR image for this session. It carries no member amount — the member keys the payable in their UPI app. This image is not decoded or validated by the app; its correctness was confirmed manually.
                    </AppText>
                  </View>
                ) : qrPayload ? (
                  <QrDisplay
                    payload={qrPayload}
                    caption="Standard UPI deep-link format with the configured UPI ID. No member amount is encoded on this screen's code — the member keys the payable in their UPI app; the Collect Payment flow shows a code carrying the member's amount. The real merchant QR comes from the payment provider at go-live."
                    size={184}
                  />
                ) : (
                  <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
                    The gym&apos;s UPI ID is not configured, so no payment QR can be shown. Record the payment without the QR.
                  </AppText>
                )}
                {upiEdited && !customImageUri && (
                  <AppText variant="caption" align="center" style={{ color: colors.ownerWarningDeep, marginTop: spacing.xs }}>
                    Generated from the session-configured UPI ID — format checked only; the account is not verified.
                  </AppText>
                )}
              </View>

              {/* Configuration controls — demo mode only. In live mode, UPI/QR
                  configuration is owner-only via update_gym_settings RPC. */}
              {!live && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm }}>
                  <Button label="Replace QR image" size="small" variant="secondary" icon="image-outline" onPress={() => void pickQrImage()} />
                  {customImageUri && (
                    <Button label="Revert to generated QR" size="small" variant="secondary" icon="refresh-outline" onPress={revertImage} />
                  )}
                  <Button label="Edit UPI ID" size="small" variant="secondary" icon="create-outline" onPress={openUpiEdit} />
                  {!configIsDefault && (
                    <Button label="Reset configuration" size="small" variant="secondary" icon="backspace-outline" onPress={resetConfig} />
                  )}
                </View>
              )}
              {live && (
                <AppText variant="caption" style={{ color: colors.ownerInkMuted, marginTop: spacing.sm }}>
                  UPI ID and QR image are configured by the owner via the update_gym_settings RPC. Receptionists see the live configuration here.
                </AppText>
              )}
              {pickerError && (
                <AppText variant="caption" style={{ color: colors.ownerErrorDeep, marginTop: spacing.xs }}>
                  {pickerError}
                </AppText>
              )}
              {configNote && (
                <AppText variant="caption" style={{ color: colors.ownerSuccessDeep, marginTop: spacing.xs }}>
                  {configNote}
                </AppText>
              )}
              <AppText variant="caption" style={{ color: colors.ownerInkSubtle, marginTop: spacing.xs }}>
                Configuration lives for this session only and resets when the app restarts — nothing is saved to a server or database. The attendance Door QR is a separate screen and is never touched from here.
              </AppText>
            </WorkspaceCard>
          </WorkspaceSection>
        </RiseIn>

        {/* Collect Payment — the desk's guided payment workflow (Stage 6).
            Member association, discounts, UTR recording and records live
            there; this screen stays the QR's configuration surface. */}
        <RiseIn index={1} style={{ marginTop: spacing.sm }}>
          <WorkspaceSection title="Collect Payment">
            <WorkspaceCard>
              <AppText variant="bodyStrong" style={{ color: colors.ownerInk }}>
                Collect a payment with this QR
              </AppText>
              <AppText variant="caption" style={{ color: colors.ownerInkMuted, marginTop: spacing.xs }}>
                The guided flow — member, plan, discount, UPI or cash, review and record — lives on the Collect Payment screen. It shows a QR carrying the selected member&apos;s payable amount and records the UTR or cash entry into the same session store that Transaction History reads.
              </AppText>
              <View style={{ marginTop: spacing.sm }}>
                <Button label="Open Collect Payment" icon="cash-outline" onPress={() => router.push('/(reception)/fees' as never)} />
              </View>
            </WorkspaceCard>
          </WorkspaceSection>
        </RiseIn>

        {/* QR image preview — demo mode only. In live mode, QR image
            replacement is owner-only via update_gym_settings RPC. */}
        {!live && (
          <ModalSheet
            visible={previewUri !== null}
            onClose={discardPreview}
            title="Preview the picked image"
            subtitle="Nothing is applied until you confirm"
            toneBadge={<StatusBadge label="Not yet applied" tone="warning" small />}>
            <View style={{ alignItems: 'center', gap: spacing.xs }}>
              <View
                style={{
                  padding: spacing.md,
                  backgroundColor: '#FFFFFF', // QR modules require max scanner contrast
                  borderRadius: tokens.radius.sm,
                  borderWidth: 1,
                  borderColor: colors.ownerRule,
                }}>
                <Image
                  source={previewUri ? { uri: previewUri } : undefined}
                  style={{ width: 220, height: 220 }}
                  contentFit="contain"
                  accessibilityLabel="Preview of the picked QR image"
                />
              </View>
              {previewNote && (
                <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
                  {previewNote}
                </AppText>
              )}
              <AppText variant="caption" align="center" style={{ color: colors.ownerInkMuted, marginBottom: spacing.xs }}>
                The app cannot read QR codes, so picking an image never proves it is the gym&apos;s payment QR. Scan it once with a UPI app to confirm it opens the gym&apos;s payment address — only then apply it.
              </AppText>
              <Button label="Use this image" icon="checkmark-outline" fullWidth onPress={confirmPreviewImage} />
              <Button label="Choose a different image" variant="secondary" icon="image-outline" fullWidth onPress={() => void pickQrImage()} />
              <Button label="Discard" variant="secondary" fullWidth onPress={discardPreview} />
            </View>
          </ModalSheet>
        )}

        {/* UPI ID editing — demo mode only. In live mode, UPI ID
            editing is owner-only via update_gym_settings RPC. */}
        {!live && (
          <ModalSheet
            visible={upiEditOpen}
            onClose={() => setUpiEditOpen(false)}
            title="Edit the UPI ID"
            subtitle="Format checked — the account is not verified"
            toneBadge={<StatusBadge label="Not verified" tone="warning" small />}>
            <TextField
              label="UPI ID"
              placeholder="name@bank"
              value={upiDraft}
              onChangeText={(v) => {
                setUpiDraft(v);
                setUpiError(null);
              }}
              error={upiError}
              helper="The app checks the name@bank shape only — it cannot check that this account exists or belongs to the gym."
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />
            <AppText variant="caption" style={{ color: colors.ownerInkMuted, marginTop: spacing.sm }}>
              {customImageUri
                ? 'The configured QR image is not regenerated from an unverified ID — if the new UPI ID must appear on the QR, replace the image too.'
                : 'The generated QR will use this ID for the session. It is never presented as a verified merchant code.'}
            </AppText>
            <View style={{ gap: spacing.xs, marginTop: spacing.sm }}>
              <Button label="Save UPI ID" icon="checkmark-outline" fullWidth onPress={saveUpiEdit} />
              <Button label="Cancel" variant="secondary" fullWidth onPress={() => setUpiEditOpen(false)} />
            </View>
          </ModalSheet>
        )}

        <AppText variant="caption" style={{ color: colors.ownerInkSubtle, textAlign: 'center', marginTop: spacing.lg }}>
          This screen configures the gym&apos;s UPI QR — it never marks a payment verified and never exposes payment credentials beyond the public UPI ID.
        </AppText>
      </WorkspaceScreen>

      <WorkspaceBottomNavigation active="more" items={navItems} />
    </View>
  );
}
