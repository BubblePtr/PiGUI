import { useSyncExternalStore } from "react";
import { invoke, onUpdateEvent } from "@/shared/runtime";
import type { UpdateStatus } from "@/shared/update-protocol";

/**
 * Process-wide updater snapshot. Settings and the sidebar badge must read the
 * same object; tearing the IPC subscription down on unmount would flash
 * "Loading version…" every time AppFrame remounts on a route change.
 */
let snapshot: UpdateStatus | null = null;
let started = false;
let generation = 0;
let unsubscribePush: (() => void) | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function ensureStarted() {
  if (started) {
    return;
  }

  started = true;
  const startedGeneration = generation;

  void invoke<UpdateStatus>("update:status")
    .then((next) => {
      if (startedGeneration !== generation) {
        return;
      }

      snapshot = next;
      emit();
    })
    .catch(() => {
      // Leave snapshot null so the sidebar stays badge-less when the
      // updater cannot answer (tests without a mock, offline shells).
    });

  unsubscribePush = onUpdateEvent((next) => {
    if (startedGeneration !== generation) {
      return;
    }

    snapshot = next;
    emit();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  ensureStarted();
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return snapshot;
}

export function resetUpdateStatusStore() {
  generation += 1;
  snapshot = null;
  started = false;
  unsubscribePush?.();
  unsubscribePush = null;
  listeners.clear();
}

export function useUpdateStatus() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
