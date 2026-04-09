from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta

import pandas as pd


@dataclass
class DetectorConfig:
    prolonged_scroll_seconds: int = 300
    repeated_reopen_count: int = 3
    repeated_reopen_minutes: int = 30
    late_night_start_hour: int = 23
    late_night_end_hour: int = 6


def detect_behaviors(logs: pd.DataFrame, config: DetectorConfig | None = None) -> pd.DataFrame:
    cfg = config or DetectorConfig()
    data = logs.copy()

    data["timestamp"] = pd.to_datetime(data["timestamp"])
    data["hour"] = data["timestamp"].dt.hour

    social = {"youtube", "instagram", "x", "reddit", "facebook"}

    data["is_prolonged_scroll"] = (
        data["app"].isin(social)
        & (data["session_seconds"] >= cfg.prolonged_scroll_seconds)
        & (data["scroll_events"] > 60)
    )

    # Repeated reopen: same app opened N times within rolling time window.
    data = data.sort_values("timestamp").reset_index(drop=True)
    data["is_repeated_reopen"] = False
    for _app_name, group in data.groupby("app"):
        idx = group.index
        timestamps = list(group["timestamp"])
        flags = []

        for i, ts in enumerate(timestamps):
            window_start = ts - timedelta(minutes=cfg.repeated_reopen_minutes)
            count = 1

            j = i - 1
            while j >= 0 and timestamps[j] >= window_start:
                count += 1
                j -= 1

            flags.append(count >= cfg.repeated_reopen_count)

        data.loc[idx, "is_repeated_reopen"] = flags

    data["is_late_night"] = (data["hour"] >= cfg.late_night_start_hour) | (
        data["hour"] < cfg.late_night_end_hour
    )

    return data
