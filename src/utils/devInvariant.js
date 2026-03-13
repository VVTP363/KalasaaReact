// src/utils/devInvariant.js
export function devWarn(condition, message, details) {
  if (import.meta?.env?.MODE === "production") return;
  if (condition) return;

   
  console.warn(`[DEV WARN] ${message}`, details ?? "");
}
