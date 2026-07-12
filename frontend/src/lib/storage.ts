export function safeGetItem(key: string) {
  try {
    return window.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function safeSetItem(key: string, value: string) {
  try {
    window.localStorage?.setItem(key, value);
  } catch {
    // Private or locked-down browsers can block storage. The app should keep running.
  }
}

export function safeRemoveItem(key: string) {
  try {
    window.localStorage?.removeItem(key);
  } catch {
    // Storage may be unavailable; treat removal as already complete.
  }
}
