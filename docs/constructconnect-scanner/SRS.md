# Software Requirements Specification: Lead Generation & RFP/Bid Scanning Tool

**Project:** Pier Foundations -- ConstructConnect Scanner & Bid Opportunity Alerts
**Version:** 1.2
**Date:** May 31, 2026
**Prepared by:** Peter (AI COO)

---

## Implementation Status: Alpha v1.0 -- Built and deployed May 30, 2026

## 1. Overview

A scanning and alerting service integrated into the PF Platform that monitors ConstructConnect, state DOT bid portals, and other bid boards for ground improvement opportunities within PF's service area. Produces scored alerts and feeds qualified leads into the Pipeline Management tool.

## 2. Functional Requirements

### 2.1 Data Sources

| Source | Type | Coverage | Priority |
|--------|------|----------|----------|
| ConstructConnect | Commercial bid board | National (filtered to service area) | Required |
| INDOT | State DOT portal | Indiana | Required |
| ODOT | State DOT portal | Ohio | Required |
| MDOT | State DOT portal | Michigan | Phase 2 |
| IDOT | State DOT portal | Illinois | Phase 2 |
| KYTC | State DOT portal | Kentucky | Phase 2 |
| WisDOT | State DOT portal | Wisconsin | Phase 2 |

### 2.2 Scanning Configuration

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| Keywords (Primary) | Multi-select + Custom | aggregate pier, vibro stone column, ground improvement, soil stabilization, stone column, rammed aggregate pier | Must match at least one |
| Keywords (Secondary) | Multi-select + Custom | deep foundations, soil improvement, vibro replacement, bearing capacity, soft soil, weak soil | Boost relevance score if matched |
| Service Area | Multi-select states | IN, OH, MI, IL, KY, WI | Filter by project state |
| Max Distance (miles) | Number | 500 | From 14308 Figel Rd, Monroeville, IN 46773 |
| Project Types (Include) | Multi-select | Commercial, Industrial, Data Center, Warehouse, Wind Energy, Infrastructure, Institutional | Filter by type |
| Project Types (Exclude) | Multi-select | Residential (single-family), Utility (underground only) | Remove from results |
| Min Project Value | Currency | $50,000 | _Confirm with Brad_ |
| Scan Frequency | Dropdown | Daily (6 AM ET) | How often to check sources |

### 2.3 Relevance Scoring

Each opportunity is scored 0-100 based on weighted criteria:

#### Scoring Criteria

| Criterion | Weight | Scoring Logic |
|-----------|--------|---------------|
| Keyword Match Quality | 25% | Primary keyword in specs = 100; Primary in title = 100; Secondary only = 50; Inferred from soil description = 30 |
| Distance from Yard | 20% | 0-100 mi = 100; 100-200 = 80; 200-300 = 60; 300-500 = 40; 500+ = 10 |
| Project Value | 15% | >$200K = 100; $100-200K = 80; $50-100K = 60; <$50K = 30 |
| Project Type Fit | 15% | Commercial/Industrial/Data Center = 100; Infrastructure = 80; Warehouse = 90; Wind Energy = 70; Other = 50 |
| Bid Timeline | 10% | 3+ weeks out = 100; 2-3 weeks = 80; 1-2 weeks = 50; <1 week = 20 (tight for Dr. Ed prelim) |
| GC Relationship | 10% | Known GC = 100; Referred = 80; Unknown = 40 |
| Specification Detail | 5% | Geotech mentioned = 100; Soil data included = 80; No soil info = 30 |

#### Relevance Tiers

| Score Range | Tier | Action |
|-------------|------|--------|
| 80-100 | **Hot Lead** | Immediate alert to Derek + Jonathan |
| 60-79 | **Warm Lead** | Include in daily digest |
| 40-59 | **Cool Lead** | Available in dashboard, no alert |
| 0-39 | **Archive** | Stored but not displayed by default |

### 2.4 Alert Dashboard

#### List View Fields
| Field | Source | Sortable |
|-------|--------|----------|
| Relevance Score | Calculated | Yes |
| Project Name | Scanned data | Yes |
| Location (City, State) | Scanned data | Yes |
| Distance from Yard | Calculated | Yes |
| Estimated Value | Scanned data | Yes |
| Bid Due Date | Scanned data | Yes |
| Source | ConstructConnect / DOT | Yes |
| GC Name | Scanned data (if available) | Yes |
| Keywords Matched | Calculated | No |
| Status | User-set: New / Reviewing / Passed / Sent to Feasibility | Yes |

#### Filters
- By relevance tier (Hot / Warm / Cool / All)
- By state
- By project type
- By date range (bid due date)
- By status

#### Actions
- "Send to Feasibility" -- creates a new Feasibility Tool assessment pre-populated with available data
- "Send to Pipeline" -- creates a Pipeline Management entry at Lead stage
- "Mark as Passed" -- archives with reason (too far, too small, wrong scope, etc.)
- "Add Note" -- free text for Derek's observations

### 2.5 Alert Notifications

#### Daily Digest Email
- Sent at configurable time (default 7 AM ET)
- Contains: count of new opportunities by tier, top 5 Hot Leads with details
- Link to full dashboard

#### Instant Alerts
- Triggered for Hot Leads (score 80+) only
- Email to Derek and Jonathan
- Contains: project name, location, value, bid due date, keywords matched, relevance score

### 2.6 GC Recognition

Maintain a list of known GCs with relationship status:
- **Existing** -- PF has completed work for this GC
- **Active** -- PF is currently bidding or working with this GC
- **Known** -- Derek has a relationship but no completed work
- **New** -- No prior interaction

When a scanned opportunity includes a GC name matching this list, boost relevance score and tag accordingly.

## 3. Non-Functional Requirements

| Requirement | Specification |
|-------------|--------------|
| Scan Reliability | 99% uptime for daily scans; retry on failure |
| Scan Latency | Complete scan of all sources within 15 minutes |
| Data Retention | Store all scanned opportunities for 12 months |
| Browser Support | Chrome, Edge, Safari (latest 2 versions) |
| Mobile | Responsive -- Derek needs to review on phone between site visits |
| API Rate Limits | Respect source API rate limits; implement backoff |

## 4. Data Flow

```
ConstructConnect / DOT Portals
    |
    v
Scanner Service (daily scan)
    |
    v
Keyword + Geographic Filter
    |
    v
Relevance Scoring Engine
    |
    +--- Hot Lead (80+) -------> Instant Alert Email
    |                             + Dashboard entry
    |
    +--- Warm Lead (60-79) -----> Daily Digest
    |                             + Dashboard entry
    |
    +--- Cool Lead (40-59) -----> Dashboard entry only
    |
    +--- Archive (<40) ---------> Stored, hidden by default
    |
    v
Derek Reviews Dashboard
    |
    +--- "Send to Feasibility" --> Feasibility Tool (pre-populated)
    |
    +--- "Send to Pipeline" -----> Pipeline Management (Lead stage)
    |
    +--- "Mark as Passed" -------> Archive with reason
```

## 5. Integration Points

| System | Integration | Priority |
|--------|------------|----------|
| PF Platform | Embedded module in unified portal | Required |
| Feasibility Tool | Pre-populate assessment from scanned data | Required |
| Pipeline Management | Create Lead entry from qualified opportunity | Required |
| GC Contact Database | Match GC names for relationship scoring | Phase 2 |
| Email System | Send digest and instant alert emails | Required |

## 6. Open Questions (For Brad/Derek)

1. Does PF have a ConstructConnect subscription? What plan level?
2. Are there specific DOT project categories that never require ground improvement (bridge only, resurfacing, etc.) that we should exclude?
3. Should the tool flag projects where ground improvement is not specified but could be value-engineered based on soil conditions or project type?
4. What GCs does PF currently have existing relationships with? (Needed for GC recognition list)
5. Who should receive instant alerts -- just Derek, or Derek + Jonathan?
6. Is there a maximum distance beyond which PF would never travel, even for a large project?
7. Should wind energy projects be treated differently (often remote locations, large volumes)?
