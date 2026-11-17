# National Venturing Dashboard

Local static dashboard built from the newest Venturing workbook capture in `source/`. Its repository layout, refresh flow, local serving model, and optional historyless publisher follow the National Sea Scout Dashboard project.

## Project layout

- `index.html` redirects to the dashboard under `src/`.
- `src/` contains the static dashboard, help page, styles, scripts, and official Venturing trademark asset.
- `data/crews.csv` and `data/dashboard-data.json` are generated dashboard snapshots.
- `scripts/refresh_data.py` reads the newest `source/Venturing*.xlsx` workbook.
- `docs/REBUILDING.md` documents the workbook contract, field mappings, calculations, privacy boundary, and end-to-end reconstruction process.
- `schema/workbook-schema.json` provides the workbook contract in machine-readable form.
- `templates/Venturing-workbook-template.xlsx` is a formatted, header-only workbook with no Venturing records.
- `automation/national-venturing-dashboard/` contains independent build and historyless-publish commands.

The `.openai/hosting.json` manifest and ChatGPT Sites Git remote have been removed. This project does not depend on ChatGPT Sites.

## Refresh the data

Install the only Python dependency, place a current workbook in `source/` with a name beginning with `Venturing`, then run:

```bash
python3 -m pip install -r requirements.txt
python3 scripts/refresh_data.py
```

To select a specific workbook:

```bash
python3 scripts/refresh_data.py --source /path/to/Venturing.xlsx
```

The refresh writes `data/crews.csv` and `data/dashboard-data.json`. Contact names, email addresses, phone numbers, meeting addresses, websites, and charter-organization fields are excluded.

See [Rebuilding the dashboard](docs/REBUILDING.md) for the exact worksheet names, required headers, join keys, transformations, metric definitions, verification rules, and publishing sequence. Start from the [header-only workbook template](templates/Venturing-workbook-template.xlsx) when adapting another workbook export. The real source workbook is intentionally excluded by `.gitignore`.

## Build and validate

```bash
automation/national-venturing-dashboard/build_national_venturing_dashboard.sh
```

This regenerates both data files and verifies row counts, Unit Metric joins, CSV creation, and the private-field exclusion.

## Run locally

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/src/`.

## Optional historyless GitHub publishing

The publisher mirrors the Sea Scout dashboard's one-parentless-commit approach and refuses to run until an exact GitHub origin is configured. Add the intended repository as `origin`, then provide the same URL through `VENTURING_DASHBOARD_REMOTE_URL` or `--expected-remote`.

```bash
automation/national-venturing-dashboard/force_publish_dashboard_historyless.sh
```

By default it overlays only `data/crews.csv` and `data/dashboard-data.json` on the current remote tree. No schedule or production destination is installed by this repository.

## Venturing branding

The dashboard follows the supplied 2024 Scouting America brand guidelines. Venturing Green (`#006B3F`) is the primary color, Venturing Yellow (`#FCD116`) is the accent, and white plus Scouting America grays support the interface. Montserrat is preferred when installed, with Arial and Helvetica fallbacks. The official Venturing trademark is used unaltered on a white field.
