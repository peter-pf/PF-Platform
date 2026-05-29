# Software Requirements Specification: GUHMA Integration (Research & Specification)

**Project:** Pier Foundations -- GUHMA Column Logging Integration
**Version:** 1.0
**Date:** May 29, 2026
**Prepared by:** Peter (AI COO)

---

## 1. Overview

A research and specification document for integrating GUHMA column installation logging data with the PF Platform. Defines the target automated QC checks, data requirements, and integration architecture. The build phase is contingent on receiving sample GUHMA data files and Brad's approval.

## 2. Known Data Structure (From SOP Analysis)

### 2.1 File Format (Preliminary -- Needs Validation with Sample Data)

Based on SOP references to editing files in Notepad:
- Files appear to be delimited text (semicolon-separated based on SOP mention of `;0;` column)
- One file per column (individual files in the zip)
- Each row likely represents a time-series data point during installation
- Columns include timestamp, depth, pressure values, winch values, and bucket count

### 2.2 Known Data Fields Per Column

| Field | SOP Reference | Data Type | Unit |
|-------|--------------|-----------|------|
| Column/Pile ID | "pile number in the left column" | Text | Column ID (e.g., P1, C14) |
| Depth | "2 depth from dropdown" | Float | Feet |
| Time | "time diagram" with timebase | Timestamp | Seconds or HH:MM:SS |
| Flot Pressure | "14 Flot" | Integer | PSI (0-5000 range) |
| Winch A (Down) | "9 Winch A (Winch Down)" | Integer | PSI (0-5000 range) |
| Winch B (Up) | "10 PSI B (Winch Up)" | Integer | PSI (0-5000 range) |
| Buckets | "7 Buckets" | Integer | Count (0-5 range) |

### 2.3 Report Configuration (From SOP)

| Setting | Value |
|---------|-------|
| Depth range | 0 to next interval of 5 above deepest column |
| Depth interval | 1 or 2 (2 if >20 feet) |
| Bucket range | 0-5, interval 1 |
| Flot pressure range | 0-5000, interval 1000, smoothing 1 |
| Winch A range | 0-5000, interval 1000, smoothing 1 |
| Winch B range | 0-5000, interval 1000, smoothing 1 |

## 3. Functional Requirements (Target -- Build Phase)

### 3.1 GUHMA Data Importer

| Requirement | Specification |
|-------------|--------------|
| Input Format | Zip file containing individual column data files (text) |
| File Parsing | Parse semicolon-delimited (or determined delimiter) text files |
| Data Extraction | Extract column ID, depth, pressures, buckets, timestamps |
| Multi-Project | Associate imported data with a specific project |
| Version Handling | Detect and handle GUHMA format variations |
| Error Handling | Flag unparseable files; continue with remaining |
| Storage | Store parsed data in structured format for analysis |

### 3.2 Automated QC Checks

#### Check 1: Column Accounting
| Aspect | Specification |
|--------|--------------|
| Purpose | Verify all columns from approved shop drawings are present in GUHMA data |
| Input | GUHMA column list + submittal column list |
| Logic | Compare column IDs; flag missing columns |
| Output | Pass (all present) / Fail (list missing column IDs) |
| Alert | Immediate notification to Jonathan if any columns missing |
| SOP Reference | Step 18a/18b: "Make sure all columns are accounted for" |

#### Check 2: Depth Verification
| Aspect | Specification |
|--------|--------------|
| Purpose | Verify each column reached design depth |
| Input | GUHMA actual depth per column + design depth from submittal |
| Logic | For each column: actual_depth >= design_depth |
| Tolerance | _TBD with Dr. Ed -- suggest 6 inches initially_ |
| Output | Pass/Fail per column; flagged columns highlighted in red |
| Alert | Flagged columns require engineering review before demobilization |
| SOP Reference | Step 18c: "Go to the Depth column and read off the actual installed depth" |

#### Check 3: Stone Bucket Reconciliation
| Aspect | Specification |
|--------|--------------|
| Purpose | Verify GUHMA bucket count matches hand log count |
| Input | GUHMA bucket data + hand log bucket data (from daily logs) |
| Logic | For each column: GUHMA_buckets == hand_log_buckets |
| Output | Discrepancy list with suggested corrections |
| Auto-Correction | _Considered but risky -- suggest flagging only, manual correction_ |
| SOP Reference | Step 18e: "Compare to the buckets of stone shown in GUHMA software" |

#### Check 4: Pressure Anomaly Detection
| Aspect | Specification |
|--------|--------------|
| Purpose | Identify unusual pressure patterns during installation |
| Input | Flot pressure and winch pressure time series |
| Logic | Flag: pressure drops to 0 during installation, pressure exceeds 4500 PSI sustained, sudden pressure spikes |
| Thresholds | _TBD with Dr. Ed_ |
| Output | Anomaly list per column with timestamp and pressure value |
| Alert | Advisory only -- requires engineering interpretation |

#### Check 5: Production Consistency
| Aspect | Specification |
|--------|--------------|
| Purpose | Identify columns with unusual installation times |
| Input | Installation duration per column from timestamps |
| Logic | Flag columns >2 standard deviations from mean install time |
| Output | List of unusually fast or slow columns for review |
| Purpose | Catch potential data issues or problematic installations |

### 3.3 QC Dashboard

| View | Content |
|------|---------|
| Project Summary | Total columns, pass rate, failure count by check type |
| Column Detail | Individual column data with all QC check results |
| Depth Map | Visual overlay of actual vs. design depth for all columns |
| Failure List | All flagged columns with reason and status (resolved/pending) |
| Bucket Reconciliation | Side-by-side GUHMA vs. hand log comparison |

### 3.4 Exception Report

Auto-generated PDF containing:
- Project information (name, number, GC)
- Summary of QC checks (pass/fail counts)
- Detailed listing of all failed checks
- Depth comparison table (actual vs. design, color-coded)
- Bucket discrepancy table
- Pressure anomalies (if any)
- Recommended actions (re-install, engineering review, data correction)
- Signature line for engineering review (Dr. Ed)

### 3.5 Data Correction Tracking

| Field | Type | Description |
|-------|------|-------------|
| Column ID | Reference | Which column |
| Correction Type | Dropdown | Bucket count, Depth value, Column ID rename |
| Original Value | Auto | What GUHMA had |
| Corrected Value | Number | What it should be |
| Correction Source | Dropdown | Hand log, Field verification, Engineering direction |
| Corrected By | Text | Who made the correction |
| Date | Auto | When corrected |
| Reason | Text | Why correction was needed |

## 4. Non-Functional Requirements

| Requirement | Specification |
|-------------|--------------|
| Import Time | < 30 seconds for a full project zip |
| QC Check Time | < 10 seconds for all checks on a project |
| File Handling | Support zip files up to 100MB |
| Browser Support | Chrome, Edge, Safari (latest 2 versions) |
| Data Storage | Structured storage of parsed column data |
| Export | PDF exception report, CSV raw data export |

## 5. Data Flow (Target)

```
GUHMA Desktop App (field data collection)
    |
    v
Zip file exported from GUHMA
    |
    v
Upload to PF Platform
    |
    v
Parser extracts structured data
    |
    +--- Column accounting check (vs. submittal)
    |
    +--- Depth verification (vs. design depth)
    |
    +--- Bucket reconciliation (vs. hand logs/daily logs)
    |
    +--- Pressure anomaly detection
    |
    +--- Production consistency check
    |
    v
QC Dashboard
    |
    +--- All Pass --> Ready for closeout report
    |
    +--- Failures --> Exception report for review
    |                     |
    |                     v
    |               Corrections applied --> Re-check
    |
    v
GUHMA report + QC results --> Punch List & Closeout
```

## 6. Integration Points

| System | Integration | Priority |
|--------|------------|----------|
| PF Platform | Embedded module | Required |
| Daily Logs | Hand log bucket counts for reconciliation | Required |
| Project Status Tracking | QC status indicator | Phase 2 |
| Punch List & Closeout | GUHMA report for closeout package | Required |
| Equipment Tracker | Equipment ID matching | Phase 2 |

## 7. Research Phase Deliverables Needed

| Item | Source | Status |
|------|--------|--------|
| Sample GUHMA data zip (completed project) | Jonathan | **BLOCKED -- Need from Jonathan** |
| GUHMA software documentation | GUHMA vendor or Jonathan | Not started |
| Design depth data from a sample submittal | Jonathan / Dr. Ed | Not started |
| Hand logs from the same sample project | Jonathan / Field | Not started |
| Dr. Ed's depth tolerance criteria | Dr. Ed | Not started |
| Pressure thresholds for anomaly detection | Dr. Ed | Not started |

## 8. Open Questions (For Brad/Jonathan/Dr. Ed)

1. **Can Jonathan provide a complete GUHMA data zip from a finished project?** (Blocking item)
2. What format are the raw GUHMA data files? (Confirmed text-based from SOP, but need to see actual files)
3. What is the acceptable depth tolerance -- exactly at design depth, or some tolerance?
4. What pressure patterns indicate a problem vs. normal installation?
5. How many columns per project typically need bucket corrections?
6. Does Dr. Ed review the GUHMA data independently, or rely on PF's QC check?
7. Is there interest from Dr. Ed in having automated QC checks run before he reviews?
8. What version of GUHMA software is PF running?
9. Does GUHMA have any export formats beyond the raw data files (CSV, JSON)?
