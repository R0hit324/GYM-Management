/**
 * DEMO DATA ONLY.
 *
 * Every number, name and phone number in this file is fake sample data used
 * exclusively to demonstrate Part 1 UI. Nothing here represents a real gym
 * and no screen may present these values as real business results. Screens
 * surface them with a "Demo data" badge (see <DemoDataProvider /> in the
 * scaffold). Real data arrives from Supabase in Parts 2-5.
 */
import type {
  AttendanceEvent,
  DailyReportNumbers,
  Member,
  MembershipPlan,
  PaymentRecord,
  TrendPoint,
} from '@/types/domain';

function isoDaysAgo(days: number, hour = 7, minute = 30): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

export const demoPlans: MembershipPlan[] = [
  {
    id: 'plan-monthly',
    name: 'Monthly',
    duration: 'monthly',
    price: 1200,
    currency: 'INR',
    highlights: ['Full gym floor access', 'One scheduled training review', 'Freeze requests allowed'],
  },
  {
    id: 'plan-quarterly',
    name: 'Quarterly',
    duration: 'quarterly',
    price: 3000,
    currency: 'INR',
    highlights: ['Full gym floor access', 'Group sessions included', 'Freeze requests allowed'],
  },
  {
    id: 'plan-half',
    name: 'Half yearly',
    duration: 'halfYearly',
    price: 5500,
    currency: 'INR',
    highlights: ['Full gym floor access', 'Group sessions included', 'Priority renewal window'],
  },
  {
    id: 'plan-yearly',
    name: 'Yearly',
    duration: 'yearly',
    price: 9600,
    currency: 'INR',
    highlights: ['Full gym floor access', 'Group sessions included', 'Priority renewal window', 'Two guest passes a month'],
  },
];

export const demoMembers: Member[] = [
  {
    id: 'm-1042',
    name: 'Arjun Mehta',
    phone: '+91 98xxx 45120',
    email: 'arjun@example.com',
    planId: 'plan-quarterly',
    status: 'active',
    membershipEnd: isoDaysAgo(-46),
    priceLocked: 3000,
    discountPct: 0,
    lastAttendance: isoDaysAgo(0),
    joinedOn: '2025-02-11',
    followUp: { status: 'none' },
  },
  {
    id: 'm-1038',
    name: 'Priya Nambiar',
    phone: '+91 97xxx 33041',
    email: 'priya@example.com',
    planId: 'plan-yearly',
    status: 'active',
    membershipEnd: isoDaysAgo(-103),
    priceLocked: 9600,
    discountPct: 5,
    lastAttendance: isoDaysAgo(1),
    joinedOn: '2024-11-03',
    followUp: { status: 'none' },
  },
  {
    id: 'm-1055',
    name: 'Rahul Desai',
    phone: '+91 90xxx 88277',
    email: 'rahul@example.com',
    planId: 'plan-monthly',
    status: 'expiring',
    membershipEnd: isoDaysAgo(-2),
    priceLocked: 1200,
    discountPct: 0,
    lastAttendance: isoDaysAgo(3),
    joinedOn: '2025-06-22',
    followUp: { status: 'messaged', note: 'Reminder sent on WhatsApp', updatedAt: isoDaysAgo(1) },
  },
  {
    id: 'm-1029',
    name: 'Sana Fernandes',
    phone: '+91 96xxx 21903',
    email: 'sana@example.com',
    planId: 'plan-half',
    status: 'expired',
    membershipEnd: isoDaysAgo(13),
    priceLocked: 5500,
    discountPct: 0,
    lastAttendance: isoDaysAgo(16),
    joinedOn: '2025-01-08',
    followUp: { status: 'called', note: 'Asked for renewal quote', updatedAt: isoDaysAgo(6) },
  },
  {
    id: 'm-1012',
    name: 'Vikram Shetty',
    phone: '+91 93xxx 55219',
    email: 'vikram@example.com',
    planId: 'plan-quarterly',
    status: 'expired',
    membershipEnd: isoDaysAgo(44),
    priceLocked: 3000,
    discountPct: 0,
    lastAttendance: isoDaysAgo(61),
    joinedOn: '2024-09-14',
    followUp: { status: 'none' },
  },
  {
    id: 'm-1008',
    name: 'Neha Kulkarni',
    phone: '+91 95xxx 60482',
    email: 'neha@example.com',
    planId: 'plan-monthly',
    status: 'expired',
    membershipEnd: isoDaysAgo(27),
    priceLocked: 1200,
    discountPct: 10,
    lastAttendance: isoDaysAgo(97),
    joinedOn: '2025-04-30',
    followUp: { status: 'visited', note: 'Comes back after monsoon,likely' },
  },
  {
    id: 'm-1087',
    name: 'Farhan Qureshi',
    phone: '+91 91xxx 71530',
    email: 'farhan@example.com',
    planId: 'plan-yearly',
    status: 'active',
    membershipEnd: isoDaysAgo(-210),
    priceLocked: 9600,
    discountPct: 0,
    lastAttendance: isoDaysAgo(32),
    joinedOn: '2025-05-19',
    followUp: { status: 'none' },
  },
];

export const demoAttendance: AttendanceEvent[] = [
  { id: 'a-90312', memberId: 'm-1042', memberName: 'Arjun Mehta', memberIdDisplay: 'GB-1042', checkedInAt: isoDaysAgo(0, 6, 42), door: 'Main entrance', status: 'verified' },
  { id: 'a-90313', memberId: 'm-1038', memberName: 'Priya Nambiar', memberIdDisplay: 'GB-1038', checkedInAt: isoDaysAgo(0, 6, 55), door: 'Main entrance', status: 'verified' },
  { id: 'a-90314', memberId: 'm-1055', memberName: 'Rahul Desai', memberIdDisplay: 'GB-1055', checkedInAt: isoDaysAgo(0, 7, 12), door: 'Main entrance', status: 'verified' },
  { id: 'a-90315', memberId: 'm-1042', memberName: 'Arjun Mehta', memberIdDisplay: 'GB-1042', checkedInAt: isoDaysAgo(0, 10, 26), door: 'Main entrance', status: 'verified' },
  { id: 'a-90316', memberId: 'm-1055', memberName: 'Rahul Desai', memberIdDisplay: 'GB-1055', checkedInAt: isoDaysAgo(0, 17, 48), door: 'Main entrance', status: 'verified' },
  { id: 'a-90317', memberId: 'm-1087', memberName: 'Farhan Qureshi', memberIdDisplay: 'GB-1087', checkedInAt: isoDaysAgo(1, 7, 5), door: 'Main entrance', status: 'verified' },
  { id: 'a-90318', memberId: 'm-1038', memberName: 'Priya Nambiar', memberIdDisplay: 'GB-1038', checkedInAt: isoDaysAgo(1, 6, 58), door: 'Main entrance', status: 'verified' },
  { id: 'a-90319', memberId: 'm-1029', memberName: 'Sana Fernandes', memberIdDisplay: 'GB-1029', checkedInAt: isoDaysAgo(16, 8, 2), door: 'Main entrance', status: 'frozen' },
  { id: 'a-90320', memberId: 'm-1012', memberName: 'Vikram Shetty', memberIdDisplay: 'GB-1012', checkedInAt: isoDaysAgo(61, 7, 40), door: 'Main entrance', status: 'failed' },
];

export const demoPayments: PaymentRecord[] = [
  {
    id: 'pay-551',
    memberId: 'm-1042',
    memberName: 'Arjun Mehta',
    planId: 'plan-quarterly',
    originalPrice: 3000,
    discountPct: 0,
    payable: 3000,
    method: 'upi',
    utr: 'UTR 9044XXXX21',
    state: 'verified',
    receiptIssued: true,
    createdAt: isoDaysAgo(-46),
    verifiedBy: 'Owner',
  },
  {
    id: 'pay-552',
    memberId: 'm-1055',
    memberName: 'Rahul Desai',
    planId: 'plan-monthly',
    originalPrice: 1200,
    discountPct: 0,
    payable: 1200,
    method: 'upi',
    utr: 'UTR 7719XXXX83',
    state: 'awaitingVerification',
    receiptIssued: false,
    createdAt: isoDaysAgo(0, 5),
    note: 'Awaiting gym UPI check before membership activates',
  },
];

export const demoOwnershipReport: DailyReportNumbers = {
  date: new Date().toISOString().slice(0, 10),
  attendance: 41,
  uniqueVisitors: 34,
  checkInEvents: 41,
  newMembers: 2,
  renewals: 3,
  verifiedCollections: 18400,
  upi: 15900,
  cash: 2500,
  pendingApplications: 4,
  discounts: 900,
  refunds: 0,
};

export const demoAttendanceTrend: TrendPoint[] = [
  { label: 'Mon', fullLabel: 'Monday last week', value: 33 },
  { label: 'Tue', fullLabel: 'Tuesday last week', value: 38 },
  { label: 'Wed', fullLabel: 'Wednesday last week', value: 30 },
  { label: 'Thu', fullLabel: 'Thursday last week', value: 36 },
  { label: 'Fri', fullLabel: 'Friday last week', value: 44 },
  { label: 'Sat', fullLabel: 'Saturday last week', value: 52 },
  { label: 'Sun', fullLabel: 'Sunday last week', value: 41 },
];

export const demoCollectionsTrend: TrendPoint[] = [
  { label: 'W1', fullLabel: 'Week 1 of month', value: 14200 },
  { label: 'W2', fullLabel: 'Week 2 of month', value: 18600 },
  { label: 'W3', fullLabel: 'Week 3 of month', value: 12900 },
  { label: 'W4', fullLabel: 'Week 4 of month', value: 18400 },
];

/** Demo-only informational payload shown in the QR modals. Real attendance
 * QR tokens are cryptographically generated server-side in Part 5 and expire
 * in 30-60 s; this static string is NOT a token and never used for anything
 * except showing the display UI. */
export const demoAttendanceQrPayload = 'DEMO-PAYLOAD: replaced by server QR tokens in Part 5';

export const demoGymUpiId = 'pulsegym@demo-upi';
export const demoGymName = 'Pulse Gym (demo)';

/**
 * DEMO DATA ONLY — generated member history for the attendance calendar.
 * Deterministic (seeded by the date, no randomness at runtime) so the
 * heatmap looks the same on every load of this preview. Roughly five months
 * of training days for the demo member (Arjun Mehta, m-1042), Sundays off,
 * occasional double sessions. Today's rows come from demoAttendance above;
 * this generator covers the days before today.
 */
export const demoMemberHistory: AttendanceEvent[] = (() => {
  const rand = (seed: number) => {
    const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  const events: AttendanceEvent[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let n = 0;
  for (let i = 160; i >= 1; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    const dow = d.getDay();
    if (dow === 0) continue; // Sunday rest
    if (rand(seed) > 0.76) continue; // rest day
    const morning = new Date(d);
    morning.setHours(6 + Math.floor(rand(seed + 1) * 3), 15, 0, 0);
    events.push({
      id: `demo-h${n++}`,
      memberId: 'm-1042',
      memberName: 'Arjun Mehta',
      memberIdDisplay: 'GB-1042',
      checkedInAt: morning.toISOString(),
      door: 'Main entrance',
      status: 'verified',
    });
    if (rand(seed + 2) < 0.16) {
      const evening = new Date(d);
      evening.setHours(17 + Math.floor(rand(seed + 3) * 2), 40, 0, 0);
      events.push({
        id: `demo-h${n++}`,
        memberId: 'm-1042',
        memberName: 'Arjun Mehta',
        memberIdDisplay: 'GB-1042',
        checkedInAt: evening.toISOString(),
        door: 'Main entrance',
        status: 'verified',
      });
    }
  }
  return events;
})();
