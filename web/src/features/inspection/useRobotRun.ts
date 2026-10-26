import { useEffect, useRef, useState } from "react";
import type { MetricPlan } from "../../data/types";

const STEP_MS = 450;

// Advances a robot index along the plan's ordered stops, then holds at the end.
// Resets when the plan identity changes (e.g. naive <-> optimized toggle).
export function useRobotRun(plan: MetricPlan | null): number {
  const [index, setIndex] = useState(0);
  const planRef = useRef<MetricPlan | null>(null);

  // Reset when the plan reference changes.
  useEffect(() => {
    if (planRef.current !== plan) {
      planRef.current = plan;
      setIndex(0);
    }
  }, [plan]);

  useEffect(() => {
    if (!plan || plan.stops.length === 0) return;
    const id = window.setInterval(() => {
      setIndex((prev) => {
        const next = prev + 1;
        if (next >= plan.stops.length) {
          window.clearInterval(id);
          return plan.stops.length - 1;
        }
        return next;
      });
    }, STEP_MS);
    return () => window.clearInterval(id);
  }, [plan]);

  return index;
}
