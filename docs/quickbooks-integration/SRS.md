# Software Requirements Specification: QuickBooks API Integration (Research & Specification)

**Project:** Pier Foundations -- QuickBooks Financial Integration
**Version:** 1.2
**Date:** May 31, 2026
**Prepared by:** Peter (AI COO)

---

## Implementation Status: Alpha v1.0 -- Built and deployed May 30, 2026

## 1. Overview

A research and specification document for connecting the PF Platform to QuickBooks for financial reporting, job costing, and cash flow visibility. Defines the target data flows, API requirements, and integration architecture. The build phase is contingent on Brad's approval and QuickBooks access.

## 2. Functional Requirements (Target -- Build Phase)

### 2.1 Data Flows

#### PF Platform --> QuickBooks (Write)
| Data | Trigger | QB Entity |
|------|---------|-----------|
| New project setup | Pipeline moves to Won | Job/Customer:Job |
| Invoice request | Project milestone or completion | Invoice |
| Change order billing | CO approved by GC | Invoice line item |

#### QuickBooks --> PF Platform (Read)
| Data | Frequency | PF Destination |
|------|-----------|----------------|
| Vendor bills by job | Daily sync | Project Status Tracking (actual costs) |
| Customer payments received | Daily sync | Project Status Tracking (AR status) |
| Job cost summary | Daily sync | Budget vs. actual dashboard |
| Outstanding AP | Daily sync | Cash flow dashboard |
| Outstanding AR | Daily sync | Cash flow dashboard |
| Payroll by job | Weekly sync | Labor cost tracking |

### 2.2 Job Costing View

| Field | Source | Display |
|-------|--------|---------|
| Project Name | PF Platform | Header |
| Contract Value | PF Platform (estimate + COs) | Currency |
| Billed to Date | QB (invoices) | Currency |
| Received to Date | QB (payments) | Currency |
| Outstanding AR | QB (invoices - payments) | Currency |
| Total Costs | QB (bills + payroll + expenses) | Currency |
| Cost Breakdown | QB by account/class | Table |
| Gross Margin | Contract Value - Total Costs | Currency + % |
| Budget vs. Actual | PF turnover budget vs. QB actuals | Comparison table |

#### Budget vs. Actual Mapping
| PF Budget Line | QB Account/Class | Comparison |
|----------------|-----------------|-----------|
| Engineering (GGG) | Professional Services / Engineering | Amount |
| Stone (material) | Materials / Stone | Amount |
| Stone (delivery) | Materials / Delivery | Amount |
| Transport (mob/demob) | Transportation | Amount |
| Equipment Rental | Equipment Rental | Amount |
| Labor | Direct Labor / Payroll | Amount |
| Layout (MLS) | Subcontractor / Survey | Amount |
| Travel | Travel & Mileage | Amount |
| Contingency | Contingency (if tracked) | Amount |

### 2.3 AR Dashboard

| Metric | Calculation | Display |
|--------|------------|---------|
| Total Invoiced | Sum of all project invoices | Currency |
| Total Received | Sum of all payments | Currency |
| Outstanding AR | Invoiced - Received | Currency |
| Aging: Current | Invoices <30 days old | Currency |
| Aging: 30-60 | Invoices 30-60 days old | Currency |
| Aging: 60-90 | Invoices 60-90 days old | Currency |
| Aging: 90+ | Invoices >90 days old | Currency (RED) |
| Average Days to Pay | Mean payment cycle across projects | Number |
| By GC | AR broken down by general contractor | Table |

Note: PF industry average is 83-day payment cycles. This makes AR visibility critical.

### 2.4 AP Dashboard

| Metric | Calculation | Display |
|--------|------------|---------|
| Total AP Outstanding | Sum of unpaid vendor bills | Currency |
| Aging by Category | Material, Transport, Rental, Sub, Other | Table |
| Due This Week | Bills due within 7 days | Currency + list |
| Overdue | Past-due bills | Currency (RED) |
| By Vendor | AP by vendor name | Table |

### 2.5 Cash Flow View

| Period | Data |
|--------|------|
| Current Month | Expected AR receipts - Expected AP payments |
| Next 30 Days | Projected cash position |
| Next 60 Days | Projected cash position |
| Next 90 Days | Projected cash position |

Inputs:
- AR aging (expected receipt dates based on GC payment patterns)
- AP due dates
- Committed costs on active projects (from turnover budgets)
- Expected revenue from awarded but not yet billed projects

### 2.6 Invoice Generation

| Feature | Description |
|---------|-------------|
| Progress Invoicing | Generate invoice based on % complete or milestone |
| Final Invoice | Generate from closeout process |
| CO Invoicing | Invoice approved change orders |
| Auto-Populate | Pull project data, contract value, completion % from PF Platform |
| QB Sync | Push generated invoice to QuickBooks |
| Format | Match PF's existing invoice format |

## 3. Integration Architecture Options

### Option A: QuickBooks Online API
| Aspect | Detail |
|--------|--------|
| Availability | Full REST API (api.intuit.com) |
| Auth | OAuth 2.0 |
| Rate Limits | 500 requests per minute |
| Cost | Free with QB Online subscription |
| Entities | Customer, Invoice, Bill, Payment, Vendor, Item, Account |
| Real-Time | Webhooks available for change notifications |
| Recommendation | **Preferred if PF uses QB Online** |

### Option B: QuickBooks Desktop SDK
| Aspect | Detail |
|--------|--------|
| Availability | QBXML via Web Connector |
| Auth | Application certificate |
| Limitations | Requires QB Desktop running on a specific machine |
| Real-Time | Polling only (no webhooks) |
| Cost | Free SDK |
| Recommendation | Functional but limited; consider migration to Online |

### Option C: Third-Party Connector
| Aspect | Detail |
|--------|--------|
| Options | Zapier, Make.com, SaasAnt, Transaction Pro |
| Cost | $20-100/month |
| Limitation | Less control, potential data latency |
| Recommendation | Quick start option if API development is delayed |

## 4. Security Requirements

| Requirement | Specification |
|-------------|--------------|
| Authentication | OAuth 2.0 (QB Online) or App Certificate (Desktop) |
| Authorization | Brad must explicitly approve access scope |
| Data Scope | Read-only initially; write access for invoicing (Phase 2) |
| Data in Transit | HTTPS/TLS 1.2+ required |
| Data at Rest | Financial data encrypted in PF Platform database |
| Access Control | Brad-only access to financial dashboards initially |
| Audit Trail | Log all data access and sync operations |
| Token Storage | OAuth tokens stored securely, auto-refresh |

## 5. Non-Functional Requirements

| Requirement | Specification |
|-------------|--------------|
| Sync Frequency | Daily minimum; hourly preferred |
| Sync Window | 5 AM ET (before business hours) |
| Error Handling | Retry failed syncs 3x; alert on persistent failure |
| Data Freshness | Dashboard shows last sync timestamp |
| Browser Support | Chrome, Edge, Safari (latest 2 versions) |
| Mobile | Responsive -- Brad checks financials on phone |

## 6. Data Flow

```
QuickBooks
    |
    v
API Sync Service (daily)
    |
    +--- Vendor Bills (by job) --> Project cost actuals
    |
    +--- Customer Payments --> AR tracking
    |
    +--- Job Reports --> Margin analysis
    |
    v
PF Platform
    |
    +--- Project Status Tracking (budget vs. actual)
    |
    +--- Financial Dashboard (AR, AP, cash flow)
    |
    +--- Job Costing View (margin by project)
    |
    v
Invoice Generation (Phase 2)
    |
    v
Push to QuickBooks
```

## 7. Integration Points

| System | Integration | Priority |
|--------|------------|----------|
| PF Platform | Core module | Required |
| Project Status Tracking | Actual cost data for budget comparison | Required |
| Pipeline Management | Contract value at award | Required |
| Change Order Management | CO values for adjusted budgets | Phase 2 |
| Punch List & Closeout | Final invoice trigger | Phase 2 |

## 8. Open Questions (For Brad -- Critical)

1. **Which QuickBooks version -- Desktop or Online?** (Determines entire approach)
2. **Is Brad willing to grant API/read access?** (Must have explicit approval)
3. How are jobs structured in QB -- by project name, number, or customer:job?
4. What chart of accounts categories does PF use for cost tracking?
5. How are vendor bills coded to specific projects?
6. Does PF use QB classes for cost type tracking?
7. How are progress invoices currently generated -- from QB or manually?
8. Who has admin access to QuickBooks?
9. Is PF open to migrating from Desktop to Online if needed for integration?
10. What financial reports does Brad pull most frequently from QB?
