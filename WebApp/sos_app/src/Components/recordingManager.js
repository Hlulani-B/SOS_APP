/**
 * recordingManager - the single lock shared by the three safety components
 * (AudioRecorder / VideoRecorder / SOSButton).
 *
 * Only ONE action may run at a time. When a new action is requested while
 * another is active, the active one is stopped and the new action waits
 * until it has completely finished its job (stop -> download -> send)
 * before starting.
 *
 * Protocol used by the components:
 *   requestOwnership(id, stopAndFinish) - claim the lock. If another action
 *     is active it is stopped via its registered stopAndFinish(), which
 *     must return a Promise that resolves only when that action's job has
 *     fully completed. Ownership hand-offs are serialized so rapid clicks
 *     can't interleave.
 *   isActiveOwner(id) - components re-check this after any async gap
 *     (e.g. getUserMedia permission) and abort if they were overtaken.
 *   releaseOwnership(id) - the owner frees the lock once its job is done,
 *     or immediately if it failed to start.
 */

let owner = null;                     // { id, stopAndFinish }
let chain = Promise.resolve();        // serializes ownership hand-offs

export function getActiveOwner() {
  return owner ? owner.id : null;
}

export function isActiveOwner(id) {
  return !!owner && owner.id === id;
}

export function requestOwnership(id, stopAndFinish) {
  const run = chain.then(async () => {
    // Already ours (e.g. the same component re-claiming) - nothing to do.
    if (owner && owner.id === id) return;

    // Stop the current action and wait until it has fully finished.
    const previous = owner;
    owner = null;

    if (previous) {
      try {
        await previous.stopAndFinish();
      } catch (e) {
        console.error("recordingManager: previous action failed to finish:", e);
      }
    }

    owner = { id, stopAndFinish };
  });

  // Keep the chain flowing even if a hand-off fails.
  chain = run.catch(() => {});

  return run;
}

export function releaseOwnership(id) {
  if (owner && owner.id === id) {
    owner = null;
  }
}
