"""Tests for the KW51 metric planning in planner.py (task 7).

Standard-library unittest only (the planner is stdlib-only). Run with:
    python -m unittest firmware_esp32/test_planner_kw51.py
or, from the firmware_esp32 folder:
    python -m unittest test_planner_kw51
"""

import json
import math
import os
import unittest

import planner


HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
LAYOUT_PATH = os.path.join(REPO, "data", "structures", "kw51_layout.json")


def load_layout():
    with open(LAYOUT_PATH, encoding="utf-8") as f:
        return json.load(f)


class DistanceTests(unittest.TestCase):
    def test_distance_is_3d(self):
        a = {"x_m": 0.0, "y_m": 0.0, "z_m": 0.0}
        b = {"x_m": 3.0, "y_m": 4.0, "z_m": 12.0}
        # sqrt(9 + 16 + 144) = 13
        self.assertAlmostEqual(planner.distance(a, b), 13.0, places=6)

    def test_distance_z_defaults_to_zero(self):
        # Legacy grid layout has no z_m; distance must fall back to 2D value.
        a = {"x_m": 0.0, "y_m": 0.0}
        b = {"x_m": 3.0, "y_m": 4.0}
        self.assertAlmostEqual(planner.distance(a, b), 5.0, places=6)


class TwoOptTests(unittest.TestCase):
    def test_two_opt_not_longer_than_input(self):
        layout = load_layout()
        stops = planner.kw51_stops(layout)
        start = dict(planner.KW51_LAUNCH)
        nn = planner.nearest_neighbor_order(start, stops)
        opt = planner.two_opt(start, nn)
        self.assertLessEqual(
            planner.route_length(start, opt),
            planner.route_length(start, nn) + 1e-9,
        )

    def test_two_opt_keeps_all_stops(self):
        layout = load_layout()
        stops = planner.kw51_stops(layout)
        start = dict(planner.KW51_LAUNCH)
        nn = planner.nearest_neighbor_order(start, stops)
        opt = planner.two_opt(start, nn)
        self.assertEqual(
            sorted(s["location_id"] for s in opt),
            sorted(s["location_id"] for s in stops),
        )


class RoutingTests(unittest.TestCase):
    def test_all_34_stops(self):
        layout = load_layout()
        stops = planner.kw51_stops(layout)
        self.assertEqual(len(stops), 34)
        # distinct_location_count in the file agrees
        self.assertEqual(
            layout["diagonal_connections"]["distinct_location_count"], 34
        )

    def test_shared_diagonal_ends_collapse_to_one_stop(self):
        # Location ids are unique (shared ends already collapsed in the layout).
        layout = load_layout()
        stops = planner.kw51_stops(layout)
        ids = [s["location_id"] for s in stops]
        self.assertEqual(len(ids), len(set(ids)))

    def test_both_real_plans_finish_under_demo_budget(self):
        layout = load_layout()
        naive, opt = planner.generate_kw51_plans(layout)
        for plan in (naive, opt):
            st = plan["stats"]
            self.assertEqual(st["locations_visited"], 34)
            self.assertEqual(st["coverage_pct"], 1.0)
            self.assertTrue(st["within_budget"])
            self.assertTrue(all(s["reachable"] for s in plan["stops"]))

    def test_measured_route_lengths(self):
        # Guards against an accidental change to the distance/order logic.
        layout = load_layout()
        naive, opt = planner.generate_kw51_plans(layout)
        self.assertAlmostEqual(naive["stats"]["route_length_m"], 405.9, places=1)
        self.assertAlmostEqual(opt["stats"]["route_length_m"], 399.8, places=1)


class BudgetCutoffTests(unittest.TestCase):
    def test_small_budget_marks_later_stops_unreachable(self):
        # A deliberately tiny TEST-ONLY budget, unrelated to the demo cap, to
        # exercise the cut-off path.
        layout = load_layout()
        naive, _ = planner.generate_kw51_plans(
            layout, energy_per_meter=1.0, battery_budget=100.0
        )
        st = naive["stats"]
        self.assertLess(st["locations_visited"], 34)
        self.assertLess(st["coverage_pct"], 1.0)
        self.assertFalse(st["within_budget"])
        # route length never exceeds the budget (energy_per_meter == 1.0)
        self.assertLessEqual(st["battery_used"], 100.0 + 1e-9)
        # at least one reachable stop and at least one unreachable
        reach = [s["reachable"] for s in naive["stops"]]
        self.assertIn(True, reach)
        self.assertIn(False, reach)
        self.assertEqual(st["locations_visited"], sum(1 for r in reach if r))

    def test_coverage_is_visited_over_total(self):
        layout = load_layout()
        naive, _ = planner.generate_kw51_plans(
            layout, energy_per_meter=1.0, battery_budget=100.0
        )
        st = naive["stats"]
        # coverage_pct is stored rounded to 4 decimals (clean JSON); it equals
        # the visited/total ratio at that precision.
        self.assertEqual(
            st["coverage_pct"],
            round(st["locations_visited"] / st["locations_total"], 4),
        )


class DeterminismTests(unittest.TestCase):
    def test_generate_is_deterministic(self):
        layout = load_layout()
        a1, o1 = planner.generate_kw51_plans(layout)
        a2, o2 = planner.generate_kw51_plans(layout)
        self.assertEqual(json.dumps(a1, sort_keys=True), json.dumps(a2, sort_keys=True))
        self.assertEqual(json.dumps(o1, sort_keys=True), json.dumps(o2, sort_keys=True))


if __name__ == "__main__":
    unittest.main()
