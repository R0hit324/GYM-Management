/**
 * Attendance Register — calendar-based member attendance search.
 *
 * The desk's authoritative register (brief §4.B): search a member by
 * name, phone or member ID, pick any month and year, and read that
 * member's attendance off a proper monthly grid — marker dots on attended
 * days, per-date records (time, door, status; multiple events listed),
 * and a monthly summary (attendance days, attendance events, first and
 * last attendance). Check-out times do not exist in the records, so none
 * are shown; every figure derives from the demo-labelled records and
 * nothing is invented.
 *
 * Data sources: demoAttendance plus the member's generated history
 * (demoMemberHistory). Members other than the demo-history member show
 * only the records that actually exist, with honest empty states.
 *
 * The screen keeps the full today's register (search and status filters
 * over every check-in event of the day) so the Home preview's "Full
 * register" link stays truthful. Attendance QR lives on its own screen.
 */
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { AppText } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { StatRow } from '@/components/ui/stat-tile';
import { SearchBar } from '@/components/ui/search-bar';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { ModalSheet } from '@/components/ui/modal-sheet';
import { AttendanceMonthGrid } from '@/components/attendance-month-grid';
import { RiseIn } from '@/components/ui/rise-in';
import { SignOut } from '@/components/workspace-meta';
import {
  WorkspaceScreen,
  WorkspaceBottomNavigation,
  WorkspaceSection,
  WorkspaceRowDivider,
  WorkspaceWell,
} from '@/components/workspace/workspace-ui';
import {
  OwnerStatTile,
  OwnerListGroup,
  OwnerListRow,
  OwnerMemberAvatar,
  OwnerStatusText,
  OwnerEmptyState,
} from '@/components/owner/owner-ui';
import { useTokens } from '@/hooks/use-tokens';
import { demoAttendance, demoMemberHistory, demoMembers } from '@/data/demo';
import {
  addMonth,
  dayKey,
  eventsByDay,
  MONTH_NAMES,
  monthSummary,
  parseDayKey,
  type MonthPosition,
} from '@/utils/calendar';
import { displayMembershipStatus } from '@/utils/membership';
import { formatDate, formatTime, isSameLocalDay, pluralise } from '@/utils/format';
import type { AttendanceEvent, MembershipStatus } from '@/types/domain';

const statusTone: Record<MembershipStatus, 'up' | 'down' | 'neutral' | 'warning' | 'action'> = {
  active: 'up',
  expiring: 'warning',
  expired: 'down',
  frozen: 'neutral',
  pendingPayment: 'action',
};

const statusLabel: Record<MembershipStatus, string> = {
  active: 'Active',
  expiring: 'Expiring',
  expired: 'Expired',
  frozen: 'Frozen',
  pendingPayment: 'Payment pending',
};

const eventFilters = [
  { value: 'all', label: 'All' },
  { value: 'verified', label: 'Recorded' },
  { value: 'failed', label: 'Failed' },
  { value: 'frozen', label: 'Frozen' },
];

const navItems = [
  { key: 'home', label: 'Home', icon: 'home-outline', href: '/(reception)/home' },
  { key: 'members', label: 'Members', icon: 'people-outline', href: '/(reception)/members' },
  { key: 'more', label: 'More', icon: 'apps-outline', href: '/(reception)/more' },
] as const;

const eventRowStatus = (e: AttendanceEvent) =>
  e.status === 'verified'
    ? { label: 'Recorded', tone: 'up' as const }
    : e.status === 'frozen'
      ? { label: 'Frozen', tone: 'neutral' as const }
      : { label: 'Failed', tone: 'down' as const };

export default function AttendanceRegisterScreen() {
  const tokens = useTokens();
  const { colors, spacing } = tokens;

  // The Members profile hands the member over as ?member=<id>.
  const params = useLocalSearchParams<{ member?: string }>();
  const [memberId, setMemberId] = useState<string | null>(typeof params.member === 'string' ? params.member : null);
  const [memberQuery, setMemberQuery] = useState('');
  const [yearMonth, setYearMonth] = useState<MonthPosition | null>(null); // null = today's month
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [yearOpen, setYearOpen] = useState(false);

  // Today's register (kept from the previous layout): every event of the day.
  const [todayQuery, setTodayQuery] = useState('');
  const [todayFilter, setTodayFilter] = useState('all');

  // Midnight today, stable across renders.
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const todayKey = dayKey(today);

  // null means "today's month" — the register always opens on today. The
  // position is memoised so it is a stable useMemo dependency.
  const pos = useMemo<MonthPosition>(
    () => yearMonth ?? { year: today.getFullYear(), month: today.getMonth() },
    [yearMonth, today],
  );
  const selected = selectedKey ?? todayKey;

  const member = useMemo(() => demoMembers.find((m) => m.id === memberId) ?? null, [memberId]);

  // The member's actual records: the demo register plus their generated
  // history — the only data sources (no invented records).
  const events = useMemo(
    () => (member ? [...demoAttendance, ...demoMemberHistory].filter((e) => e.memberId === member.id) : []),
    [member],
  );

  const memberResults = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    if (!q) return [];
    return demoMembers.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.phone.replace(/\s/g, '').toLowerCase().includes(q.replace(/\s/g, '')) ||
        (digits.length > 0 && (m.id.includes(digits) || m.phone.replace(/\D/g, '').includes(digits))),
    );
  }, [memberQuery]);

  const monthEvents = useMemo(() => eventsByDay(events, pos.year, pos.month), [events, pos]);
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const [key, list] of monthEvents) {
      const verified = list.filter((e) => e.status === 'verified').length;
      if (verified > 0) map.set(key, verified);
    }
    return map;
  }, [monthEvents]);
  const summary = useMemo(() => monthSummary(events, pos.year, pos.month), [events, pos]);

  // Browsable years: bounded by the records and the current year, so empty
  // history months inside the range stay reachable.
  const years = useMemo(() => {
    let min = today.getFullYear() - 2;
    let max = today.getFullYear();
    for (const e of events) {
      const y = new Date(e.checkedInAt).getFullYear();
      if (y < min) min = y;
      if (y > max) max = y;
    }
    const list: number[] = [];
    for (let y = min; y <= max; y++) list.push(y);
    return list;
  }, [events, today]);

  const dayEvents = useMemo(
    () => [...(monthEvents.get(selected) ?? [])].sort((a, b) => a.checkedInAt.localeCompare(b.checkedInAt)),
    [monthEvents, selected],
  );

  const todayRows = useMemo(() => {
    const q = todayQuery.trim().toLowerCase();
    return demoAttendance
      .filter((e) => isSameLocalDay(e.checkedInAt))
      .filter((e) => {
        const matchesQuery = !q || e.memberName.toLowerCase().includes(q) || e.memberIdDisplay.toLowerCase().includes(q);
        const matchesFilter = todayFilter === 'all' || e.status === todayFilter;
        return matchesQuery && matchesFilter;
      });
  }, [todayQuery, todayFilter]);

  const todayCount = demoAttendance.filter((e) => isSameLocalDay(e.checkedInAt) && e.status !== 'failed').length;
  const todayUnique = new Set(demoAttendance.filter((e) => isSameLocalDay(e.checkedInAt) && e.status !== 'failed').map((e) => e.memberId)).size;

  return (
    <View style={{ flex: 1 }}>
      <WorkspaceScreen
        title="Attendance Register"
        eyebrow="Attendance"
        subtitle="Any member, any month"
        demo
        actions={<SignOut />}>
        <RiseIn>
          <StatRow>
            <OwnerStatTile
              label="Check-in events today"
              value={String(todayCount)}
              count={todayCount}
              hint="Multiple per member allowed"
              icon="walk-outline"
              tone="cyan"
            />
            <OwnerStatTile
              label="Unique members today"
              value={String(todayUnique)}
              count={todayUnique}
              hint="Members, not scans"
              icon="people-outline"
              tone="violet"
            />
          </StatRow>
        </RiseIn>

        {/* 1 — Member search and selection */}
        <RiseIn index={1} style={{ marginTop: spacing.md }}>
          <WorkspaceSection title="Member">
            {member ? (
              <View>
                <View
                  style={{
                    backgroundColor: colors.ownerPanel,
                    borderRadius: tokens.radius.md,
                    borderWidth: 1,
                    borderColor: colors.ownerRule,
                    padding: spacing.sm,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.sm,
                  }}>
                  <OwnerMemberAvatar name={member.name} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText variant="bodyStrong" numberOfLines={1} style={{ color: colors.ownerInk }}>
                      {member.name}
                    </AppText>
                    <AppText variant="caption" numberOfLines={1} style={{ color: colors.ownerInkMuted }}>
                      {member.id.replace('m-', 'GB-').toUpperCase()} · {statusLabel[displayMembershipStatus(member)]}
                      {member.status !== 'frozen' && member.status !== 'pendingPayment'
                        ? ` · ends ${formatDate(member.membershipEnd ?? member.joinedOn)}`
                        : ''}
                    </AppText>
                  </View>
                  <Button
                    label="Change"
                    size="small"
                    variant="secondary"
                    onPress={() => {
                      setMemberId(null);
                      setMemberQuery('');
                      setYearMonth(null);
                      setSelectedKey(null);
                    }}
                  />
                </View>
              </View>
            ) : (
              <View>
                <SearchBar
                  label="Search a member by name, phone or member ID"
                  value={memberQuery}
                  onChange={setMemberQuery}
                  placeholder="Name, phone or member number"
                />
                {memberResults.length > 0 && (
                  <View style={{ marginTop: spacing.sm }}>
                    <OwnerListGroup label="Search results">
                      {memberResults.map((m, i) => (
                        <View key={m.id}>
                          {i > 0 && <WorkspaceRowDivider />}
                          <OwnerListRow
                            leading={<OwnerMemberAvatar name={m.name} />}
                            title={m.name}
                            detail={`${m.id.replace('m-', 'GB-').toUpperCase()} · ${m.phone}`}
                            status={
                              <OwnerStatusText
                                label={statusLabel[displayMembershipStatus(m)]}
                                tone={statusTone[displayMembershipStatus(m)]}
                              />
                            }
                            chevron
                            onPress={() => {
                              setMemberId(m.id);
                              setMemberQuery('');
                              setYearMonth(null);
                              setSelectedKey(null);
                            }}
                          />
                        </View>
                      ))}
                    </OwnerListGroup>
                  </View>
                )}
                {memberQuery.trim().length > 0 && memberResults.length === 0 && (
                  <OwnerEmptyState
                    icon="search-outline"
                    title="No member matches"
                    hint="Try a shorter name or the member number."
                    actionLabel="Clear search"
                    onAction={() => setMemberQuery('')}
                  />
                )}
              </View>
            )}
          </WorkspaceSection>
        </RiseIn>

        {/* 2 — The member's calendar (only with a selected member) */}
        {member ? (
          <RiseIn index={2} style={{ marginTop: spacing.md }}>
            <WorkspaceSection title="Monthly calendar">
              <AttendanceMonthGrid
                year={pos.year}
                month={pos.month}
                counts={counts}
                todayKey={todayKey}
                selectedKey={selected}
                onSelectDay={setSelectedKey}
                onPrevMonth={() => setYearMonth(addMonth(pos, -1))}
                onNextMonth={() => setYearMonth(addMonth(pos, 1))}
                onOpenYear={() => setYearOpen(true)}
              />
              <AppText variant="caption" style={{ color: colors.ownerInkSubtle, marginTop: spacing.xs }}>
                {MONTH_NAMES[pos.month]} {pos.year} — markers are verified check-ins from the actual records; demo data. No check-out times exist in the records, so none are shown.
              </AppText>
            </WorkspaceSection>
          </RiseIn>
        ) : (
          <RiseIn index={2} style={{ marginTop: spacing.md }}>
            <WorkspaceWell>
              <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
                Search for a member above to open their month-by-month attendance calendar, or pick from today&apos;s register below.
              </AppText>
            </WorkspaceWell>
          </RiseIn>
        )}

        {/* 3 — Selected date details */}
        {member && (
          <RiseIn index={3} style={{ marginTop: spacing.md }}>
            <WorkspaceSection title={`Details · ${formatDate(parseDayKey(selected))}`}>
              {dayEvents.length === 0 ? (
                <WorkspaceWell>
                  <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
                    No attendance recorded on this date.
                  </AppText>
                </WorkspaceWell>
              ) : (
                <OwnerListGroup label={`${pluralise(dayEvents.length, 'record', 'records')} on this date`}>
                  {dayEvents.map((e, i) => (
                    <View key={e.id}>
                      {i > 0 && <WorkspaceRowDivider />}
                      <OwnerListRow
                        leading={<OwnerMemberAvatar name={member.name} />}
                        title={`${formatTime(e.checkedInAt)} · ${e.door}`}
                        detail={e.id}
                        status={<OwnerStatusText {...eventRowStatus(e)} />}
                      />
                    </View>
                  ))}
                </OwnerListGroup>
              )}
            </WorkspaceSection>
          </RiseIn>
        )}

        {/* 4 — Monthly summary */}
        {member && (
          <RiseIn index={4} style={{ marginTop: spacing.md }}>
            <WorkspaceSection title={`${MONTH_NAMES[pos.month]} ${pos.year} summary`}>
              <StatRow>
                <OwnerStatTile
                  label="Attendance days"
                  value={String(summary.days)}
                  count={summary.days}
                  hint="Days with verified check-ins"
                  icon="calendar-outline"
                  tone="cyan"
                />
                <OwnerStatTile
                  label="Attendance events"
                  value={String(summary.events)}
                  count={summary.events}
                  hint="Every verified scan"
                  icon="walk-outline"
                  tone="violet"
                />
              </StatRow>
              <View style={{ marginTop: spacing.sm }}>
                <StatRow>
                  <OwnerStatTile
                    label="First attendance"
                    value={summary.first ? formatDate(parseDayKey(summary.first)) : '—'}
                    hint={summary.first ? undefined : 'None in this month'}
                    icon="flag-outline"
                    tone="blue"
                  />
                  <OwnerStatTile
                    label="Last attendance"
                    value={summary.last ? formatDate(parseDayKey(summary.last)) : '—'}
                    hint={summary.last ? undefined : 'None in this month'}
                    icon="flag-outline"
                    tone="blue"
                  />
                </StatRow>
              </View>
            </WorkspaceSection>
          </RiseIn>
        )}

        {/* 5 — Today's full register (kept so Home's link stays truthful) */}
        <RiseIn index={5} style={{ marginTop: spacing.md }}>
          <WorkspaceSection title="Today's register">
            <SearchBar
              label="Search members in today's register"
              value={todayQuery}
              onChange={setTodayQuery}
              placeholder="Name or member ID"
            />
            <View style={{ marginTop: spacing.xs }}>
              <SegmentedTabs variant="owner" size="small" options={eventFilters} value={todayFilter} onChange={setTodayFilter} />
            </View>
            <View style={{ marginTop: spacing.sm }}>
              {todayRows.length === 0 ? (
                <OwnerEmptyState
                  icon={todayQuery || todayFilter !== 'all' ? 'search-outline' : 'enter-outline'}
                  title={todayQuery || todayFilter !== 'all' ? 'No matching events' : 'The register is empty'}
                  hint={
                    todayQuery || todayFilter !== 'all'
                      ? 'No check-in matches that search or filter.'
                      : 'Scans appear here as members check in.'
                  }
                  actionLabel={todayQuery || todayFilter !== 'all' ? 'Clear search and filters' : undefined}
                  onAction={
                    todayQuery || todayFilter !== 'all'
                      ? () => {
                          setTodayQuery('');
                          setTodayFilter('all');
                        }
                      : undefined
                  }
                />
              ) : (
                <OwnerListGroup label="Today's check-in events">
                  {todayRows.map((e, i) => (
                    <View key={e.id}>
                      {i > 0 && <WorkspaceRowDivider />}
                      <OwnerListRow
                        leading={<OwnerMemberAvatar name={e.memberName} />}
                        title={e.memberName}
                        detail={`${e.memberIdDisplay} · ${formatTime(e.checkedInAt)} · ${e.door}`}
                        status={<OwnerStatusText {...eventRowStatus(e)} />}
                      />
                    </View>
                  ))}
                </OwnerListGroup>
              )}
            </View>
            <AppText variant="caption" style={{ color: colors.ownerInkSubtle, marginTop: spacing.xs }}>
              Every row is one check-in event. Frozen memberships record visits as frozen, never as attendance.
            </AppText>
          </WorkspaceSection>
        </RiseIn>

        <RiseIn index={6} style={{ marginTop: spacing.md }}>
          <WorkspaceWell>
            <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
              History search works for any month inside the browsable years; months without records show honestly empty calendars.
            </AppText>
          </WorkspaceWell>
        </RiseIn>
      </WorkspaceScreen>

      {/* Year picker */}
      <ModalSheet
        visible={yearOpen}
        onClose={() => setYearOpen(false)}
        title="Select a year"
        subtitle={`Browsing ${MONTH_NAMES[pos.month]}`}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          {years.map((y) => (
            <Button
              key={y}
              label={String(y)}
              size="small"
              variant={y === pos.year ? 'primary' : 'secondary'}
              onPress={() => {
                setYearMonth({ year: y, month: pos.month });
                setYearOpen(false);
              }}
            />
          ))}
        </View>
        <AppText variant="caption" style={{ color: colors.ownerInkSubtle, marginTop: spacing.xs }}>
          The range covers the member&apos;s records plus recent years; months without attendance show empty.
        </AppText>
      </ModalSheet>

      <WorkspaceBottomNavigation active="more" items={navItems} />
    </View>
  );
}
