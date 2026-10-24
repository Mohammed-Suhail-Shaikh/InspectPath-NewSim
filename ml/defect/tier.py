"""Urgency tier from the list of detected defects (rule from docs/contract.md).

This is a team decision for the demo, not an engineering standard.
"""


def tier(detected):
    """Return "high", "medium", "low" or "none". `detected` is a list of class names."""
    found = set(detected)
    if found & {"exposed_bars", "spallation"}:
        return "high"
    if "corrosion_stain" in found:
        return "medium"
    if found & {"crack", "efflorescence"}:
        return "low"
    return "none"
