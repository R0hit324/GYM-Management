/**
 * WS-8 — one shared in-app link to a legal document.
 *
 * Uses the single top-level `/legal/[doc]` route. There is no second
 * navigation tree and no duplicated policy screen per workspace.
 */
import { Link } from 'expo-router';

import { AppText } from '@/components/ui/text';
import { PressSurface } from '@/components/ui/press-surface';
import { useTokens } from '@/hooks/use-tokens';
import type { LegalDocumentId } from '@/constants/legal';

export function LegalLink(props: {
  doc: LegalDocumentId;
  label: string;
  tone?: 'auth' | 'light';
  /** Optional trailing note, e.g. the draft marker. */
  note?: string;
}) {
  const tokens = useTokens();
  const { colors, spacing } = tokens;
  const auth = props.tone === 'auth';
  const ink = auth ? colors.authInk : colors.ownerAccentDeep;

  return (
    <Link href={{ pathname: '/legal/[doc]', params: { doc: props.doc } } as never} asChild>
      <PressSurface
        accessibilityRole="link"
        accessibilityLabel={props.label}
        hitPadding={spacing['3xs']}
        scaleOnPress={false}
        style={{ minHeight: 44, justifyContent: 'center' }}>
        <AppText variant="label" style={{ color: ink, fontWeight: '600', textDecorationLine: 'underline' }}>
          {props.label}
        </AppText>
        {props.note ? (
          <AppText variant="caption" style={{ color: auth ? colors.authInkSubtle : colors.ownerInkSubtle }}>
            {props.note}
          </AppText>
        ) : null}
      </PressSurface>
    </Link>
  );
}
