# ScrollSense Python Prototype

This folder contains a lightweight Python prototype of ScrollSense behavior detection and nudging.

## Components

- Synthetic smartphone usage log generation
- Behavior detection algorithms:
  - prolonged scrolling sessions
  - repeated reopening of same app/site
  - late-night usage
- Nudge engine for classification and prompt generation
- Console workflow
- Tkinter desktop UI
- Static HTML dashboard generator

## Setup

```bash
cd python_prototype
python -m venv .venv
.venv\\Scripts\\activate
pip install -r requirements.txt
```

## Run Console Prototype

```bash
python console_app.py
```

## Run Tkinter UI

```bash
python tkinter_app.py
```

## Generate Static HTML Dashboard

```bash
python dashboard.py
```

Dashboard output:

- output/dashboard.html
- output/findings.csv (from console prototype)
