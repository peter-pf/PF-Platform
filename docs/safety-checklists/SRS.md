# Software Requirements Specification: Safety Checklists Tool

**Project:** Pier Foundations -- Safety Checklists & Compliance
**Version:** 1.0
**Date:** May 29, 2026
**Prepared by:** Peter (AI COO)

---

## 1. Overview

A mobile-first safety compliance module integrated into the PF Platform that provides pre-shift safety checklists, equipment inspection forms, toolbox talk logging, and OSHA compliance tracking specific to vibratory stone column installation operations.

## 2. Functional Requirements

### 2.1 Pre-Shift Safety Checklist

Completed before operations begin each work day.

#### Site Conditions
| Check Item | Type | Required |
|-----------|------|----------|
| Site access clear and safe | Pass/Fail | Yes |
| Work area inspected for hazards | Pass/Fail | Yes |
| Underground utilities located (811 called) | Pass/Fail/N/A | Yes |
| Overhead hazards identified (power lines) | Pass/Fail/N/A | Yes |
| Adequate lighting for operations | Pass/Fail | Yes |
| Excavation/trench protections in place | Pass/Fail/N/A | Yes |
| Fire extinguisher accessible | Pass/Fail | Yes |
| First aid kit accessible and stocked | Pass/Fail | Yes |
| Emergency contact info posted | Pass/Fail | Yes |
| Nearest hospital/emergency facility identified | Pass/Fail | Yes |

#### PPE Verification
| Check Item | Type | Required |
|-----------|------|----------|
| Hard hat (all personnel) | Pass/Fail | Yes |
| Safety glasses/goggles | Pass/Fail | Yes |
| Steel-toed boots | Pass/Fail | Yes |
| High-visibility vest | Pass/Fail | Yes |
| Hearing protection available | Pass/Fail | Yes |
| Gloves (appropriate type) | Pass/Fail | Yes |
| Dust mask/respirator available | Pass/Fail | Yes (silica) |
| Fall protection (if applicable) | Pass/Fail/N/A | Yes |

#### OSHA-Specific Checks
| Check Item | Type | Standard | Required |
|-----------|------|----------|----------|
| Silica exposure controls in place | Pass/Fail | 29 CFR 1926.1153 | Yes |
| Water/wet methods for dust suppression | Pass/Fail | Table 1 | Yes |
| Heat illness prevention plan reviewed | Pass/Fail/N/A | OSHA Guidelines | Seasonal |
| Vibration exposure monitoring | Pass/Fail | 29 CFR 1926 | Yes |
| Noise monitoring/hearing conservation | Pass/Fail | 29 CFR 1926.52 | Yes |
| Lockout/tagout procedures reviewed | Pass/Fail/N/A | 29 CFR 1926.417 | As needed |

#### Sign-Off
| Field | Type |
|-------|------|
| Completed By | Text (name) |
| Date/Time | Auto-timestamp |
| All Items Pass | Calculated |
| Corrective Actions Taken | Text (if any Fail items) |
| Supervisor Acknowledgment | Signature/checkbox |

### 2.2 Equipment Inspection Form

#### Daily Equipment Checks (Before Operation)
| Check Item | Equipment | Type |
|-----------|-----------|------|
| Walk-around visual inspection | All | Pass/Fail |
| Fluid levels (oil, hydraulic, coolant) | Excavator | Pass/Fail |
| Track condition and tension | Cat 336 | Pass/Fail |
| Hydraulic hose condition (no leaks) | Excavator + Vibroflot | Pass/Fail |
| Vibroflot attachment secure | Vibroflot | Pass/Fail |
| Vibroflot nose cone condition | Vibroflot | Pass/Fail |
| Electrical connections secure | All | Pass/Fail |
| Backup alarm functional | Excavator | Pass/Fail |
| Horn functional | Excavator | Pass/Fail |
| Mirrors/cameras clean | Excavator | Pass/Fail |
| Seatbelt functional | Excavator | Pass/Fail |
| Fire extinguisher on machine | Excavator | Pass/Fail |
| Testing jack condition | Test Jack | Pass/Fail |
| Jack calibration current | Test Jack | Pass/Fail (from Equipment Tracker) |
| Reaction beams/plates condition | Testing equipment | Pass/Fail |

#### Failure Protocol
If any item fails:
1. Document the failure with photo
2. Notify foreman immediately
3. Do not operate until corrected
4. Record corrective action taken

### 2.3 Toolbox Talk Log

#### Talk Record
| Field | Type | Description |
|-------|------|-------------|
| Date | Date | Talk date |
| Project | Reference | Active project |
| Topic | Dropdown + Custom | From topic library or custom |
| Duration (minutes) | Number | How long the talk lasted |
| Presented By | Text | Who led the talk |
| Attendees | Text list | Names of all attendees |
| Key Points | Text | Summary of discussion |
| Sign-in Sheet | File upload | Photo of sign-in sheet (if paper backup) |

#### Topic Library (VSC-Specific)
| Category | Topics |
|----------|--------|
| Equipment Safety | Excavator safety zones, Vibratory equipment hazards, Equipment entry/exit, Blind spots |
| Material Handling | Stone loading/unloading, Bucket operations, Dust control |
| Silica Exposure | Silica hazards, Wet methods, Respiratory protection, Medical surveillance |
| Noise & Vibration | Hearing conservation, Vibration exposure limits, Rest breaks |
| Heat Illness | Heat stress recognition, Hydration, Rest/shade, Emergency response |
| Excavation Safety | Trench/excavation hazards, Spoils placement, Cave-in protection |
| Fall Protection | Working near openings, Proper harness use, Anchor points |
| Electrical Safety | Overhead power lines, Minimum clearances, GFCI use |
| Emergency Response | Emergency action plan, First aid, Hospital location, Fire procedures |
| General | Housekeeping, Communication signals, New hazard awareness, Incident review |

### 2.4 Incident / Near-Miss Reporting

| Field | Type | Required |
|-------|------|----------|
| Report Type | Dropdown | Incident, Near Miss, Property Damage |
| Date/Time | DateTime | Yes |
| Location | Text | Yes |
| Description | Text (detailed) | Yes |
| Persons Involved | Text list | Yes |
| Injury Type | Dropdown | None, First Aid, Medical Treatment, Lost Time, Fatality |
| Body Part | Multi-select | If injury: Head, Eyes, Ears, Back, Hands, Feet, Other |
| Root Cause | Text | Yes |
| Corrective Action | Text | Yes |
| Photos | File upload | Recommended |
| Supervisor Notified | Yes/No + Name | Yes |
| OSHA Recordable | Yes/No | Yes |

### 2.5 Compliance Dashboard

#### Summary View
| Metric | Calculation | Target |
|--------|------------|--------|
| Pre-Shift Completion Rate | Checklists completed / work days | 100% |
| Equipment Inspection Rate | Inspections / equipment-days | 100% |
| Toolbox Talk Completion | Talks / work days | 100% |
| Days Since Last Incident | Current date - last incident | Maximize |
| Open Corrective Actions | Count of unresolved items | 0 |
| Failed Inspection Items | Count of current failures | 0 |

#### Drill-Down Views
- By project: safety record for each active project
- By topic: which toolbox talk topics have been covered
- By date range: compliance trends over time
- Incident log: all incidents and near-misses with status

## 3. Non-Functional Requirements

| Requirement | Specification |
|-------------|--------------|
| Form Completion | Pre-shift checklist < 5 minutes |
| Mobile UI | Touch-optimized; completable with gloves (large targets) |
| Offline | Full functionality without internet |
| Browser Support | Chrome, Edge, Safari (latest 2 versions) |
| Data Storage | Local with sync; retained for 5 years (OSHA requirement) |
| Export | PDF checklists, incident reports; CSV summary data |

## 4. Data Flow

```
Pre-Shift: Field crew completes checklist (mobile)
    |
    +--- All Pass --> Proceed to work
    |
    +--- Any Fail --> Document corrective action --> Resolve --> Proceed
    |
    v
Daily: Toolbox talk conducted and logged
    |
    v
Daily: Equipment inspections completed
    |
    v
All data syncs to PF Platform
    |
    +--- Compliance Dashboard updated
    |
    +--- Daily Log safety section cross-referenced
    |
    +--- Incident reports --> Corrective action tracking
    |
    +--- Closeout package --> Safety documentation for project file
```

## 5. Integration Points

| System | Integration | Priority |
|--------|------------|----------|
| PF Platform | Embedded module | Required |
| Daily Logs | Cross-reference safety section | Required |
| Equipment Tracker | Jack calibration status | Required |
| Punch List & Closeout | Safety docs for closeout package | Phase 2 |
| Project Status Tracking | Safety metrics on project dashboard | Phase 2 |

## 6. Open Questions (For Brad)

1. What PPE is currently required for all VSC operations?
2. Does PF have existing safety checklists (even informal ones)?
3. Has PF conducted a Job Hazard Analysis (JHA) for VSC installation?
4. What is PF's experience with silica exposure compliance?
5. Are there GC-specific safety requirements that vary significantly between projects?
6. Does PF carry workers' comp insurance that requires specific safety documentation?
7. What OSHA record-keeping does PF currently maintain (300 log, etc.)?
