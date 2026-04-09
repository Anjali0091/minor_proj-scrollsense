from __future__ import annotations

import pandas as pd


def classify_and_nudge(detections: pd.DataFrame) -> pd.DataFrame:
    frame = detections.copy()

    def classify(row: pd.Series) -> tuple[str, str]:
        signals = []
        if row.get("is_late_night"):
            signals.append("late_night")
        if row.get("is_repeated_reopen"):
            signals.append("reopen")
        if row.get("is_prolonged_scroll"):
            signals.append("scroll")

        if not signals:
            return "healthy", "No nudge needed."

        if "scroll" in signals and "late_night" in signals:
            return (
                "high",
                "Long late-night scrolling detected. Try a 5-minute reset before continuing.",
            )

        if "scroll" in signals:
            return (
                "medium",
                "Extended scrolling detected. Pause and pick one intentional next action.",
            )

        if "reopen" in signals:
            return (
                "medium",
                "Repeated app reopening detected. Consider switching to a planned task.",
            )

        return (
            "low",
            "Late-night usage detected. Protect sleep by wrapping up soon.",
        )

    classifications = frame.apply(classify, axis=1, result_type="expand")
    frame["severity"] = classifications[0]
    frame["nudge"] = classifications[1]
    frame["has_finding"] = frame["severity"] != "healthy"
    return frame
