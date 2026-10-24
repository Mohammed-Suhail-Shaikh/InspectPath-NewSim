import { useEffect, useRef, useState } from "react";
import { getDataSource } from "../../data/activeSource";
import { mockSource } from "../../data/mockSource";
import type { TriggerRecord } from "../../data/types";
import { useViewState, type ReplayDataset } from "../../app/viewState";

// Base tick at 1x. ~2 records/sec => ~500ms per record at 1x.
const BASE_INTERVAL_MS = 500;

interface ReplayState {
  records: TriggerRecord[];
  current: TriggerRecord | null;
  loading: boolean;
  isMock: boolean; // whether the loaded replay came from the mock source
}

// Resolve the dataset selection to a source + dataset name.
// "mock" forces the mock source; the real datasets use the active source
// (which itself falls back to mock if the file is missing/invalid).
function resolveSource(dataset: ReplayDataset) {
  if (dataset === "mock") {
    return { src: mockSource, name: "z24", forcedMock: true as const };
  }
  return { src: getDataSource(), name: dataset, forcedMock: false as const };
}

// Drives the replay cursor through the trigger array in timestamp order.
// Speed multiplier (1 | 5 | 20) divides the base interval.
// Stops and holds on the last record (no wraparound unless restarted).
export function useReplay(): ReplayState {
  const [records, setRecords] = useState<TriggerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMock, setIsMock] = useState(true);
  const {
    replayCursor,
    setReplayCursor,
    replayRunning,
    setReplayRunning,
    replaySpeed,
    replayDataset,
    setAlertHistory,
  } = useViewState();

  // Load records whenever the selected dataset changes. Reset replay position.
  useEffect(() => {
    let active = true;
    setLoading(true);
    const { src, name, forcedMock } = resolveSource(replayDataset);
    src.getReplay(name).then((recs) => {
      if (!active) return;
      const sorted = [...recs].sort((a, b) =>
        a.timestamp.localeCompare(b.timestamp)
      );
      setRecords(sorted);
      // Mock when forced, or when the active source itself is the mock source.
      setIsMock(forcedMock || src.isMock);
      setLoading(false);
      // Restart the replay for the newly selected dataset.
      setReplayCursor(0);
      setReplayRunning(true);
      setAlertHistory([]);
      lastLevelRef.current = null;
    });
    return () => {
      active = false;
    };
  }, [replayDataset, setReplayCursor, setReplayRunning, setAlertHistory]);

  // Advance the cursor on a timer.
  const lastLevelRef = useRef<string | null>(null);
  useEffect(() => {
    if (loading || !replayRunning || records.length === 0) return;

    const interval = Math.max(50, Math.round(BASE_INTERVAL_MS / replaySpeed));
    const id = window.setInterval(() => {
      setReplayCursor((prev) => {
        const next = prev + 1;
        if (next >= records.length) {
          setReplayRunning(false);
          return records.length - 1; // hold on last record
        }
        return next;
      });
    }, interval);

    return () => window.clearInterval(id);
  }, [loading, replayRunning, replaySpeed, records.length, setReplayCursor, setReplayRunning]);

  const current =
    records.length > 0
      ? records[Math.min(replayCursor, records.length - 1)]
      : null;

  // Append to alert history only when the alert level changes.
  useEffect(() => {
    if (!current) return;
    if (lastLevelRef.current !== current.alert_level) {
      lastLevelRef.current = current.alert_level;
      setAlertHistory((prev) => [
        ...prev,
        {
          timestamp: current.timestamp,
          alert_level: current.alert_level,
          residual_pct: current.residual_pct,
          quality: current.quality,
        },
      ]);
    }
  }, [current, setAlertHistory]);

  return { records, current, loading, isMock };
}
