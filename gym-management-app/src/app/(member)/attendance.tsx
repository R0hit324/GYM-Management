/**
 * Screen 3 — QR attendance (member).
 *
 * Part 1 renders the scanning experience and every result state; the
 * scanner camera, cryptographically-secure tokens, replay protection and
 * server validation arrive in Part 5. The status switcher below is an
 * explicitly-labelled review control, not a simulation of a successful scan.
 *
 * Coach Board layout: a member-dashboard composition — greeting header on
 * the unified PageHeader rhythm, membership card, ActionTile shortcuts that
 * scroll to their sections, the scanner, the training calendar and the
 * visit register. All data shown is demo data and stays labelled as such.
 */
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Card, Section, Well } from '@/components/ui/card';
import { ActionGrid, ActionTile } from '@/components/ui/action-tile';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { ListGroup, ListRow, RowDivider, MemberAvatar } from '@/components/ui/list-row';
import { RiseIn } from '@/components/ui/rise-in';
import { AttendanceCalendar } from '@/components/attendance-calendar';
import { DemoBadge } from '@/components/ui/demo-badge';
import { Ionicons } from '@expo/vector-icons';
import { SignOut } from '@/components/workspace-meta';
import { useTokens } from '@/hooks/use-tokens';
import { demoAttendance, demoMemberHistory, demoMembers, demoPlans } from '@/data/demo';
import { formatTime, formatDate } from '@/utils/format';

const scanStates = [
  { value: 'ready', label: 'Ready to scan' },
  { value: 'invalid', label: 'Invalid QR' },
  { value: 'expired', label: 'Expired QR' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'success', label: 'Checked in' },
] as const;

const outcome: Record<(typeof scanStates)[number]['value'], { title: string; body: string; tone: StatusTone; badge: string }> = {
  ready: {
    title: 'Hold your QR at the entrance',
    body: 'Point the camera at the QR shown on the reception screen. Tokens refresh every 45 seconds; an old screenshot will not work.',
    tone: 'info',
    badge: 'Awaiting scan',
  },
  invalid: {
    title: 'That QR is not an attendance code',
    body: 'The code scanned does not belong to this gym. Attendance was not recorded. Show your membership screen or ask at the desk.',
    tone: 'danger',
    badge: 'Invalid code',
  },
  expired: {
    title: 'This code has expired',
    body: 'Attendance codes live for about 45 seconds. Ask the desk to show the current one and scan again.',
    tone: 'warning',
    badge: 'Expired code',
  },
  inactive: {
    title: 'Membership is not active',
    body: 'Attendance cannot be recorded while membership is expired or frozen. The desk can take a renewal or freeze request.',
    tone: 'danger',
    badge: 'Membership inactive',
  },
  success: {
    title: 'Checked in',
    body: 'Enjoy the session. Multiple check-ins a day are allowed: scan again when you return.',
    tone: 'success',
    badge: 'Recorded',
  },
};

/** Shortcut tiles scroll to these content keys. */
type JumpKey = 'plan' | 'scan' | 'progress';

export default function MemberAttendanceScreen() {
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const { colors, spacing, radius } = tokens;

  const [state, setState] = useState<(typeof scanStates)[number]['value']>('ready');
  const [history, setHistory] = useState(true);
  const [listState, setListState] = useState<'full' | 'loading' | 'empty' | 'error'>('loading');

  useEffect(() => {
    // Demo data load simulation so the loading state is real and
    // reviewable. Nothing network-related happens.
    const t = setTimeout(() => setListState('full'), 900);
    return () => clearTimeout(t);
  }, []);

  const myEvents = useMemo(() => demoAttendance.filter((e) => e.memberId === 'm-1042'), []);
  // Calendar feeds on the generated demo history plus today's demo check-ins.
  const calendarEvents = useMemo(() => [...demoMemberHistory, ...myEvents], [myEvents]);
  const o = outcome[state];

  // Membership summary — straight from the demo member record, labelled demo.
  const me = useMemo(() => demoMembers.find((m) => m.id === 'm-1042'), []);
  const myPlan = useMemo(() => demoPlans.find((p) => p.id === me?.planId), [me]);
  const firstName = me ? me.name.split(' ')[0] : 'Member';
  const isActive = me?.status === 'active';

  // This-week activity: verified demo check-ins since Monday, over the days
  // elapsed in the week. Computed from the demo events, never asserted.
  const weekStats = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7)); // Monday
    const days = new Set<string>();
    for (const e of calendarEvents) {
      if (e.status !== 'verified') continue;
      const d = new Date(e.checkedInAt);
      d.setHours(0, 0, 0, 0);
      if (d >= weekStart) days.add(d.toDateString());
    }
    const elapsed = Math.min(7, Math.floor((Date.now() - weekStart.getTime()) / 86400000) + 1);
    return { trained: days.size, elapsed };
  }, [calendarEvents]);

  // Scroll-to plumbing for the shortcut tiles.
  const scrollRef = useRef<ComponentRef<typeof ScrollView> | null>(null);
  const sectionY = useRef<Partial<Record<JumpKey, number>>>({});
  const jump = (key: JumpKey) => {
    scrollRef.current?.scrollTo({ y: Math.max(0, (sectionY.current[key] ?? 0) - 8), animated: true });
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.paper }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Greeting header (fixed) */}
      <View
        style={{
          paddingTop: insets.top + 8,
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing.sm,
          borderBottomWidth: 1,
          borderBottomColor: colors.rule,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
        }}>
        <View
          accessible
          accessibilityLabel={`Signed in view of demo member ${me?.name ?? 'member'}`}
          style={{
            width: 44,
            height: 44,
            borderRadius: radius.pill,
            backgroundColor: colors.accentBg,
            borderWidth: 1,
            borderColor: colors.rule,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Ionicons name="person" size={22} color={colors.accentBright} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' }}>
            <AppText variant="title">Hello, {firstName}</AppText>
            <DemoBadge />
          </View>
          <AppText variant="caption" tone="muted">
            Member · {me?.name ?? 'Demo member'} (demo)
          </AppText>
        </View>
        <SignOut />
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl + 24 }}
        keyboardShouldPersistTaps="handled">
        <WorkspaceRow />

        {/* My membership — from the demo member record */}
        <RiseIn>
          <View
            onLayout={(e) => {
              sectionY.current.plan = e.nativeEvent.layout.y;
            }}
            accessibilityLabel={`My membership: ${myPlan?.name ?? ''} plan, ${isActive ? 'active' : me?.status ?? ''}, valid till ${me?.membershipEnd ? formatDate(me.membershipEnd) : 'unknown'}. Demo data.`}
            accessible
            style={{
              marginTop: spacing.md,
              backgroundColor: colors.surface,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: colors.rule,
              padding: spacing.md,
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.sm,
            }}>
            <View style={{ flex: 1, minWidth: 0, gap: spacing['3xs'] }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <AppText variant="label" tone="muted">
                  My Membership
                </AppText>
                {isActive ? (
                  <StatusBadge label="Active" tone="success" small />
                ) : (
                  <StatusBadge label={me?.status ?? 'Unknown'} tone="warning" small />
                )}
              </View>
              <AppText variant="figureSmall">{myPlan?.name ?? '—'} Plan</AppText>
              <AppText variant="caption" tone="muted">
                Valid till {me?.membershipEnd ? formatDate(me.membershipEnd) : '—'} · demo data
              </AppText>
            </View>
            <Ionicons name="barbell" size={30} color={colors.accent} />
          </View>
        </RiseIn>

        {/* Quick shortcuts — ActionTile grid, scroll to the matching section */}
        <RiseIn index={1}>
          <ActionGrid style={{ marginTop: spacing.sm }}>
            {([
              { key: 'scan', icon: 'scan-outline' as const, label: 'Attendance' },
              { key: 'plan', icon: 'card-outline' as const, label: 'My Plan' },
              { key: 'progress', icon: 'stats-chart' as const, label: 'Progress' },
            ] as { key: JumpKey; icon: keyof typeof Ionicons.glyphMap; label: string }[]).map((tile) => (
              <ActionTile
                key={tile.key}
                icon={tile.icon}
                label={tile.label}
                tone="accent"
                onPress={() => jump(tile.key)}
                accessibilityHint="Scrolls to the matching section below"
                style={{ flex: 1, minWidth: 96 }}
              />
            ))}
          </ActionGrid>
        </RiseIn>

        {/* This-week activity (computed from demo check-ins) */}
        <RiseIn index={2}>
          <View
            accessibilityLabel={`This week: trained on ${weekStats.trained} of ${weekStats.elapsed} days. Demo data.`}
            accessible
            style={{
              marginTop: spacing.sm,
              backgroundColor: colors.surface,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.rule,
              padding: spacing.md,
              gap: spacing.xs,
            }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <AppText variant="bodyStrong">This Week</AppText>
              <AppText variant="figureSmall" style={{ color: colors.accent }}>
                {weekStats.trained}/{weekStats.elapsed}
              </AppText>
            </View>
            <View style={{ height: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
              <View
                style={{
                  height: '100%',
                  borderRadius: radius.pill,
                  backgroundColor: colors.accent,
                  width: `${Math.round((weekStats.trained / Math.max(1, weekStats.elapsed)) * 100)}%`,
                }}
              />
            </View>
            <AppText variant="caption" tone="subtle">
              Counted from your demo check-ins; the register confirms every session.
            </AppText>
          </View>
        </RiseIn>

        <RiseIn index={3}>
          <View
            onLayout={(e) => {
              sectionY.current.scan = e.nativeEvent.layout.y;
            }}
            accessibilityLabel={`Scanner, ${o.badge}`}
            style={{
              marginTop: spacing.md,
              borderRadius: radius.md,
              overflow: 'hidden',
              backgroundColor: colors.paper,
              borderWidth: 1,
              borderColor: colors.rule,
            }}>
            {/* Scanner surface */}
            <View style={{ height: 210, alignItems: 'center', justifyContent: 'center' }}>
              <View
                style={{
                  width: 158,
                  height: 158,
                  borderRadius: radius.md,
                  borderWidth: 2,
                  borderColor: state === 'success' ? colors.success : state === 'ready' ? colors.accent : colors.danger,
                  borderStyle: 'dashed',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: spacing.xs,
                }}>
                <Ionicons
                  name={state === 'success' ? 'checkmark-circle' : state === 'ready' ? 'scan-outline' : 'warning-outline'}
                  size={44}
                  color={state === 'success' ? colors.success : state === 'ready' ? colors.accent : colors.danger}
                />
                <AppText variant="caption" align="center" style={{ paddingHorizontal: spacing.sm }}>
                  {state === 'ready' ? 'Centre the code inside the frame' : o.badge}
                </AppText>
              </View>
            </View>
            <View style={{ backgroundColor: colors.surface, padding: spacing.md, gap: spacing.xs }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <AppText variant="bodyStrong">{o.title}</AppText>
                <StatusBadge label={o.badge} tone={o.tone} small />
              </View>
              <AppText variant="label" tone="muted">
                {o.body}
              </AppText>
              {/* Review control: switch designed states. Removed in Part 5 when
                  the real scanner drives these outcomes. */}
              <View style={{ marginTop: spacing.xs }}>
                <AppText variant="caption" tone="subtle">
                  Review control, removed when the camera lands:
                </AppText>
                <View style={{ marginTop: spacing['3xs'] }}>
                  <SegmentedTabs
                    size="small"
                    options={scanStates.map((s) => ({ value: s.value, label: s.label }))}
                    value={state}
                    onChange={(v) => setState(v as typeof state)}
                  />
                </View>
              </View>
            </View>
          </View>
        </RiseIn>

        {/* Camera permission note (state designed; request happens in Part 5) */}
        <RiseIn index={4}>
          <Well style={{ marginTop: spacing.md }}>
            <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start' }}>
              <Ionicons name="camera-outline" size={18} color={colors.inkMuted} style={{ marginTop: spacing['3xs'] }} />
              <View style={{ flex: 1 }}>
                <AppText variant="label" tone="muted">
                  Camera permission belongs to the scanner. This preview does not open the camera; Part 5 requests permission with a plain-language reason.
                </AppText>
              </View>
            </View>
          </Well>
        </RiseIn>

        {/* Training calendar (demo history + today's demo check-ins) */}
        <RiseIn index={5}>
          <View
            onLayout={(e) => {
              sectionY.current.progress = e.nativeEvent.layout.y;
            }}
            style={{ marginTop: spacing.xl }}>
            <Section title="Training calendar" style={{ marginTop: 0 }}>
              <AttendanceCalendar events={calendarEvents} />
            </Section>
          </View>
        </RiseIn>

        {/* Attendance history */}
        <View style={{ marginTop: spacing.xl }}>
          <Section title="My visits" style={{ marginTop: 0 }} action={
            <Button
              label={history ? 'Hide' : 'Show'}
              size="small"
              variant="ghost"
              onPress={() => setHistory((h) => !h)}
            />
          }>
          {history &&
            (listState === 'loading' ? (
              <Card padded>
                <RowsSkeleton count={2} />
              </Card>
            ) : listState === 'error' ? (
              <ErrorCard onRetry={() => setListState('full')} />
            ) : myEvents.length === 0 || listState === 'empty' ? (
              <Card padded>
                <AppText variant="bodyStrong">No visits yet</AppText>
                <AppText variant="label" tone="muted" style={{ marginTop: spacing['3xs'] }}>
                  Your first check-in will appear here. Plan a session and scan at the door.
                </AppText>
                <Button label="Plan your first session" size="small" variant="secondary" style={{ alignSelf: 'flex-start', marginTop: spacing.xs }} />
              </Card>
            ) : (
              <RiseIn index={6}>
                <ListGroup label="Attendance history">
                  {myEvents.map((e, i) => (
                    <View key={e.id}>
                      {i > 0 && <RowDivider />}
                      <ListRow
                        leading={<MemberAvatar name={e.memberName} />}
                        title={formatTime(e.checkedInAt)}
                        detail={`${formatDate(e.checkedInAt)} · ${e.door}`}
                        status={
                          <StatusBadge
                            label={e.status === 'verified' ? 'Recorded' : e.status === 'frozen' ? 'Frozen' : 'Failed'}
                            tone={e.status === 'verified' ? 'success' : e.status === 'frozen' ? 'info' : 'danger'}
                            small
                          />
                        }
                      />
                    </View>
                  ))}
                </ListGroup>
              </RiseIn>
            ))}
          {!history && listState !== 'loading' && (
            <AppText variant="caption" tone="subtle" style={{ marginTop: spacing.xs }}>
              History hidden. Check-ins per day are allowed more than once; each scan is its own register row.
            </AppText>
          )}
          </Section>

          {/* List state review control (loading, empty, error are designed). */}
          {!history && listState !== 'loading' && (
            <View style={{ marginTop: spacing.sm }}>
              <AppText variant="caption" tone="subtle">
                Review control for the visit list:
              </AppText>
              <View style={{ marginTop: spacing['3xs'] }}>
                <SegmentedTabs
                  size="small"
                  options={[
                    { value: 'full', label: 'Full' },
                    { value: 'empty', label: 'Empty' },
                    { value: 'error', label: 'Error' },
                  ]}
                  value={listState}
                  onChange={(v) => setListState(v as typeof listState)}
                />
              </View>
            </View>
          )}

          {/* Empty state preview */}
          {!history && (
            <Card style={{ marginTop: spacing.md }} padded>
              <AppText variant="label" tone="muted">
                No visits on the register yet? The member list opens with an empty state and one action: plan your first session.
              </AppText>
              <EmptyRow />
            </Card>
          )}
        </View>

        <AppText variant="caption" tone="subtle" align="center" style={{ marginTop: spacing.lg }}>
          A member is flagged inactive after 30 days without a recorded check-in. Scans, tokens and attendance writes are server-side (Part 5).
        </AppText>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Role chip row beneath the greeting (workspace identity, demo-labelled). */
function WorkspaceRow() {
  const tokens = useTokens();
  const { spacing } = tokens;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md }}>
      <StatusBadge label="Member view" tone="member" small />
      <DemoBadge small label="Demo session" />
    </View>
  );
}

function RowsSkeleton({ count }: { count: number }) {
  const tokens = useTokens();
  const { colors, spacing, radius } = tokens;
  return (
    <View style={{ gap: spacing.sm }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
          <View style={{ width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt }} />
          <View style={{ flex: 1, gap: spacing.xs }}>
            <View style={{ height: 12, width: '45%', borderRadius: radius.xs, backgroundColor: colors.surfaceAlt }} />
            <View style={{ height: 10, width: '70%', borderRadius: radius.xs, backgroundColor: colors.surfaceAlt }} />
          </View>
        </View>
      ))}
    </View>
  );
}

function ErrorCard(props: { onRetry: () => void }) {
  const tokens = useTokens();
  const { colors, spacing, radius } = tokens;
  return (
    <View
      accessibilityRole="alert"
      style={{
        backgroundColor: colors.dangerBg,
        borderRadius: radius.md,
        padding: spacing.md,
        gap: spacing.xs,
        marginTop: spacing.sm,
      }}>
      <AppText variant="bodyStrong" style={{ color: colors.dangerOnBg }}>
        Could not load your visits
      </AppText>
      <AppText variant="label" style={{ color: colors.dangerOnBg }}>
        The register did not answer. Check the connection and try again.
      </AppText>
      <Button label="Try again" size="small" variant="secondary" onPress={props.onRetry} style={{ alignSelf: 'flex-start' }} />
    </View>
  );
}

function EmptyRow() {
  const tokens = useTokens();
  const { colors, spacing, radius } = tokens;
  return (
    <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'center', marginTop: spacing.sm }}>
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          gap: spacing['3xs'],
          paddingVertical: spacing.sm,
          backgroundColor: colors.surfaceAlt,
          borderRadius: radius.sm,
        }}>
        <AppText variant="label" tone="muted">
          No visits yet
        </AppText>
        <AppText variant="caption" tone="subtle">
          Your first check-in will appear here
        </AppText>
      </View>
    </View>
  );
}
