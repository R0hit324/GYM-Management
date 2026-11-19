/**
 * QR scanner surface for the member attendance screen (Stage 3).
 *
 * The camera only opens after the OS permission is granted with a plain
 * language reason, and only while the screen is focused — Expo documents
 * one active preview at a time. Scans are throttled to one callback per
 * payload per short window; the backend still owns replay protection.
 *
 * This component never decides whether a scan is valid: it hands the raw
 * QR payload to the caller, which calls `check_in` and displays the server's
 * answer.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect } from 'expo-router';

import { AppText } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { useTokens } from '@/hooks/use-tokens';

const SCAN_COOLDOWN_MS = 1500;

export function QrScanner(props: {
  onScanned: (payload: string) => void;
  active?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { onScanned, active, style } = props;
  const tokens = useTokens();
  const { colors, spacing, radius } = tokens;
  const [permission, requestPermission] = useCameraPermissions();
  const [focused, setFocused] = useState(true);
  const lastScan = useRef<{ payload: string; at: number } | null>(null);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  // A new screen visit should not inherit the previous cooldown.
  useEffect(() => {
    if (focused) lastScan.current = null;
  }, [focused]);

  const handleScan = useCallback(
    (result: { data?: string }) => {
      if (!active || !focused) return;
      const payload = result.data?.trim();
      if (!payload) return;
      const now = Date.now();
      const previous = lastScan.current;
      if (previous && previous.payload === payload && now - previous.at < SCAN_COOLDOWN_MS) {
        return;
      }
      lastScan.current = { payload, at: now };
      onScanned(payload);
    },
    [active, focused, onScanned],
  );

  if (!permission) {
    return (
      <View style={[styles.centre, style]}>
        <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
          Checking camera access…
        </AppText>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.centre, { padding: spacing.md }, props.style]}>
        <Ionicons name="camera-outline" size={34} color={colors.ownerInkMuted} />
        <AppText variant="label" align="center" style={{ color: colors.ownerInk, marginTop: spacing.xs }}>
          Camera access is needed to scan the entrance QR
        </AppText>
        <AppText variant="caption" align="center" style={{ color: colors.ownerInkMuted, marginTop: spacing['3xs'] }}>
          The camera is used only to read the attendance code. Nothing is recorded until the server
          confirms the scan.
        </AppText>
        <View style={{ marginTop: spacing.sm }}>
          {permission.canAskAgain ? (
            <Button label="Allow camera" icon="camera-outline" size="small" onPress={requestPermission} />
          ) : (
            <Button
              label="Open settings"
              icon="settings-outline"
              size="small"
              variant="secondary"
              onPress={() => {
                void Linking.openSettings();
              }}
            />
          )}
        </View>
        {!permission.canAskAgain && (
          <AppText variant="caption" align="center" style={{ color: colors.ownerInkSubtle, marginTop: spacing.xs }}>
            Camera permission was denied. Enable it in system settings, then return to this screen.
          </AppText>
        )}
      </View>
    );
  }

  if (!active || !focused) {
    return (
      <View style={[styles.centre, style]}>
        <Ionicons name="scan-outline" size={40} color={colors.ownerAccentDeep} />
        <AppText variant="caption" align="center" style={{ color: colors.ownerInkMuted }}>
          Scanner paused
        </AppText>
      </View>
    );
  }

  return (
    <View style={[styles.cameraWrap, style]}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={handleScan}
      />
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            alignItems: 'center',
            justifyContent: 'center',
          },
        ]}>
        <View
          style={{
            width: 158,
            height: 158,
            borderRadius: radius.md,
            borderWidth: 2,
            borderColor: colors.ownerAccentDeep,
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraWrap: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
});
