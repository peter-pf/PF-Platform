# Software Requirements Specification: Daily Logs & Reporting Tool

**Project:** Pier Foundations -- Daily Field Logs & Production Reporting
**Version:** 1.2
**Date:** May 31, 2026
**Prepared by:** Peter (AI COO)

---

## Implementation Status: Alpha v1.0 -- Built and deployed May 30, 2026

## 1. Overview

A mobile-first daily reporting module integrated into the PF Platform that captures field production data, crew information, equipment status, weather, and safety observations. Auto-calculates production rates against the LF/1000 baseline and feeds cumulative data into Project Status Tracking.

## 2. Functional Requirements

### 2.1 Daily Log Form

#### Section A: General Information (Required)
| Field | Type | Description |
|-------|------|-------------|
| Project | Dropdown | Active projects from Pipeline |
| Date | Date | Report date (default: today) |
| Report Completed By | Text | Name of person completing log |
| Shift | Dropdown | Day, Night, Split |
| Work Status | Dropdown | Full Day, Half Day, Weather Delay, No Work |

#### Section B: Weather (Required)
| Field | Type | Description |
|-------|------|-------------|
| Temperature High | Number (F) | Day's high temperature |
| Temperature Low | Number (F) | Day's low temperature |
| Conditions | Multi-select | Clear, Partly Cloudy, Overcast, Rain, Snow, Wind, Fog |
| Wind Speed (est.) | Dropdown | Calm, Light (<10 mph), Moderate (10-20), Strong (20-30), High (30+) |
| Weather Impact | Dropdown | None, Minor Delay, Significant Delay, Full Day Lost |
| Weather Notes | Text | Details on weather impact |

#### Section C: Crew (Required)
| Field | Type | Description |
|-------|------|-------------|
| Crew Count | Number | Total PF personnel on site |
| Crew Members | Text list | Names of crew on site |
| Hours Worked | Number | Total crew hours (e.g., 4 people * 10 hours = 40) |
| Subcontractors on Site | Text | Names and role (surveyor, trucker, etc.) |

#### Section D: Production (Required on work days)
| Field | Type | Description |
|-------|------|-------------|
| Columns Installed Today | Number | Count of completed columns |
| Column IDs Installed | Text list | Pier numbers from shop drawings (e.g., P1, P2, P3) |
| LF Installed Today | Number | Total linear feet installed today |
| Cumulative LF Installed | Auto-calculated | Running total for project |
| Cumulative Columns Installed | Auto-calculated | Running total for project |
| Stone Consumed Today (buckets) | Number | Buckets of stone used |
| Stone Consumed Today (tons) | Number | If tonnage known from delivery tickets |
| Cumulative Stone (tons) | Auto-calculated | Running total |
| Column Diameter | Display | 24" or 30" (from project setup) |
| Production Rate | Auto-calculated | LF installed today / 1 day |
| Average Production Rate | Auto-calculated | Cumulative LF / work days elapsed |
| Target Production Rate | Auto-calculated | 1000 LF/day (from SOP baseline) |
| Variance | Auto-calculated | Actual rate vs. target, as percentage |

#### Section E: Equipment (Required)
| Field | Type | Description |
|-------|------|-------------|
| Equipment on Site | Multi-select | From Equipment Tracker registry |
| Equipment Hours Today | Number per asset | Operating hours logged today |
| Equipment Issues | Text | Any mechanical problems, downtime |
| Equipment Downtime (hours) | Number | Hours lost to equipment issues |

#### Section F: Materials (Optional)
| Field | Type | Description |
|-------|------|-------------|
| Stone Deliveries Received | Number (tons) | Tons received today |
| Stone Supplier | Text | Delivering supplier |
| Stone on Hand (est.) | Number (tons) | Estimated remaining inventory on site |
| Other Materials Received | Text | Any other deliveries |

#### Section G: Safety (Required)
| Field | Type | Description |
|-------|------|-------------|
| Toolbox Talk Conducted | Yes/No | Daily safety brief completed |
| Toolbox Talk Topic | Text | What was discussed |
| Incidents | Number | Safety incidents (0 = none) |
| Incident Description | Text | If >0, describe each incident |
| Near Misses | Number | Near-miss observations |
| Near Miss Description | Text | If >0, describe |
| Visitor on Site | Yes/No + Name | GC superintendent, inspector, etc. |

#### Section H: Issues & Notes (Optional)
| Field | Type | Description |
|-------|------|-------------|
| Delays | Text | Non-weather delays (waiting on survey, GC issues, etc.) |
| GC Communications | Text | Important conversations with GC |
| Field Observations | Text | Soil conditions, unexpected findings |
| Change Order Potential | Yes/No + Description | Flag conditions that may trigger a CO |
| Photos | File upload (multiple) | Field documentation |

### 2.2 Production Dashboard

#### Daily View
| Metric | Display |
|--------|---------|
| LF Installed Today | Number (large) |
| Columns Today | Number |
| Production Rate vs. Target | Gauge chart (red/yellow/green) |
| Cumulative Progress | Progress bar (LF installed / total LF) |
| Days Remaining (at current rate) | Calculated |
| Estimated Completion vs. Plan | Days ahead/behind |

#### Trend View
| Chart | Data |
|-------|------|
| Daily LF (bar chart) | LF per day over project duration |
| Cumulative LF (line chart) | Actual vs. planned progress curve |
| Production Rate Trend | Rolling 5-day average rate |
| Stone Consumption | Daily and cumulative |

### 2.3 Auto-Calculations

#### Production Rate
```
daily_rate = LF_installed_today
avg_rate = cumulative_LF / work_days_elapsed
target_rate = 1000  (LF per working day, per SOP)
variance = ((avg_rate - target_rate) / target_rate) * 100
```

#### Days Remaining
```
remaining_LF = total_project_LF - cumulative_LF
days_remaining = remaining_LF / avg_rate  (at current rate)
planned_remaining = remaining_LF / target_rate  (at plan rate)
schedule_delta = days_remaining - planned_remaining
```

#### Stone Consumption Check
```
expected_stone = cumulative_LF * stone_per_LF_factor  (from Dr. Ed design)
actual_stone = cumulative_stone_tons
stone_variance = ((actual_stone - expected_stone) / expected_stone) * 100
Flag if variance > 15%
```

### 2.4 Log Validation

| Rule | Action |
|------|--------|
| LF installed but zero columns | Warning: "Did you mean to enter 0 columns?" |
| Columns installed but zero LF | Warning: check LF entry |
| Stone consumed but no columns | Warning: unusual -- verify |
| Equipment hours > 14 per asset per day | Warning: verify extended shift |
| Missing log for a work day | Alert to Jonathan next morning |

### 2.5 Offline Capability

- Form works without internet connection
- Data stored locally on device
- Syncs automatically when connection restored
- Conflict resolution: most recent entry wins, with notification

## 3. Non-Functional Requirements

| Requirement | Specification |
|-------------|--------------|
| Form Completion Time | < 10 minutes |
| Mobile UI | Touch-optimized, large inputs, minimal typing |
| Browser Support | Chrome, Edge, Safari (latest 2 versions) |
| Offline | Full form entry without connection; sync on reconnect |
| Data Storage | Local (JSON) with sync to platform database |
| Export | PDF daily log, CSV production data |
| Photo Upload | JPEG, PNG up to 10MB per photo, unlimited count |

## 4. Data Flow

```
Field Crew completes daily log (mobile)
    |
    v
Data syncs to PF Platform
    |
    +--- Production data --> Project Status Tracking
    |         |
    |         v
    |    Schedule vs. actual, completion %, days remaining
    |
    +--- Equipment hours --> Equipment Tracker
    |
    +--- Stone consumption --> Material tracking
    |
    +--- CO potential flags --> Change Order Management
    |
    +--- Safety data --> Safety Checklists (aggregate)
    |
    +--- Column IDs --> GUHMA cross-reference
```

## 5. Integration Points

| System | Integration | Priority |
|--------|------------|----------|
| PF Platform | Core module | Required |
| Project Status Tracking | Feed production data for dashboard | Required |
| Equipment Tracker | Update equipment hours | Required |
| GUHMA Integration | Cross-reference column IDs and counts | Phase 2 |
| Change Order Management | Flag CO-potential conditions | Phase 2 |
| Safety Checklists | Aggregate safety data | Phase 2 |

## 6. Open Questions (For Brad/Jonathan)

1. What does the current hand log / daily report look like? Can we digitize the existing format?
2. How many buckets of stone per column is typical (by diameter)?
3. What is the bucket-to-ton conversion factor?
4. Is 1000 LF/day the standard target across all projects, or does it vary?
5. How many photos per day does the field crew typically take?
6. Should the daily log include a sign-off from the GC superintendent?
7. Is there a minimum stone inventory threshold that should trigger a reorder alert?
