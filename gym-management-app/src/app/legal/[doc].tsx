/**
 * WS-8 — single in-app reader for the Privacy Policy and Terms of Service.
 *
 * Route: /legal/[doc] (doc = privacy | terms). The text comes from the
 * versioned `src/constants/legal.ts` module. The screen is reachable from
 * the auth join flow, the member privacy screen and the owner More hub —
 * one route, no duplicated navigation.
 */
import { ScrollView, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { PressSurface } from '@/components/ui/press-surface';
import { useTokens } from '@/hooks/use-tokens';
import {
  LEGAL_DRAFT_LABEL,
  LEGAL_PLACEHOLDERS,
  getLegalDocument,
  type LegalSection,
} from '@/constants/legal';

export default function LegalDocumentScreen() {
  const tokens = useTokens();
  const { colors, spacing, radius } = tokens;
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ doc?: string }>();
  const document = getLegalDocument(params.doc);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/login');
  };

  if (!document) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.ownerPanelBg, paddingTop: insets.top }}>
        <StatusBar style="dark" />
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ padding: spacing.lg, gap: spacing.sm }}>
          <AppText variant="title" style={{ color: colors.ownerInk }}>
            Document not found
          </AppText>
          <AppText variant="body" style={{ color: colors.ownerInkMuted }}>
            The requested legal document does not exist in this build.
          </AppText>
          <Button label="Go back" icon="arrow-back" variant="secondary" onPress={goBack} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.ownerPanelBg, paddingTop: insets.top }}>
      <StatusBar style="light" />
      <Stack.Screen options={{ headerShown: false }} />

      {/* Dark header keeps the reader anchored to the app chrome. */}
      <View
        style={{
          backgroundColor: colors.ownerBg,
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.sm,
          paddingBottom: spacing.md,
        }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <PressSurface
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitPadding={spacing.xs}
            scaleOnPress={false}
            onPress={goBack}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="arrow-back" size={22} color={colors.ownerHeroInk} />
          </PressSurface>
          <AppText variant="label" style={{ color: colors.ownerAccent, letterSpacing: 1.2 }}>
            LEGAL
          </AppText>
        </View>
        <AppText variant="display" style={{ color: colors.ownerHeroInk, marginTop: spacing['3xs'] }}>
          {document.title}
        </AppText>
        <AppText variant="caption" style={{ color: colors.ownerHeroMuted, marginTop: 2 }}>
          Version {document.version} · Updated {document.updated}
        </AppText>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl, gap: spacing.md }}>
        <View
          style={{
            backgroundColor: colors.ownerPanel,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.ownerRule,
            padding: spacing.md,
            gap: spacing.xs,
          }}>
          <AppText variant="label" style={{ color: colors.dangerStrong, fontWeight: '700' }}>
            {LEGAL_DRAFT_LABEL}
          </AppText>
          <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
            This is a product-specific draft based on the features that actually exist in the app. It is
            not legal advice and is not approved for publication. The gym owner and a qualified legal
            adviser must complete every placeholder and approve the text before it is published or relied
            upon.
          </AppText>
          <AppText variant="caption" style={{ color: colors.ownerInkSubtle }}>
            Placeholders are shown in [SQUARE BRACKETS]: {LEGAL_PLACEHOLDERS.join(' · ')}.
          </AppText>
        </View>

        <View
          style={{
            backgroundColor: colors.ownerPanel,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.ownerRule,
            padding: spacing.md,
            gap: spacing.lg,
          }}>
          <AppText variant="body" style={{ color: colors.ownerInk }}>
            {document.summary}
          </AppText>
          {document.sections.map((section) => (
            <SectionView key={section.id} section={section} />
          ))}
        </View>

        <Button label="Back to the app" icon="arrow-back" variant="secondary" fullWidth onPress={goBack} />
        <AppText variant="caption" align="center" style={{ color: colors.ownerInkSubtle }}>
          {document.title} · version {document.version} · {LEGAL_DRAFT_LABEL}
        </AppText>
      </ScrollView>
    </View>
  );
}

function SectionView({ section }: { section: LegalSection }) {
  const tokens = useTokens();
  const { colors, spacing } = tokens;
  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="heading" style={{ color: colors.ownerInk }}>
        {section.heading}
      </AppText>
      {section.paragraphs?.map((paragraph, index) => (
        <DocumentParagraph key={`p-${index}`} text={paragraph} />
      ))}
      {section.bullets && (
        <View style={{ gap: spacing['3xs'] }}>
          {section.bullets.map((bullet, index) => (
            <View key={`b-${index}`} style={{ flexDirection: 'row', gap: spacing.xs }}>
              <AppText variant="body" style={{ color: colors.ownerAccentDeep }}>
                •
              </AppText>
              <View style={{ flex: 1, minWidth: 0 }}>
                <DocumentParagraph text={bullet} />
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/** Renders [PLACEHOLDERS] in the draft colour so the owner can find them. */
function DocumentParagraph({ text }: { text: string }) {
  const tokens = useTokens();
  const { colors } = tokens;
  const parts = text.split(/(\[[^\]]+\])/g);
  return (
    <AppText variant="body" style={{ color: colors.ownerInkMuted }}>
      {parts.map((part, index) =>
        /^\[[^\]]+\]$/.test(part) ? (
          <Text key={`ph-${index}`} style={{ color: colors.dangerStrong, fontWeight: '600' }}>
            {part}
          </Text>
        ) : (
          part
        ),
      )}
    </AppText>
  );
}
