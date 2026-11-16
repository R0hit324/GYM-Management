/**
 * Session stores (demo architecture — approved in the Stage 1 assessment).
 *
 * Part 1 has no backend, so desk-recorded data is held in memory for this
 * session only and every surface that shows it says so. It never claims
 * database persistence, never marks a payment verified, and resets when
 * the app restarts. Payment QR recording, Transaction History, Home totals
 * and the Members list all read the same stores, so an entry recorded on
 * one screen appears on the others until the restart.
 */
import { useSyncExternalStore } from 'react';

import type { Member, PaymentRecord } from '@/types/domain';
import { demoMembers, demoPayments, demoGymUpiId } from '@/data/demo';

// ---- Payments ----

let paymentRecords: PaymentRecord[] = demoPayments;
const paymentListeners = new Set<() => void>();

function subscribePayments(listener: () => void): () => void {
  paymentListeners.add(listener);
  return () => {
    paymentListeners.delete(listener);
  };
}

function getPayments(): PaymentRecord[] {
  return paymentRecords;
}

/** React hook: the current payment records, re-rendering on session writes. */
export function useSessionPayments(): PaymentRecord[] {
  return useSyncExternalStore(subscribePayments, getPayments);
}

/** Adds one record at the front. Duplicate-reference rejection is upstream. */
export function addSessionPayment(entry: PaymentRecord): void {
  paymentRecords = [entry, ...paymentRecords];
  for (const l of paymentListeners) l();
}

// ---- Gym payment QR configuration ----

/** The gym's UPI QR configuration. `customImageUri` is a device-picked image
 * that replaces the generated QR for display; it is never assumed to be a
 * valid QR — applying it requires explicit manual confirmation on screen. */
export interface GymQrConfig {
  upiId: string;
  customImageUri: string | null;
}

const defaultQrConfig: GymQrConfig = { upiId: demoGymUpiId, customImageUri: null };
let qrConfig: GymQrConfig = defaultQrConfig;
const qrListeners = new Set<() => void>();

function subscribeQr(listener: () => void): () => void {
  qrListeners.add(listener);
  return () => {
    qrListeners.delete(listener);
  };
}

function getQrConfig(): GymQrConfig {
  return qrConfig;
}

/** React hook: the gym QR configuration every payment surface reads, so an
 * edit on one screen is reflected everywhere for the session. */
export function useSessionQrConfig(): GymQrConfig {
  return useSyncExternalStore(subscribeQr, getQrConfig);
}

/** Stages a configuration change. Session-only: no server or database. */
export function updateSessionQrConfig(patch: Partial<GymQrConfig>): void {
  qrConfig = { ...qrConfig, ...patch };
  for (const l of qrListeners) l();
}

/** Reverts the whole configuration to the demo defaults. */
export function resetSessionQrConfig(): void {
  qrConfig = defaultQrConfig;
  for (const l of qrListeners) l();
}

// ---- Plan prices (session overrides) ----

/** Session price overrides keyed by plan id. An absent id means the plan's
 * configured demo price applies. Overrides never touch members' locked
 * subscription prices or historical transactions — those are separate
 * records that must stay immutable. */
let planPrices: Record<string, number> = {};
const planPriceListeners = new Set<() => void>();

function subscribePlanPrices(listener: () => void): () => void {
  planPriceListeners.add(listener);
  return () => {
    planPriceListeners.delete(listener);
  };
}

function getPlanPrices(): Record<string, number> {
  return planPrices;
}

/** React hook: the session's plan price overrides. Screens combine this
 * with the shared plan data, so an edit on one screen shows everywhere. */
export function useSessionPlanPrices(): Record<string, number> {
  return useSyncExternalStore(subscribePlanPrices, getPlanPrices);
}

/** Effective price for a plan: the session override when one exists, else
 * the plan's configured demo price. Pure lookup, no mutation. */
export function effectivePlanPrice(
  planId: string,
  configuredPrice: number,
  prices: Record<string, number>,
): number {
  const p = prices[planId];
  return typeof p === 'number' && Number.isFinite(p) && p > 0 ? p : configuredPrice;
}

/** Stages one plan price change. Session-only: no server, no database, no
 * fake save. Members' locked prices and past transactions are untouched. */
export function updateSessionPlanPrice(planId: string, price: number): void {
  planPrices = { ...planPrices, [planId]: price };
  for (const l of planPriceListeners) l();
}

/** Clears every session price override — back to the demo plan prices. */
export function resetSessionPlanPrices(): void {
  planPrices = {};
  for (const l of planPriceListeners) l();
}

// ---- Members ----

let memberRecords: Member[] = demoMembers;
const memberListeners = new Set<() => void>();

function subscribeMembers(listener: () => void): () => void {
  memberListeners.add(listener);
  return () => {
    memberListeners.delete(listener);
  };
}

function getMembers(): Member[] {
  return memberRecords;
}

/** React hook: the current member records, re-rendering on session writes. */
export function useSessionMembers(): Member[] {
  return useSyncExternalStore(subscribeMembers, getMembers);
}

/** Stages a partial update to one member (contact edits). Never membership state. */
export function updateSessionMember(id: string, patch: Partial<Member>): void {
  memberRecords = memberRecords.map((m) => (m.id === id ? { ...m, ...patch } : m));
  for (const l of memberListeners) l();
}
