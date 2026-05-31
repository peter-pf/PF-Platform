# Statement of Work: Workflow Automation (System Integration Document)

**Project:** Pier Foundations -- Workflow Automation & Tool Integration
**Version:** 1.2
**Date:** May 31, 2026
**Prepared by:** Peter (AI COO)
**Approved by:** _Pending Brad/Jonathan review_
**Implementation Status:** v1.0 BUILT -- deployed to pf-platform.pages.dev/platform/

---

## 1. Purpose

The PF Platform consists of 16 interconnected tools, each handling a specific part of PF's business process. Without automated connections between these tools, data must be manually transferred, status updates must be manually propagated, and workflow transitions require human intervention at every step.

This is the GLUE document -- it defines how all 16 tools connect together to form a seamless workflow from lead discovery through project closeout. It specifies the automated triggers, data transfers, and workflow transitions that eliminate manual handoffs.

## 2. Scope

### In Scope
- Definition of all automated triggers between tools
- Data flow specifications for inter-tool communication
- Workflow state machine (what triggers what)
- Event bus architecture for tool-to-tool messaging
- Manual override capabilities at every automation point
- Automation health monitoring and error handling

### Out of Scope
- Individual tool functionality (documented in each tool's SOW/SRS)
- External system integrations (ConstructConnect API, QuickBooks API -- documented separately)
- AI/ML automation (predictive analytics, auto-recommendations -- future phase)
- Business process reengineering (we automate PF's existing SOPs, not redesign them)

## 3. Stakeholders

| Role | Name | Involvement |
|------|------|-------------|
| Decision Maker | Brad Reinking | Approves automation rules |
| End User | Jonathan Reinking | Primary beneficiary of workflow automation |
| End User | Derek Franke | Benefits from lead-to-bid automation |
| Builder | Peter (AI COO) | Designs, builds, and maintains the automation layer |

## 4. Deliverables

| # | Deliverable | Format | Description |
|---|-------------|--------|-------------|
| 1 | Workflow State Machine | Diagram + spec | Complete state transitions across all tools |
| 2 | Event Bus | Backend service | Message passing between tools |
| 3 | Automation Rules Engine | Configuration | Trigger-action pairs with conditions |
| 4 | Automation Dashboard | HTML | Monitor active automations and their status |
| 5 | Override Controls | UI per tool | Manual override at every automation point |
| 6 | SRS Document | .md file | Full requirements specification |

## 5. Success Criteria

- Every SOP step that can be automated IS automated
- Manual handoffs between tools are eliminated where possible
- Any automation can be overridden manually without breaking the workflow
- Automation failures are visible and recoverable (no silent failures)
- Team spends less time on administrative transfers and more time on value-add work

## 6. Timeline

| Milestone | Duration (AI time) |
|-----------|-------------------|
| SOW + SRS (this document) | 30 min |
| Event bus architecture | 30 min |
| Build Phase 1 automations (lead to bid) | 45 min |
| Build Phase 2 automations (bid to award) | 45 min |
| Build Phase 3 automations (execution to closeout) | 45 min |
| Review with Brad | _Human dependent_ |
| Deploy incrementally | Per phase |

## 7. The Master Workflow

The complete PF business lifecycle, showing which tools connect at each stage:

```
LEAD GENERATION
ConstructConnect Scanner finds opportunity
    |
    v
Scanner creates Lead in Pipeline Management
    |
    v
Derek reviews; clicks "Qualify"
    |
    v
FEASIBILITY ASSESSMENT
Feasibility Tool opens (pre-populated from Scanner data)
    |
    +--- BID (75+) --> Pipeline moves to Bidding
    +--- NO-BID (<50) --> Pipeline moves to Lost
    +--- REVIEW (50-74) --> Pipeline flagged for Brad
    |
    v
ESTIMATING
Bid Estimate Generator workflow starts
    |
    +--- Material Cost Estimator finds stone suppliers + generates quote emails
    +--- Subcontractor Coordination provides transport/layout contacts
    +--- Quote requests sent; responses tracked
    +--- Dr. Ed prelim request tracked
    +--- Takeoffs entered from Kreo
    +--- Prelim data imported; budget calculated
    |
    v
Estimate reviewed with Brad
    |
    v
PROPOSAL
Proposal Generator creates PF bid document from approved estimate
    |
    v
Proposal sent to GC --> Pipeline moves to Submitted
    |
    v
AWARD (or Loss)
    +--- Won --> Pipeline moves to Won; Award SOP triggered
    +--- Lost --> Pipeline moves to Lost; loss reason captured
    |
    v
PROJECT SETUP (Award SOP)
    +--- Permitting & Inspections: pre-mob checklist generated
    +--- Equipment Tracker: equipment assigned
    +--- Subcontractor Coordination: transport + layout scheduled
    +--- Project Status Tracking: project dashboard created
    |
    v
Pipeline moves to Active
    |
    v
EXECUTION
Daily Logs capture field data
    |
    +--- Production data --> Project Status Tracking
    +--- Equipment hours --> Equipment Tracker
    +--- Safety data --> Safety Checklists
    +--- CO flags --> Change Order Management
    +--- Column IDs --> GUHMA cross-reference
    |
    v
Ongoing: Change Orders created, priced, submitted, tracked
Ongoing: Permitting/inspections monitored
Ongoing: 811 locate renewals triggered
    |
    v
CLOSEOUT
Punch List & Closeout checklist activated
    |
    +--- GUHMA Integration: column report pulled
    +--- Daily Logs: all logs compiled
    +--- Safety Checklists: safety docs compiled
    +--- Change Order Management: CO docs compiled
    +--- Lien waivers + warranty generated
    |
    v
Closeout package sent to GC
    |
    v
GC accepts --> Pipeline moves to Complete
    |
    v
FINANCIAL
QuickBooks Integration: final invoice, margin analysis, cash flow
    |
    v
Project archived with full documentation
```

## 8. Risks

| Risk | Mitigation |
|------|-----------|
| Automation creates rigid workflows that don't handle exceptions | Manual override at every point; exception handling paths |
| Cascading failures (one tool error propagates) | Circuit breaker pattern; isolate tool failures |
| Team doesn't trust automated transitions | Gradual rollout; show automation log; allow reversal |
| Data consistency across tools | Single source of truth per data element; sync validation |

## 9. Open Questions for Brad

1. Are there any workflow steps that should ALWAYS require human approval (no full automation)?
2. Are there exception paths not captured in the SOPs (e.g., emergency projects that skip feasibility)?
3. Should automated transitions be reversible (can a stage be moved backward)?
4. What notifications should accompany automated transitions (email, dashboard, both)?
5. Are there seasonal workflow variations (winter slowdowns, etc.)?

## 10. Implementation Notes

- **Platform:** pf-platform.pages.dev/platform/
- **Data Source:** SharePoint live sync (4 master files)
- **SharePoint Sync:** Live -- 4 master files synced
- **Stage:** Alpha -- awaiting Brad/Jonathan review
