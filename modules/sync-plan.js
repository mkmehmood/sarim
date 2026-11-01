export const FULL_PASS_TTL_MS = 10 * 60 * 1000;
export function shouldFullPass({ forceDownload = false, lastFullPassAt = 0, now = Date.now(), ttlMs = FULL_PASS_TTL_MS } = {}) {
  return !!forceDownload || !lastFullPassAt || (now - lastFullPassAt) >= ttlMs;
}

export function collectionNeedsMerge({ fullPass = false, cloudCount = 0, compacted = false } = {}) {
  return !!fullPass || cloudCount > 0 || !!compacted;
}
export function createPingCoalescer({ queue, pull, delayMs = 500, setTimer = setTimeout }) {
  let waiting = false;
  return function onPing() {
    if (waiting) return false;
    waiting = true;
    setTimer(() => {
      queue.run(async () => {
        waiting = false;
        await pull();
      });
    }, delayMs);
    return true;
  };
}
