from __future__ import annotations

from pathlib import Path

import pandas as pd

from scrollsense.detector import detect_behaviors
from scrollsense.log_generator import generate_synthetic_logs
from scrollsense.nudge_engine import classify_and_nudge


def build_dashboard_html(frame: pd.DataFrame) -> str:
    total = len(frame)
    findings = int(frame["has_finding"].sum())
    late_night = int(frame["is_late_night"].sum())
    prolonged = int(frame["is_prolonged_scroll"].sum())
    reopen = int(frame["is_repeated_reopen"].sum())

    top_rows = (
        frame[frame["has_finding"]][["timestamp", "app", "severity", "nudge"]]
        .sort_values("timestamp", ascending=False)
        .head(20)
    )

    table_rows = "\n".join(
        f"<tr><td>{row.timestamp}</td><td>{row.app}</td><td>{row.severity}</td><td>{row.nudge}</td></tr>"
        for row in top_rows.itertuples(index=False)
    )

    return f"""<!doctype html>
<html lang=\"en\">
<head>
  <meta charset=\"UTF-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />
  <title>ScrollSense Static Dashboard</title>
  <style>
    body {{ font-family: Segoe UI, Arial, sans-serif; margin: 20px auto; max-width: 1000px; padding: 0 16px; color: #281913; background: #fffaf6; }}
    .grid {{ display: grid; gap: 10px; grid-template-columns: repeat(4, minmax(0, 1fr)); }}
    .card {{ border: 1px solid #e8d7c8; border-radius: 12px; background: #fff; padding: 12px; }}
    h1 {{ margin-bottom: 8px; }}
    table {{ width: 100%; border-collapse: collapse; margin-top: 14px; background: #fff; }}
    th, td {{ border: 1px solid #ead8ca; padding: 8px; text-align: left; font-size: 13px; }}
    th {{ background: #fff1e4; }}
    @media (max-width: 900px) {{ .grid {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }} }}
  </style>
</head>
<body>
  <h1>ScrollSense Prototype Dashboard</h1>
  <p>Static summary from synthetic smartphone usage logs.</p>
  <section class=\"grid\">
    <article class=\"card\"><h3>{total}</h3><p>Total events</p></article>
    <article class=\"card\"><h3>{findings}</h3><p>Detected findings</p></article>
    <article class=\"card\"><h3>{late_night}</h3><p>Late-night events</p></article>
    <article class=\"card\"><h3>{prolonged}</h3><p>Prolonged scroll events</p></article>
  </section>
  <section class=\"card\" style=\"margin-top: 10px\"><h3>{reopen}</h3><p>Repeated reopen events</p></section>
  <table>
    <thead><tr><th>Timestamp</th><th>App</th><th>Severity</th><th>Nudge</th></tr></thead>
    <tbody>{table_rows}</tbody>
  </table>
</body>
</html>
"""


def main() -> None:
    out_dir = Path(__file__).parent / "output"
    out_dir.mkdir(exist_ok=True)

    logs = generate_synthetic_logs(days=3, events_per_day=220, seed=42)
    detections = detect_behaviors(logs)
    findings = classify_and_nudge(detections)

    html = build_dashboard_html(findings)
    output_path = out_dir / "dashboard.html"
    output_path.write_text(html, encoding="utf-8")

    print(f"Dashboard saved to: {output_path}")


if __name__ == "__main__":
    main()
