from __future__ import annotations

import random
from datetime import datetime, timedelta

import pandas as pd

APPS = [
    "youtube",
    "instagram",
    "x",
    "reddit",
    "facebook",
    "linkedin",
    "browser_news",
    "messaging",
]


def generate_synthetic_logs(
    days: int = 3,
    events_per_day: int = 250,
    seed: int = 42,
) -> pd.DataFrame:
    random.seed(seed)
    now = datetime.now().replace(minute=0, second=0, microsecond=0)
    start = now - timedelta(days=days)

    records: list[dict] = []
    current = start

    for _day in range(days):
        day_anchor = current.replace(hour=8)

        for _ in range(events_per_day):
            # Bias toward social apps and introduce late-night bursts.
            app = random.choices(APPS, weights=[6, 6, 5, 4, 4, 2, 3, 2], k=1)[0]
            late_hour = random.random() < 0.15
            hour = random.randint(0, 5) if late_hour else random.randint(8, 23)
            minute = random.randint(0, 59)
            second = random.randint(0, 59)
            ts = day_anchor.replace(hour=hour, minute=minute, second=second)

            session_seconds = max(15, int(random.gauss(140, 90)))
            if app in {"youtube", "instagram", "x", "reddit", "facebook"} and random.random() < 0.28:
                session_seconds += random.randint(120, 420)

            scroll_events = 0
            if app in {"youtube", "instagram", "x", "reddit", "facebook"}:
                scroll_events = max(0, int(random.gauss(session_seconds * 0.45, 25)))

            records.append(
                {
                    "timestamp": ts.isoformat(),
                    "app": app,
                    "session_seconds": session_seconds,
                    "scroll_events": scroll_events,
                }
            )

        current += timedelta(days=1)

    frame = pd.DataFrame(records).sort_values("timestamp").reset_index(drop=True)
    return frame
