# Statement of Work: QuickBooks API Integration (Research & Specification)

**Project:** Pier Foundations -- QuickBooks Financial Integration
**Version:** 1.0
**Date:** May 29, 2026
**Prepared by:** Peter (AI COO)
**Approved by:** _Pending Brad/Jonathan review_

---

## 1. Purpose

PF's financial data lives in QuickBooks, separate from the operational data in the PF Platform. The Estimating SOP produces cost estimates, the Award SOP creates turnover budgets, and projects generate actual costs through invoices, payroll, and vendor payments. Currently there is no connection between the PF Platform's project data and QuickBooks financial data, making job costing, margin analysis, and cash flow visibility manual and time-consuming.

This is a RESEARCH AND SPECIFICATION document. Before building any integration, we need Brad's approval, QuickBooks credentials, and an understanding of PF's chart of accounts and job costing structure.

## 2. Scope

### In Scope (Research Phase)
- Determine PF's QuickBooks version (Desktop vs. Online)
- Document PF's chart of accounts and job costing structure
- Evaluate QuickBooks API capabilities (for Online) or QBXML/SDK (for Desktop)
- Specify data flows: what moves from PF Platform to QB and vice versa
- Identify security and authorization requirements
- Estimate build effort and ongoing maintenance

### In Scope (Future Build Phase -- Pending Brad's Approval)
- Job costing integration (actual costs per project)
- AR tracking (invoices, payments received)
- AP tracking (vendor bills, payments made)
- Cash flow visibility in PF Platform dashboard
- Budget vs. actual reporting by project
- Invoice generation from PF Platform data

### Out of Scope
- Replacing QuickBooks as the accounting system
- Tax preparation or filing
- Payroll processing integration
- Bank feed management
- Multi-entity accounting

## 3. Stakeholders

| Role | Name | Involvement |
|------|------|-------------|
| Decision Maker | Brad Reinking | Owns financial data; must approve access |
| End User | Brad Reinking | Reviews financial reports |
| End User | Jonathan Reinking | Job costing review |
| Builder | Peter (AI COO) | Researches, designs, and builds integration |

## 4. Deliverables

### Research Phase (Current)
| # | Deliverable | Format | Description |
|---|-------------|--------|-------------|
| 1 | QuickBooks Environment Assessment | .md file | Version, chart of accounts, job setup |
| 2 | API/Integration Options | .md file | Available integration methods |
| 3 | Data Flow Specification | .md file | What data moves where, when |
| 4 | Security Assessment | .md file | Auth, permissions, data protection |
| 5 | Build Recommendation | .md file | Recommended approach + effort estimate |

### Build Phase (Future)
| # | Deliverable | Format | Description |
|---|-------------|--------|-------------|
| 6 | QB Connector | Backend service | Sync engine between PF Platform and QB |
| 7 | Financial Dashboard | HTML | Job costing, AR/AP, cash flow views |

## 5. Success Criteria (Research Phase)

- QuickBooks version and edition confirmed
- Chart of accounts documented with job costing structure
- Integration approach selected with security review
- Brad is comfortable with the data access scope
- Build phase effort estimated with clear milestones

## 6. Timeline

| Milestone | Duration |
|-----------|---------|
| SOW + SRS (this document) | 15 min |
| QuickBooks environment assessment | _Requires Brad's access and time_ |
| API evaluation and design | 30 min (after access granted) |
| Security review | 15 min |
| Review with Brad | _Human dependent_ |
| Build Phase (if approved) | 4-8 hours AI time |

## 7. Assumptions

- PF uses QuickBooks for all accounting (AP, AR, payroll)
- Each project is set up as a job or class in QuickBooks for cost tracking
- Brad has administrator access to QuickBooks
- Financial data is sensitive and requires appropriate access controls
- PF Platform will read from QuickBooks more than write to it

## 8. Risks

| Risk | Mitigation |
|------|-----------|
| QuickBooks Desktop has limited API capability | May require QuickBooks Online migration |
| Financial data exposure concerns | Read-only access initially; strict authorization |
| Chart of accounts doesn't align with estimate line items | Map QB accounts to PF budget categories |
| QB data is inconsistent or incomplete | Data quality assessment before building integration |
| API rate limits or cost | Evaluate QB API pricing; batch sync vs. real-time |

## 9. Open Questions (Critical -- Need Before Proceeding)

1. **Which QuickBooks version does PF use -- Desktop or Online?** (This determines the entire integration approach)
2. **Is Brad comfortable granting API access to PF Platform?** (Must have explicit approval)
3. How are projects/jobs set up in QuickBooks -- by project name, project number, or both?
4. Does PF use classes or categories in QuickBooks to track cost types?
5. How are vendor bills (stone, transport, rental) coded to specific projects?
6. How is payroll allocated to projects (by job, by timesheet)?
7. Who currently generates invoices to GCs -- Brad, Jonathan, or an accountant?
8. Does PF have a bookkeeper or accountant who manages QuickBooks?
9. What financial reports does Brad currently pull from QuickBooks regularly?
