# Product

InspectPath combines continuous bridge monitoring with targeted AI inspection.

1. A low-cost sensor node on the bridge measures vibration, tilt, strain, water level, and temperature.
2. A trigger model compares natural frequency against a temperature-corrected baseline and raises Watch / Warning / Alarm.
3. A Warning or Alarm dispatches an inspection route that prioritizes the zone near the alert.
4. A defect model trained on CODEBRIM (real bridge imagery) classifies five defect types and assigns an urgency tier.
5. The dashboard and an LLM report give engineers one prioritized inspection list.

Users: bridge inspectors and engineers.

Context: one-day hackathon build (Hackachusetts 2026, Robotics track). Everything runs in simulation with real public datasets. There is no physical drone or deployed node.

Honesty rules:
- Thresholds and urgency tiers are demonstration values, not engineering limits.
- The system helps engineers prioritize. It never claims a bridge is safe or unsafe.
- Report real measured model metrics only. Never invent numbers.
