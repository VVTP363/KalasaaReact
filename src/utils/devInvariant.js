// src/utils/devInvariant.js
export function devWarn(condition, message, details) {
  if (import.meta?.env?.MODE === "production") return;
  if (condition) return;

  // eslint-disable-next-line no-console
  console.warn(`[DEV WARN] ${message}`, details ?? "");
}
