export const adminFlags = { closeYearInProgress: false, closing: false, restoring: false };

export function _set_restoring(v) { adminFlags.restoring = v; }

export function _set_closing(v) { adminFlags.closing = v; }

Object.defineProperty(window, 'closeYearInProgress', { configurable: true, get: () => adminFlags.closeYearInProgress });
Object.defineProperty(window, 'closing', { configurable: true, get: () => adminFlags.closing });
Object.defineProperty(window, 'restoring', { configurable: true, get: () => adminFlags.restoring });
