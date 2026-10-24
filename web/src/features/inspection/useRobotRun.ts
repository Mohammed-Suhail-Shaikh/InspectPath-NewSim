import { useEffect, useRef, useState } from "react";
import type { Plan } from "../../data/types";

const STEP_MS = 450;

// Advances a robot index along the plan's waypoints in order, then holds at the end.
// Resets when the plan identity changes (e.g. naive <-> optimized toggle).
export function useRobotRun(plan: Plan | null): number {
  const [index, setIndex] = useState(0);
  const planRef = useRef<Plan | null>(null);

  // Reset when the plan reference changes.
  useEffect(() => {
    if (planRef.current !== plan) {
      planRef.current = plan;
      setIndex(0);
    }
  }, [plan]);

  useEffect(() => {
    if (!plan || plan.waypoints.length === 0) return;
    const id = window.setInterval(() => {
      setIndex((prev) => {
        const next = prev + 1;
        if (next >= plan.waypoints.length) {
          window.clearInterval(id);
          return plan.waypoints.length - 1;
        }
        return next;
      });
    }, STEP_MS);
    return () => window.clearInterval(id);
  }, [plan]);

  return index;
}
