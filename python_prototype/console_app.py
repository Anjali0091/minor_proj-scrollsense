from __future__ import annotations

from pathlib import Path

from scrollsense.detector import detect_behaviors
from scrollsense.log_generator import generate_synthetic_logs
from scrollsense.nudge_engine import classify_and_nudge


def main() -> None:
    out_dir = Path(__file__).parent / "output"
    out_dir.mkdir(exist_ok=True)

    logs = generate_synthetic_logs(days=3, events_per_day=220, seed=42)
    detections = detect_behaviors(logs)
    findings = classify_and_nudge(detections)

    csv_path = out_dir / "findings.csv"
    findings.to_csv(csv_path, index=False)

    summary = findings[findings["has_finding"]][["app", "severity"]].value_counts().sort_values(ascending=False)

    print("ScrollSense Console Prototype")
    print("=" * 32)
    print(f"Total events: {len(findings)}")
    print(f"Events with findings: {int(findings['has_finding'].sum())}")
    print("Top findings by app + severity:")
    print(summary.head(12))
    print(f"Saved CSV: {csv_path}")


if __name__ == "__main__":
    main()
