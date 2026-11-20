/**
 * Owner audit log — the append-only trail of authority actions.
 *
 * Reads `audit_log_entries` through the owner-only select policy, newest
 * first and bounded to the latest page. The row is displayed as stored: the
 * action, table, target and actor are never renamed or reinterpreted, and the
 * old/new JSON stays behind a collapsed detail instead of being dumped.
 *
 * Demo mode has no audit rows (they are server-produced), so it shows an
 * honest empty state rather than sample entries that never happened.
 */
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AppText } from '@/components/ui/text';
import { SearchBar } from '@/components/ui/search-bar';
import { RiseIn } from '@/components/ui/rise-in';
import { SignOut } from '@/components/workspace-meta';
import {
  OwnerScreen,
  OwnerBottomNavigation,
  OwnerSection,
  OwnerListGroup,
  OwnerListRow,
  OwnerRowDivider,
  OwnerEmptyState,
  OwnerWell,
} from '@/components/owner/owner-ui';
import { DataRefreshControl, ErrorState, SkeletonRow } from '@/components/ui/feedback';
import { useTokens } from '@/hooks/use-tokens';
import { useAuditLog } from '@/services/data';
import { formatDate, formatTime } from '@/utils/format';
import type { AuditLogEntry } from '@/types/domain';

function shortId(value: string | null): string {
  if (!value) return 'no target';
  return value.length > 8 ? `${value.slice(0, 8)}…` : value;
}

function actorLabel(entry: AuditLogEntry): string {
  const role = entry.actorRole ?? 'unknown role';
  const id = entry.actorId ? shortId(entry.actorId) : 'no actor';
  return `${role} · ${id}`;
}

export default function OwnerAuditScreen() {
  const tokens = useTokens();
  const { colors, spacing } = tokens;

  const auditResource = useAuditLog();
  const live = auditResource.isLive;
  const entries = auditResource.data;
  const loading = auditResource.status === 'loading';
  const hasError = auditResource.status === 'error';

  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((entry) => {
      const haystack = [
        entry.action,
        entry.tableName,
        entry.actorRole ?? '',
        entry.actorId ?? '',
        entry.rowId ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [entries, query]);

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Stack.Screen options={{ headerShown: false }} />
      <OwnerScreen
        title="Audit log"
        eyebrow="Administration"
        subtitle={live ? 'Every authority action, newest first' : 'Server-only records'}
        demo={!live}
        actions={<SignOut />}
        refreshControl={
          live ? (
            <DataRefreshControl refreshing={loading} onRefresh={auditResource.refresh} />
          ) : undefined
        }>
        {hasError && (
          <RiseIn>
            <ErrorState
              title="Audit log could not load"
              message={auditResource.error ?? 'The audit page is unavailable right now.'}
              onRetry={auditResource.refresh}
            />
          </RiseIn>
        )}
        {live && loading && entries.length === 0 ? (
          <RiseIn style={{ marginTop: spacing.sm }}>
            <SkeletonRow count={4} />
          </RiseIn>
        ) : null}

        <RiseIn>
          <OwnerWell>
            <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
              {live
                ? 'Read-only and owner-only. Rows are append-only records written by the authority functions; this screen never edits or deletes one. Expansions show the stored old/new values exactly as the database recorded them.'
                : 'Audit rows are produced by server actions, so demo mode has none. Nothing is invented here; the page fills in live mode.'}
            </AppText>
          </OwnerWell>
        </RiseIn>

        {live && entries.length > 0 && (
          <RiseIn index={1} style={{ marginTop: spacing.sm }}>
            <SearchBar
              label="Search the audit page"
              value={query}
              onChange={setQuery}
              placeholder="Action, table, role or id"
            />
          </RiseIn>
        )}

        <RiseIn index={2} style={{ marginTop: spacing.sm }}>
          <OwnerSection
            title={`Latest ${entries.length === 1 ? 'entry' : 'entries'} — ${rows.length} shown`}>
            {entries.length === 0 ? (
              <OwnerEmptyState
                icon="shield-checkmark-outline"
                title={live ? 'No audit entries yet' : 'No audit entries in demo mode'}
                hint={
                  live
                    ? 'The first authority action will appear here with its actor and stored values.'
                    : 'Audit rows are written by the server; connect the live backend to read them.'
                }
              />
            ) : rows.length === 0 ? (
              <OwnerEmptyState
                icon="search-outline"
                title="No matching entries"
                hint="Try a shorter search or clear it."
                actionLabel="Clear search"
                onAction={() => setQuery('')}
              />
            ) : (
              <OwnerListGroup>
                {rows.map((entry, index) => {
                  const open = openId === entry.id;
                  return (
                    <View key={entry.id}>
                      {index > 0 && <OwnerRowDivider />}
                      <OwnerListRow
                        title={entry.action}
                        detail={`${entry.tableName} · ${shortId(entry.rowId)} · ${actorLabel(entry)}`}
                        status={
                          <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
                            {formatDate(entry.at)} · {formatTime(entry.at)}
                          </AppText>
                        }
                        chevron
                        onPress={() => setOpenId(open ? null : entry.id)}
                      />
                      {open && (
                        <OwnerWell style={{ marginBottom: spacing.sm }}>
                          <AppText variant="label" style={{ color: colors.ownerInkMuted }}>
                            Recorded
                          </AppText>
                          <AppText variant="caption" style={{ color: colors.ownerInk }}>
                            {formatDate(entry.at)} · {formatTime(entry.at)} · {actorLabel(entry)}
                          </AppText>
                          <AppText variant="label" style={{ color: colors.ownerInkMuted, marginTop: spacing.xs }}>
                            Row id
                          </AppText>
                          <AppText variant="caption" style={{ color: colors.ownerInk }}>
                            {entry.rowId ?? 'No row id recorded'}
                          </AppText>
                          <AppText variant="label" style={{ color: colors.ownerInkMuted, marginTop: spacing.xs }}>
                            Old values (stored JSON)
                          </AppText>
                          <AppText variant="caption" style={{ color: colors.ownerInk }}>
                            {entry.oldValues ? JSON.stringify(entry.oldValues) : 'None recorded'}
                          </AppText>
                          <AppText variant="label" style={{ color: colors.ownerInkMuted, marginTop: spacing.xs }}>
                            New values (stored JSON)
                          </AppText>
                          <AppText variant="caption" style={{ color: colors.ownerInk }}>
                            {entry.newValues ? JSON.stringify(entry.newValues) : 'None recorded'}
                          </AppText>
                        </OwnerWell>
                      )}
                    </View>
                  );
                })}
              </OwnerListGroup>
            )}
            <AppText variant="caption" style={{ color: colors.ownerInkSubtle, marginTop: spacing.xs }}>
              This page is bounded to the latest 200 entries, newest first. It is not an export and
              cannot be filtered by date yet.
            </AppText>
          </OwnerSection>
        </RiseIn>
      </OwnerScreen>

      <OwnerBottomNavigation active="more" />
    </View>
  );
}
