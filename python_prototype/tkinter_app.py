from __future__ import annotations

import tkinter as tk
from tkinter import ttk

from scrollsense.detector import detect_behaviors
from scrollsense.log_generator import generate_synthetic_logs
from scrollsense.nudge_engine import classify_and_nudge


class ScrollSenseApp(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("ScrollSense Tkinter Prototype")
        self.geometry("980x560")

        self._build_ui()

    def _build_ui(self) -> None:
        top = ttk.Frame(self, padding=10)
        top.pack(fill="x")

        ttk.Label(top, text="ScrollSense Findings Viewer", font=("Segoe UI", 14, "bold")).pack(side="left")
        ttk.Button(top, text="Generate + Analyze", command=self._run).pack(side="right")

        self.summary_var = tk.StringVar(value="Click 'Generate + Analyze' to start.")
        ttk.Label(self, textvariable=self.summary_var, padding=(10, 0)).pack(fill="x")

        columns = ("timestamp", "app", "severity", "nudge")
        tree = ttk.Treeview(self, columns=columns, show="headings", height=22)
        for col in columns:
            tree.heading(col, text=col.title())

        tree.column("timestamp", width=170)
        tree.column("app", width=120)
        tree.column("severity", width=90)
        tree.column("nudge", width=560)

        tree.pack(fill="both", expand=True, padx=10, pady=10)
        self.tree = tree

    def _run(self) -> None:
        logs = generate_synthetic_logs(days=3, events_per_day=220, seed=42)
        detections = detect_behaviors(logs)
        findings = classify_and_nudge(detections)

        marked = findings[findings["has_finding"]].sort_values("timestamp", ascending=False).head(80)

        for item in self.tree.get_children():
            self.tree.delete(item)

        for row in marked.itertuples(index=False):
            self.tree.insert("", "end", values=(row.timestamp, row.app, row.severity, row.nudge))

        self.summary_var.set(
            f"Total events: {len(findings)} | Findings: {int(findings['has_finding'].sum())} | Displayed: {len(marked)}"
        )


if __name__ == "__main__":
    app = ScrollSenseApp()
    app.mainloop()
