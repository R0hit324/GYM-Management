/**
 * Owner More — the console's management hub.
 *
 * Keeps the four operating tabs (Overview, Members, Reports, Lost members)
 * focused and gives the owner the administrative surfaces the backend
 * already authorises: join-application review (read-only), plan lifecycle
 * and prices, gym settings, and the audit log. Every destination is a real
 * server-backed screen; nothing here is a placeholder.
 */
import { View } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AppText } from '@/components/ui/text';
import { RiseIn } from '@/components/ui/rise-in';
import { SignOut } from '@/components/workspace-meta';
import { LegalLink } from '@/components/legal/legal-link';
import {
  OwnerScreen,
  OwnerBottomNavigation,
  OwnerSection,
  OwnerListGroup,
  OwnerListRow,
  OwnerRowDivider,
  OwnerWell,
} from '@/components/owner/owner-ui';
import { useTokens } from '@/hooks/use-tokens';

interface ManageRow {
  key: string;
  title: string;
  detail: string;
  href: string;
}

const operations: ManageRow[] = [
  {
    key: 'lost',
    title: 'Lost members',
    detail: 'Inactive and expired memberships with follow-up status',
    href: '/(owner)/lost',
  },
];

const administration: ManageRow[] = [
  {
    key: 'applications',
    title: 'Join applications',
    detail: 'Read-only review queue; the reception desk records the decision',
    href: '/(owner)/applications',
  },
  {
    key: 'plans',
    title: 'Plans and prices',
    detail: 'Create plans, change prices and deactivate a plan',
    href: '/(owner)/plans',
  },
  {
    key: 'settings',
    title: 'Gym settings',
    detail: 'Timezone, gym UPI ID and attendance QR validity',
    href: '/(owner)/settings',
  },
  {
    key: 'staff',
    title: 'Staff accounts',
    detail: 'Create receptionists, review access and deactivate an account',
    href: '/(owner)/staff',
  },
  {
    key: 'privacy',
    title: 'Privacy requests',
    detail: 'Review deletion, export, correction and privacy requests',
    href: '/(owner)/privacy',
  },
  {
    key: 'audit',
    title: 'Audit log',
    detail: 'Append-only record of every authority action',
    href: '/(owner)/audit',
  },
];

export default function OwnerMoreScreen() {
  const tokens = useTokens();
  const { colors, spacing } = tokens;

  const renderRows = (rows: ManageRow[]) => (
    <OwnerListGroup>
      {rows.map((row, index) => (
        <View key={row.key}>
          {index > 0 && <OwnerRowDivider />}
          <OwnerListRow
            title={row.title}
            detail={row.detail}
            chevron
            onPress={() => router.navigate(row.href as never)}
          />
        </View>
      ))}
    </OwnerListGroup>
  );

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Stack.Screen options={{ headerShown: false }} />
      <OwnerScreen
        title="More"
        eyebrow="Owner console"
        subtitle="Retention and administration"
        actions={<SignOut />}>
        <RiseIn>
          <OwnerSection title="Retention">{renderRows(operations)}</OwnerSection>
        </RiseIn>

        <RiseIn index={1}>
          <OwnerSection title="Administration">{renderRows(administration)}</OwnerSection>
        </RiseIn>

        <RiseIn index={2}>
          <OwnerSection title="Legal documents">
            <OwnerWell>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
                <LegalLink doc="privacy" label="Privacy Policy" />
                <LegalLink doc="terms" label="Terms of Service" />
              </View>
              <AppText variant="caption" style={{ color: colors.ownerInkMuted, marginTop: spacing['3xs'] }}>
                Versioned drafts. Complete the placeholders and obtain legal review before publication.
              </AppText>
            </OwnerWell>
          </OwnerSection>
        </RiseIn>

        <RiseIn index={3} style={{ marginTop: spacing.md }}>
          <OwnerWell>
            <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
              Every write on these screens is an owner-gated server function with an audit entry
              written by the database. The reception desk owns application approval and payment
              verification; this console never records a payment or a membership decision on their
              behalf.
            </AppText>
          </OwnerWell>
        </RiseIn>
      </OwnerScreen>

      <OwnerBottomNavigation active="more" />
    </View>
  );
}
