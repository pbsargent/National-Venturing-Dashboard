# Rebuilding the National Venturing Dashboard

This repository contains the application, extraction logic, workbook contract, and automation needed to reconstruct the dashboard from a compatible Excel workbook. The reconstruction materials do not contain the source Excel workbook, credentials, contact fields, or private source rows. The public deployment still contains the generated dashboard snapshot required to operate the live site.

The deployed site reads the generated `data/dashboard-data.json` file at runtime. `data/crews.csv` is the matching flat export. Both are produced by `scripts/refresh_data.py`; neither is read directly from Excel by the browser.

## Requirements

- Python 3.9 or newer
- `openpyxl` 3.1 or newer
- A workbook following the contract below
- Any static HTTP server for local use
- Git and GitHub credentials only when publishing

Install the Python dependency:

```bash
python3 -m pip install -r requirements.txt
```

The dashboard itself is plain HTML, CSS, and JavaScript. It has no Node.js dependency, bundler, database, or external JavaScript library.

## Workbook contract

The workbook must contain worksheets named exactly `Dashboard`, `Crews`, and `UnitMetric`. Header matching is exact and case-sensitive. Extra worksheets and extra columns are allowed and ignored.

Use `templates/Venturing-workbook-template.xlsx` as a data-free starting point. The same contract is available to programs in `schema/workbook-schema.json`.

### Dashboard worksheet

`Dashboard!B2` must contain a real Excel date representing the snapshot date. Text that merely looks like a date is rejected.

### Crews worksheet

Row 1 must contain these headers. Each later row represents one crew.

| Excel header | Required value | Output field | Meaning |
| --- | --- | --- | --- |
| `Unit_ID` | Yes; unique and nonblank | `unitId` | Stable join key and record identifier |
| `CST` | Yes | `cst` | Council Service Territory identifier |
| `Council` | Yes | `council` | Council name |
| `District` | May be blank | `district` | District name |
| `Crew` | Yes | `crewNumber` | Crew number, preserved as an identifier |
| `Renewal` | May be blank | `renewalDate` | Unit renewal date |
| `Total Youth` | May be blank | `youth` | Current youth registrations |
| `Total Adults` | May be blank | `adults` | Current adult registrations |
| `Crew Name` | May be blank | `crewName` | Crew display name |
| `Primary Youth` | May be blank | `primaryYouth` | Current primary youth registrations |
| `Primary YOY` | May be blank | `primaryYoY` | Primary-youth change from the comparison year |
| `Primary to YE` | May be blank | `primaryToYearEnd` | Primary-youth change to year end supplied by the workbook |
| `Unit Metric` | May be blank | `unitMetric` | Workbook unit score; falls back to `UnitMetric.UnitMetric` |
| `Renewal Status` | May be blank | `renewalWorkflow` | Renewal workflow text; blank becomes `Not in renewal workflow` |

Rows with a blank `Unit_ID` are skipped. Duplicate `Unit_ID` values stop the build.

### UnitMetric worksheet

Row 1 must contain these headers. Each later row supplies health signals for one crew.

| Excel header | Required value | Output field | Meaning |
| --- | --- | --- | --- |
| `UnitID` | Yes; unique and nonblank | Join key only | Joins to `Crews.Unit_ID` |
| `UnitMetric` | May be blank | `unitMetric` fallback | Unit score when the Crews value is unavailable |
| `Size` | `Yes`, another value, or blank | `sizeHealthy` | `Yes` becomes true; blank stays unavailable; another value becomes false |
| `Growth` | `Yes`, another value, or blank | `growthHealthy` | Growth health signal |
| `Youth Leadership` | `Yes`, another value, or blank | `leadershipHealthy` | Youth-leadership health signal |
| `Outdoor` | `Yes`, another value, or blank | `outdoorHealthy` | Outdoor-program health signal |
| `UL Trained` | `Yes`, another value, or blank | `unitLeaderTrained` | Unit leader training signal |
| `CC Trained` | `Yes`, another value, or blank | `committeeChairTrained` | Committee chair training signal |
| `Officers Trained` | `Yes`, another value, or blank | `officersTrained` | Crew officer training signal |
| `Retention` | `Yes`, another value, or blank | `retentionHealthy` | Retention health signal |

The extractor performs a left join from `Crews` to `UnitMetric` after converting both identifiers to trimmed strings. An unmatched crew remains in the dashboard and its joined signals stay unavailable. Duplicate `UnitMetric.UnitID` values should not be supplied; a later duplicate would replace an earlier one in the lookup.

## Normalization and missing values

- Leading and trailing whitespace is removed, and internal whitespace runs are collapsed.
- Real Excel dates are serialized as `YYYY-MM-DD`.
- Numeric fields remain numeric. A nonnumeric or blank numeric cell becomes `null`, except where the application deliberately sums available counts.
- `Yes` matching is case-insensitive. A blank Excel cell becomes `null`; `No` or any other supplied value becomes `false`.
- Missing measurements remain unavailable in labels, rates, and averages. They are not converted to a healthy result.
- `unitId`, `cst`, and `crewNumber` are serialized as strings so identifiers are not reformatted by the browser.

## Derived dashboard measures

All filters apply to the summary cards, health board, detail record, and diagnostic charts.

### Unit Metric bands

- Strong: score at least 4
- Watch: score at least 2 and below 4
- Risk: score below 2
- Unavailable: no numeric score

### Training status and coverage

- Complete: unit leader and committee chair are both trained
- Partial: exactly one of those two leaders is trained
- Gap: both are explicitly not trained
- Unavailable: either training field is missing
- Training coverage: crews marked Complete divided by crews having both training fields available

### Renewal horizon

The renewal date is compared with `Dashboard!B2`.

- Past: renewal date precedes the snapshot date
- Next 120: renewal date is from the snapshot date through 120 days later
- Later: renewal date is more than 120 days later
- Unavailable: no usable renewal date

### Health progress

Health progress is the percentage of available positive signals across these six tests:

1. Size is healthy.
2. Growth is healthy.
3. Youth leadership is healthy.
4. Outdoor activity is healthy.
5. Unit leader and committee chair are both trained.
6. Unit Metric is at least 3.

Missing signals are excluded from the numerator and denominator. The result is rounded to the nearest whole percent.

### Other summaries

- Total crews is the number of filtered crew records.
- Total youth, primary youth, total adults, and primary YOY are sums over the filtered records. Missing values contribute nothing to a sum.
- Average Unit Metric is the unweighted mean of available Unit Metric values.
- Council count is the distinct count of council names in the filtered records.
- Primary youth by CST and by council are sums over the same filtered records.

The authoritative implementation is `src/app.js`; these definitions document its current behavior.

## Privacy boundary

The extractor uses an allowlist: only the output fields listed in `scripts/refresh_data.py` are written. Contact names, email addresses, phone numbers, meeting addresses, websites, and charter-organization fields are not mapped.

The build validation also rejects generated keys matching these protected field families:

- `beascoutcontact`
- `beascoutemail`
- `beascoutphone`
- `beascoutaddress`
- `crewwebsite`
- `charterorg`

Keep the real workbook under `source/`; that directory is ignored by Git. Do not commit credentials, signed URLs, or private workbook exports.

## End-to-end reconstruction

1. Clone the repository.
2. Install `requirements.txt`.
3. Copy `templates/Venturing-workbook-template.xlsx` to `source/Venturing.xlsx`, or adapt an existing export to the documented sheet and header names.
4. Enter the snapshot date in `Dashboard!B2` and populate the `Crews` and `UnitMetric` rows.
5. Generate and validate the dashboard data:

```bash
automation/national-venturing-dashboard/build_national_venturing_dashboard.sh --source source/Venturing.xlsx
```

6. Serve the repository root over HTTP:

```bash
python3 -m http.server 8000
```

7. Open `http://localhost:8000/src/` and verify the default view, a CST filter, a council filter, a crew detail, and Reset/All behavior.

The build stops when required worksheets or headers are absent, crew IDs are duplicated, generated row counts do not reconcile, UnitMetric join counts do not reconcile, the CSV is missing, or protected field keys are exposed.

## File flow

```text
source/Venturing*.xlsx
        |
        v
scripts/refresh_data.py
        |
        +--> data/dashboard-data.json --> src/app.js --> browser dashboard
        |
        +--> data/crews.csv -----------> CSV download
```

`index.html` redirects GitHub Pages visitors to `src/`. GitHub Pages is configured to publish from the root of `main` with HTTPS enforced.

## Historyless publication

The publisher preserves the Sea Scout project's historyless approach. It reads the current remote tree, overlays only the explicitly selected files, creates a new parentless commit, and force-pushes it with a lease. It refuses to run unless the checked-out branch is `main` and `origin` exactly matches `--expected-remote` or `VENTURING_DASHBOARD_REMOTE_URL`.

For data-only refreshes, the default selected files are `data/crews.csv` and `data/dashboard-data.json`. For source or documentation changes, pass those paths explicitly. GitHub credentials are read from `GH_TOKEN`, `GITHUB_TOKEN`, or the local token file named in the publisher; credentials are never stored in the repository.
