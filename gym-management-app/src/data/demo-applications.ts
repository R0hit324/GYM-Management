/**
 * Demo-labelled join applications.
 *
 * The application queue is normally written by the member app and decided by
 * the reception desk, so live mode reads the server rows. These illustrative
 * rows exist only so the demo workspace can show the review shapes; every
 * screen that renders them shows the workspace demo badge, and demo decisions
 * change local state only.
 */
import type { JoinApplication } from '@/types/domain';

export const demoJoinApplications: JoinApplication[] = [
  {
    id: 'demo-app-1',
    fullName: 'Ananya Rao',
    phone: '+91 90000 11223',
    email: 'ananya.rao@example.com',
    planId: 'plan-monthly',
    state: 'submitted',
    phoneVerified: true,
    emailVerified: true,
    createdAt: '2026-11-16T09:20:00.000Z',
  },
  {
    id: 'demo-app-2',
    fullName: 'Vikram Shetty',
    phone: '+91 90000 44556',
    email: 'vikram.shetty@example.com',
    planId: 'plan-quarterly',
    state: 'submitted',
    phoneVerified: true,
    emailVerified: false,
    createdAt: '2026-11-17T14:05:00.000Z',
  },
  {
    id: 'demo-app-3',
    fullName: 'Farah Khan',
    phone: '+91 90000 22334',
    email: 'farah.khan@example.com',
    planId: 'plan-half',
    state: 'submitted',
    phoneVerified: true,
    emailVerified: true,
    createdAt: '2026-11-18T08:15:00.000Z',
  },
  {
    id: 'demo-app-4',
    fullName: 'Sanjay Patil',
    phone: '+91 90000 66778',
    email: 'sanjay.patil@example.com',
    planId: 'plan-yearly',
    state: 'submitted',
    phoneVerified: false,
    emailVerified: false,
    createdAt: '2026-11-18T18:40:00.000Z',
  },
  {
    id: 'demo-app-5',
    fullName: 'Meera Iyer',
    phone: '+91 90000 77889',
    email: 'meera.iyer@example.com',
    planId: 'plan-half',
    state: 'approved',
    phoneVerified: true,
    emailVerified: true,
    createdAt: '2026-11-12T11:40:00.000Z',
  },
];
