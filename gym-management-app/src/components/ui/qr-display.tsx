/**
 * QR display. Part 1 renders clearly-labelled demo payloads; real
 * attendance tokens (hashed, 30-60 s expiry, server-validated) and the gym's
 * real UPI QR arrive in Parts 4-5. The component itself is payload-agnostic.
 */
import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { AppText } from '@/components/ui/text';
import { useTokens } from '@/hooks/use-tokens';

export function QrDisplay(props: {
  payload: string;
  caption: string;
  size?: number;
}) {
  const tokens = useTokens();
  const { colors, spacing, radius } = tokens;
  return (
    <View
      accessibilityLabel={`QR code: ${props.caption}`}
      accessible
      style={{
        alignItems: 'center',
        gap: spacing.xs,
      }}>
      <View
        style={{
          padding: spacing.md,
          backgroundColor: '#FFFFFF', // QR modules require max scanner contrast; part of the payload surface, not an interface surface
          borderRadius: radius.sm,
          borderWidth: 1,
          borderColor: colors.rule,
        }}>
        <QRCode
          value={props.payload}
          size={props.size ?? 172}
          color={colors.ink}
          backgroundColor="#FFFFFF"
          quietZone={2}
        />
      </View>
      <AppText variant="caption" tone="muted" align="center" style={{ maxWidth: 220 }}>
        {props.caption}
      </AppText>
    </View>
  );
}
