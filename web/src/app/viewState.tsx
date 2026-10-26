import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AlertHistoryEntry, BridgeSide, PlanType } from "../data/types";

// [dashboard-internal] UI state only — no measurement/domain data defined here.
export type ActiveView = "monitor" | "inspection";
export type ReplaySpeed = 1 | 5 | 20;

// Selectable replay source. "kw51_demo"/"kw51" load real data/trigger files;
// "mock" forces the built-in sample replay.
export type ReplayDataset = "kw51_demo" | "kw51" | "mock";

interface ViewStateValue {
  activeView: ActiveView;
  setActiveView: (v: ActiveView) => void;

  replayCursor: number;
  setReplayCursor: (n: number | ((prev: number) => number)) => void;

  replayRunning: boolean;
  setReplayRunning: (b: boolean) => void;

  replaySpeed: ReplaySpeed;
  setReplaySpeed: (s: ReplaySpeed) => void;

  replayDataset: ReplayDataset;
  setReplayDataset: (d: ReplayDataset) => void;

  selectedPlan: PlanType;
  setSelectedPlan: (p: PlanType) => void;

  selectedSide: BridgeSide;
  setSelectedSide: (s: BridgeSide) => void;

  selectedFindingId: string | null;
  setSelectedFindingId: (id: string | null) => void;

  alertHistory: AlertHistoryEntry[];
  setAlertHistory: (
    h: AlertHistoryEntry[] | ((prev: AlertHistoryEntry[]) => AlertHistoryEntry[])
  ) => void;
}

const ViewStateContext = createContext<ViewStateValue | null>(null);

export function ViewStateProvider({ children }: { children: ReactNode }) {
  const [activeView, setActiveView] = useState<ActiveView>("monitor");
  const [replayCursor, setReplayCursor] = useState(0);
  const [replayRunning, setReplayRunning] = useState(true);
  const [replaySpeed, setReplaySpeed] = useState<ReplaySpeed>(1);
  const [replayDataset, setReplayDataset] = useState<ReplayDataset>("kw51_demo");
  const [selectedPlan, setSelectedPlan] = useState<PlanType>("optimized");
  const [selectedSide, setSelectedSide] = useState<BridgeSide>("A");
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [alertHistory, setAlertHistory] = useState<AlertHistoryEntry[]>([]);

  const value = useMemo<ViewStateValue>(
    () => ({
      activeView,
      setActiveView,
      replayCursor,
      setReplayCursor,
      replayRunning,
      setReplayRunning,
      replaySpeed,
      setReplaySpeed,
      replayDataset,
      setReplayDataset,
      selectedPlan,
      setSelectedPlan,
      selectedSide,
      setSelectedSide,
      selectedFindingId,
      setSelectedFindingId,
      alertHistory,
      setAlertHistory,
    }),
    [
      activeView,
      replayCursor,
      replayRunning,
      replaySpeed,
      replayDataset,
      selectedPlan,
      selectedSide,
      selectedFindingId,
      alertHistory,
    ]
  );

  return (
    <ViewStateContext.Provider value={value}>
      {children}
    </ViewStateContext.Provider>
  );
}

export function useViewState(): ViewStateValue {
  const ctx = useContext(ViewStateContext);
  if (!ctx) throw new Error("useViewState must be used within ViewStateProvider");
  return ctx;
}
