"""One test case per row of the tier rule."""
import pytest

from tier import tier


@pytest.mark.parametrize("detected, expected", [
    # high: exposed_bars or spallation, whatever else is present
    (["exposed_bars"], "high"),
    (["spallation"], "high"),
    (["exposed_bars", "spallation"], "high"),
    (["spallation", "corrosion_stain"], "high"),
    (["exposed_bars", "crack", "efflorescence", "corrosion_stain"], "high"),
    # medium: corrosion_stain without any high-tier class
    (["corrosion_stain"], "medium"),
    (["corrosion_stain", "crack"], "medium"),
    (["corrosion_stain", "efflorescence"], "medium"),
    (["corrosion_stain", "crack", "efflorescence"], "medium"),
    # low: only crack and/or efflorescence
    (["crack"], "low"),
    (["efflorescence"], "low"),
    (["crack", "efflorescence"], "low"),
    # none: nothing detected
    ([], "none"),
])
def test_tier_rule(detected, expected):
    assert tier(detected) == expected


def test_order_does_not_matter():
    assert tier(["crack", "spallation"]) == tier(["spallation", "crack"]) == "high"
