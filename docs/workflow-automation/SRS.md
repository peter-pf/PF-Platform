# Software Requirements Specification: Workflow Automation

**Project:** Pier Foundations -- Workflow Automation & Tool Integration
**Version:** 1.2
**Date:** May 31, 2026
**Prepared by:** Peter (AI COO)

---

## Implementation Status: Alpha v1.0 -- Built and deployed May 30, 2026

## 1. Overview

The workflow automation layer connects all 16 PF Platform tools into a seamless business process. It defines automated triggers, data transfers, and state transitions that eliminate manual handoffs while preserving human control at decision points.

## 2. Functional Requirements

### 2.1 Event System

#### Event Types
| Event Category | Examples |
|---------------|---------|
| Stage Transition | Pipeline stage changes (Lead > Qualifying > Bidding, etc.) |
| Document Ready | Estimate approved, proposal generated, closeout complete |
| Alert Trigger | Threshold exceeded, deadline approaching, anomaly detected |
| Data Update | Daily log submitted, quote received, cost entered |
| User Action | Manual override, approval, rejection |

#### Event Structure
| Field | Type | Description |
|-------|------|-------------|
| Event ID | UUID | Unique identifier |
| Event Type | Enum | Category from above |
| Source Tool | Text | Which tool generated the event |
| Target Tool(s) | Text list | Which tool(s) should respond |
| Project ID | Reference | Which project this relates to |
| Payload | JSON | Event-specific data |
| Timestamp | DateTime | When event occurred |
| User | Text | Who triggered (human or "system") |
| Status | Enum | Pending, Processed, Failed, Overridden |

### 2.2 Automation Rules

Each rule defines: WHEN [trigger] THEN [action] IF [condition].

#### Phase 1: Lead to Bid

| # | Trigger | Action | Condition | Manual Override |
|---|---------|--------|-----------|----------------|
| A1 | Scanner finds Hot Lead (80+) | Create Pipeline entry at Lead stage | Score >= 80 | Derek can dismiss |
| A2 | Scanner finds Warm Lead (60-79) | Add to daily digest | Score 60-79 | Derek can promote or dismiss |
| A3 | Derek clicks "Qualify" | Open Feasibility Tool pre-populated | Pipeline at Lead | Can skip feasibility |
| A4 | Feasibility score >= 75 (BID) | Move Pipeline to Bidding | Auto-calculated | Brad can override to NO-BID |
| A5 | Feasibility score < 50 (NO-BID) | Move Pipeline to Lost | Auto-calculated | Brad can override to BID |
| A6 | Feasibility score 50-74 (REVIEW) | Notify Brad for decision | Auto-calculated | Brad decides BID or NO-BID |
| A7 | Pipeline moves to Bidding | Create Bid Estimate workflow | Stage = Bidding | Jonathan can delay |

#### Phase 2: Bid to Award

| # | Trigger | Action | Condition | Manual Override |
|---|---------|--------|-----------|----------------|
| B1 | Estimate workflow created | Pre-populate from Pipeline data | Always | N/A |
| B2 | Stone quote needed | Open Material Cost Estimator with project data | Estimate step 16 | Jonathan can source manually |
| B3 | Transport quote needed | Pre-fill email templates for Paddacks + Stephan | Estimate step 16 | Jonathan can use other vendors |
| B4 | Layout quote needed | Pre-fill email template for MLS | Estimate step 16 | Jonathan can use other vendors |
| B5 | All quotes received + budget complete | Notify Brad for estimate review | All vendor items filled | Jonathan can submit early |
| B6 | Estimate approved by Brad | Enable Proposal Generator | Approval recorded | Can re-review |
| B7 | Proposal generated + approved | Move Pipeline to Submitted | Proposal PDF created | Can hold submission |
| B8 | GC awards project | Move Pipeline to Won | User marks awarded | Can correct if premature |
| B9 | GC rejects bid | Move Pipeline to Lost | User marks lost | Can reopen if GC reconsiders |

#### Phase 3: Award to Mobilization

| # | Trigger | Action | Condition | Manual Override |
|---|---------|--------|-----------|----------------|
| C1 | Pipeline moves to Won | Create Pre-Mob Checklist | Stage = Won | N/A |
| C2 | Pipeline moves to Won | Create Project Status dashboard | Stage = Won | N/A |
| C3 | Pipeline moves to Won | Create turnover budget from estimate | Stage = Won | Jonathan adjusts |
| C4 | Pipeline moves to Won | Assign equipment in Equipment Tracker | Stage = Won | Jonathan assigns |
| C5 | Pipeline moves to Won | Request 811 locate | Pre-mob checklist | Jonathan initiates |
| C6 | Pipeline moves to Won | Schedule transport + layout with subs | Pre-mob checklist | Jonathan schedules |
| C7 | All pre-mob items complete | Notify Brad: ready to mobilize | All items green | Brad confirms |
| C8 | Brad confirms mobilization | Move Pipeline to Active | Brad approval | Can delay |

#### Phase 4: Execution

| # | Trigger | Action | Condition | Manual Override |
|---|---------|--------|-----------|----------------|
| D1 | Daily log submitted | Update Project Status production data | Log synced | Manual correction possible |
| D2 | Daily log submitted | Update Equipment Tracker hours | Equipment hours entered | Manual correction possible |
| D3 | Daily log flags CO potential | Create draft Change Order | CO flag = Yes | Jonathan reviews first |
| D4 | Production rate < 800 LF/day (3-day avg) | Alert Jonathan | Sustained underperformance | Can dismiss |
| D5 | No daily log for work day | Alert Jonathan next morning | Missing log detected | Can excuse (weather, etc.) |
| D6 | 811 locate expiring in 5 days | Alert Jonathan to re-request | Validity tracking | Can dismiss if demob imminent |
| D7 | Stone inventory < 1 day supply | Alert Jonathan to reorder | From daily log estimate | Can dismiss |
| D8 | Equipment maintenance due | Alert Jonathan | Hours threshold from tracker | Can defer with note |
| D9 | CO approved by GC | Update project budget | CO status = GC Approved | Manual budget adjustment |

#### Phase 5: Closeout

| # | Trigger | Action | Condition | Manual Override |
|---|---------|--------|-----------|----------------|
| E1 | Last column installed | Activate Closeout Checklist | All columns in daily log match design count | Jonathan initiates |
| E2 | Closeout activated | Auto-collect GUHMA report, logs, safety docs | Connected tools have data | Manual upload for missing |
| E3 | Closeout activated | Generate lien waiver templates | Always | N/A |
| E4 | Closeout activated | Generate warranty letter template | Always | N/A |
| E5 | All closeout items Ready | Notify Jonathan: ready to send to GC | All items green or N/A | Can hold |
| E6 | GC accepts closeout | Move Pipeline to Complete | GC acceptance recorded | Can reopen if issues |
| E7 | Pipeline moves to Complete | Calculate final project metrics | Stage = Complete | N/A |
| E8 | Pipeline moves to Complete | Trigger final invoice (QB integration) | QB connected | Manual invoice if not |

### 2.3 Data Transfer Specifications

#### Key Data Flows Between Tools
| From | To | Data | Trigger |
|------|-----|------|---------|
| Scanner | Pipeline | Project name, GC, location, value, score | Hot/Warm lead found |
| Pipeline | Feasibility | Project info for pre-population | Qualify clicked |
| Feasibility | Pipeline | Score, recommendation | Assessment complete |
| Pipeline | Bid Estimate | Project info, feasibility data | Moves to Bidding |
| Material Cost Estimator | Bid Estimate | Best delivered stone price | Quote selected |
| Subcontractor Coord | Bid Estimate | Transport, layout quotes | Quote received |
| Bid Estimate | Proposal | All estimate data | Estimate approved |
| Bid Estimate | Project Status | Turnover budget (at award) | Pipeline moves to Won |
| Daily Logs | Project Status | LF, columns, stone, crew | Log submitted |
| Daily Logs | Equipment Tracker | Equipment hours | Log submitted |
| Daily Logs | GUHMA Integration | Column IDs for cross-ref | Log submitted |
| Change Orders | Project Status | Budget adjustments | CO approved |
| GUHMA Integration | Closeout | Column report | Closeout activated |
| All tools | Closeout | Respective documents | Closeout activated |
| Project Status | QB Integration | Project financial summary | Daily sync |

### 2.4 Automation Dashboard

#### Monitoring View
| Column | Description |
|--------|-------------|
| Automation Rule | Which rule fired |
| Timestamp | When it fired |
| Project | Which project |
| Status | Success, Failed, Overridden |
| Details | Action taken or error message |

#### Filters
- By tool (source or target)
- By project
- By status (failures only, overrides only)
- By date range

#### Health Metrics
| Metric | Target |
|--------|--------|
| Automation success rate | > 99% |
| Average processing time | < 5 seconds |
| Failed automations (24h) | 0 |
| Manual overrides (7d) | Tracked for pattern analysis |

### 2.5 Manual Override Protocol

Every automation must support:
1. **Pre-override:** User can disable a specific rule for a specific project
2. **Override:** User can reverse an automated action after it occurs
3. **Audit:** All overrides are logged with user, reason, and timestamp
4. **No cascading:** Overriding one rule does not prevent downstream rules from being evaluated independently

### 2.6 Error Handling

| Error Type | Response |
|-----------|----------|
| Target tool unavailable | Queue event; retry 3x at 1-min intervals; alert on persistent failure |
| Data validation failure | Log error; skip action; notify tool owner |
| Circular trigger | Circuit breaker: max 3 events per rule per project per minute |
| Missing required data | Skip automation; log warning; notify user |

## 3. Non-Functional Requirements

| Requirement | Specification |
|-------------|--------------|
| Event Processing | < 5 seconds from trigger to action |
| Queue Reliability | No events lost (persistent queue) |
| Scalability | Support 100+ concurrent projects (future growth) |
| Browser Support | Chrome, Edge, Safari (latest 2 versions) |
| Logging | 90-day event log retention |
| Uptime | 99.9% for event bus |

## 4. Implementation Phases

| Phase | Scope | Tools Connected | Priority |
|-------|-------|----------------|----------|
| Phase 1 | Lead to Bid | Scanner, Pipeline, Feasibility, Estimate, Material Cost, Subcontractor | Required |
| Phase 2 | Bid to Award | Proposal, Pipeline | Required |
| Phase 3 | Award to Mobilization | Pipeline, Equipment, Permitting, Project Status, Subcontractor | Required |
| Phase 4 | Execution | Daily Logs, Project Status, Equipment, Safety, Change Orders, GUHMA | Required |
| Phase 5 | Closeout | Closeout, Pipeline, GUHMA, Daily Logs, Safety, Change Orders | Required |
| Phase 6 | Financial | QuickBooks, Project Status, Pipeline | Phase 3 |

## 5. Integration Points

This tool IS the integration layer. It connects:
- All 15 other PF Platform tools (see Data Transfer Specifications above)
- External systems through their respective tools (ConstructConnect via Scanner, QuickBooks via QB Integration)

## 6. Open Questions (For Brad)

1. Are there any workflow transitions that should NEVER be automated (always require human click)?
2. Should the event bus be visible to all team members, or Brad-only?
3. Are there emergency workflows (rush projects) that skip standard stages?
4. How should the system handle projects that revert to a previous stage (re-bid, etc.)?
5. Should automation rules be configurable by Brad, or only by Peter?
6. What is the acceptable delay for automated actions (instant, within 1 minute, within 1 hour)?
