# HR Module — How It Works Now (Training / Manual)

**Audience:** Brad, Derek, and anyone assigned the `hr` role.
**Updated:** 2026-07-24

---

## What changed
The HR module used to show made-up demo employees. It now shows the **real Pier
Foundations directory** for the Employee Records and directory views.

## Who can see it
Only two roles can open the HR module: **admin** and a dedicated **hr** role.
Partners (Jonathan, Derek as partner) do NOT automatically see HR — access to HR is
granted explicitly by assigning the `hr` role. Everyone else (business_dev, field
crew) is blocked. If a blocked user types the HR URL directly, they are denied.

## What is REAL vs what is still DEMO / TBD

**REAL (live directory data):**
- The **Employee Records** tab lists the 5 real employees with these fields only:
  name, title, department, location, start date, status, work email, work phone.
- Clicking an employee opens their directory card (same safe fields).

**TBD (awaiting your confirmation):**
Some values were not available from a safe source, so they show `TBD — confirm with
Brad/Derek`. Please confirm these and we will fill them in:
- All **start dates**
- All **work phone** numbers
- **Kendall Mavity** work email
- **Chase Kinsey** — title, department, location, work email

**Still DEMO / placeholder (Phase-2 tabs, not yet wired to real data):**
- Onboarding, Policies, Time Off, Performance, Org Chart, Compliance, Training Studio.
  These still show sample content. The Org Chart in particular groups by demo
  department names, so it may not line up with the real departments yet. A banner on
  the Employee Records tab tells you when you are looking at live data.

## The hard rule on sensitive data (why some things are NOT here)
The HR module is a **directory and org view ONLY**. By design it will **never** show:
- compensation, bonus, salary, wages, or pay rates
- tax forms (W-4, WH-4, 941)
- SSN
- benefits
- payment schedules or W9s

Those documents stay in **SharePoint** under their existing permissions and are never
pulled into the portal. The `/api/hr` service that feeds the module physically cannot
return those fields — it only ever returns the 8 safe directory fields, and anything
else is dropped before it leaves the server.

Multi-state payroll (the crew are Wisconsin residents working in IN/OH/MI) is a CPA
question and is intentionally out of the portal's scope.

## How to add or correct an employee
Today the roster is curated (edited by the team on request). To change a title, add a
work phone, confirm a start date, etc., tell Peter and it will be updated in the
register and redeployed. A self-service "Add Employee" form is a future enhancement.
