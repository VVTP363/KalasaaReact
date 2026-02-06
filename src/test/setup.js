import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Hiljennetään tunnettu OH-kynnykset -varoitus testiajossa
const originalWarn = console.warn;
const originalError = console.error;

beforeAll(() => {
  console.warn = (...args) => {
    const msg = String(args?.[0] ?? "");
    if (msg.includes("Ei OH-kynnyksiä lajille")) return;
    originalWarn(...args);
  };

  console.error = (...args) => {
    const msg = String(args?.[0] ?? "");
    if (msg.includes("Ei OH-kynnyksiä lajille")) return;
    originalError(...args);
  };
});

afterAll(() => {
  console.warn = originalWarn;
  console.error = originalError;
});

