import "@testing-library/jest-dom";

// jsdom does not implement ResizeObserver, which recharts' ResponsiveContainer
// uses. The real browser has it; provide a no-op so chart components can render
// in tests (this is a test-env shim, not production code).
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (!("ResizeObserver" in globalThis)) {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
    ResizeObserverStub;
}
