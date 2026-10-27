// Regression test for the "dashboard goes blank after running the replay for a
// while" bug: an uncaught render error unmounts the app. This runs the full KW51
// demo and full-length replays through MonitorView to the final reading, plus
// the restart-after-end path, and fails if any render throws.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import MonitorView from "../features/monitor/MonitorView";
import { ViewStateProvider } from "../app/viewState";
import * as activeSource from "../data/activeSource";
import type { DataSource } from "../data/source";
import type { TriggerRecord } from "../data/types";
import demo from "../../../data/trigger/replay_kw51_demo.json";
import full from "../../../data/trigger/replay_kw51.json";

function stubSource(records: TriggerRecord[]): DataSource {
  return {
    isMock: false,
    getReplay: async () => records,
    getMetricStructure: async () => {
      throw new Error("not needed");
    },
    getMetricPlan: async () => {
      throw new Error("not needed");
    },
    getImageMap: async () => ({}),
    getFindings: async () => [],
    getDemoReport: async () => ({ text: "", generatedAt: "", source: "rule-based" }),
  } as unknown as DataSource;
}

async function renderMonitor(records: TriggerRecord[]) {
  vi.spyOn(activeSource, "getDataSource").mockReturnValue(stubSource(records));
  const utils = render(
    <ViewStateProvider>
      <MonitorView />
    </ViewStateProvider>
  );
  // Let useReplay's async getReplay resolve and the first records render.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return utils;
}

describe("full KW51 replay through MonitorView does not crash", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  for (const [name, data] of [
    ["demo", demo],
    ["full", full],
  ] as const) {
    it(`runs the ${name} replay to the final reading without throwing`, async () => {
      const records = data as unknown as TriggerRecord[];
      await renderMonitor(records);

      // Advance the replay well past the end (it holds on the last record).
      await act(async () => {
        vi.advanceTimersByTime(records.length * 600 + 5000);
      });

      // The monitor title is still present -> the app did not blank out.
      expect(screen.getByText("Bridge monitor")).toBeInTheDocument();
    });
  }

  it("survives pressing Restart after the replay has ended", async () => {
    const records = demo as unknown as TriggerRecord[];
    await renderMonitor(records);

    await act(async () => {
      vi.advanceTimersByTime(records.length * 600 + 5000);
    });

    // At the end the control shows "Restart"; click it, then run again.
    const restart = screen.getByRole("button", { name: /restart/i });
    await act(async () => {
      fireEvent.click(restart);
    });
    await act(async () => {
      vi.advanceTimersByTime(records.length * 600 + 5000);
    });

    expect(screen.getByText("Bridge monitor")).toBeInTheDocument();
  });
});
