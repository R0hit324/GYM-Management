/**
 * Reduce-motion detection. Every entrance/entrance-stagger animation consults
 * this and collapses to its end state when the OS asks for reduced motion
 * (Floor rule: no keyframe or transform transition without a fallback).
 *
 * Implemented as an external store read through useSyncExternalStore, so the
 * system setting is obeyed in module-scoped effect-free code (no setState in
 * effect bodies, no cascading renders).
 */
import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';

let snapshot = false;
const listeners = new Set<() => void>();

const update = (v: boolean) => {
  if (v === snapshot) return;
  snapshot = v;
  listeners.forEach((notify) => notify());
};

AccessibilityInfo.isReduceMotionEnabled().then(update);
const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', update);

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

function getSnapshot(): boolean {
  return snapshot;
}

function getServerSnapshot(): boolean {
  return snapshot;
}

export function useReduceMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

void sub;
