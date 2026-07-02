"""
Tiered, asymmetric tolerance math for Stage 3c amount comparison.

Formula: tolerance = max(percentage × po_total, dollar_floor)

The dollar figures in the table are FLOORS (minimums), not ceilings.
See CLAUDE.md "Tolerance Formula" section and Future_Scope.md "Deviation #1" for the
full reasoning behind this interpretation (confirmed by phase_2.md Invoice 4 worked example).

Table (phase_1.md §3c):
  PO Amount       | Overage (invoice > PO)     | Underage (invoice < PO)
  ─────────────── | ──────────────────────────  | ──────────────────────────
  < $1,000        | max(3% × PO, $30)           | max(5% × PO, $50)
  $1,000–$10,000  | max(2% × PO, $150)          | max(4% × PO, $300)
  > $10,000       | max(1% × PO, $500)          | max(3% × PO, $1,000)
"""

from __future__ import annotations


def get_tolerance(po_total: float, direction: str = "overage") -> float:
    """
    Return the tolerance dollar amount for the given PO total and direction.

    Args:
        po_total: The PO total amount in dollars.
        direction: "overage" (invoice > PO) or "underage" (invoice < PO).

    Returns:
        Tolerance amount in dollars.
    """
    if direction == "overage":
        if po_total < 1_000:
            return max(0.03 * po_total, 30.0)
        elif po_total <= 10_000:
            return max(0.02 * po_total, 150.0)
        else:
            return max(0.01 * po_total, 500.0)
    else:  # underage
        if po_total < 1_000:
            return max(0.05 * po_total, 50.0)
        elif po_total <= 10_000:
            return max(0.04 * po_total, 300.0)
        else:
            return max(0.03 * po_total, 1_000.0)


def check_amount_tolerance(invoice_total: float, po_total: float) -> dict:
    """
    Compare invoice total to PO total using the tiered tolerance rules.

    Returns a dict with:
        within_tolerance (bool)
        delta (float)               invoice_total - po_total; positive = overage
        direction (str)             "overage" | "underage" | "exact"
        tolerance (float)           calculated tolerance amount
        three_x_cap (float)         3 × tolerance (reject threshold)
        beyond_three_x (bool)       True → reject trigger
        tier (str)                  human-readable tier label
    """
    delta = invoice_total - po_total

    if abs(delta) < 0.01:
        return {
            "within_tolerance": True,
            "delta": delta,
            "direction": "exact",
            "tolerance": 0.0,
            "three_x_cap": 0.0,
            "beyond_three_x": False,
            "tier": _tier_label(po_total),
        }

    direction = "overage" if delta > 0 else "underage"
    tolerance = get_tolerance(po_total, direction)
    three_x_cap = tolerance * 3
    within = abs(delta) <= tolerance

    return {
        "within_tolerance": within,
        "delta": delta,
        "direction": direction,
        "tolerance": tolerance,
        "three_x_cap": three_x_cap,
        "beyond_three_x": not within and abs(delta) > three_x_cap,
        "tier": _tier_label(po_total),
    }


def _tier_label(po_total: float) -> str:
    if po_total < 1_000:
        return "< $1,000"
    elif po_total <= 10_000:
        return "$1,000–$10,000"
    else:
        return "> $10,000"
