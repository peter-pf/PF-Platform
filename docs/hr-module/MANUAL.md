# User Manual: HR Module

**Pier Foundations Platform -- Human Resources**
**Version:** 1.0 | July 8, 2026

---

## What it is

The HR module is a workspace for managing Pier Foundations people operations. It lives inside the PF Platform and opens in the main content area, just like the other tools. It was built by Meridian-PT and vetted by Peter before being wired in.

**Current state:** the module shows **demo (sample) data**. There is no live HR database connected yet, so nothing you see is real employee data and edits are not saved to a server. This is a preview of the workspace.

## Who can see it

Access is **tight on purpose**. Only two kinds of accounts can open HR:

- **Admin** (Brad)
- The dedicated **HR role**

Partners (Jonathan, Derek), business development, and field crew **cannot** open the HR module -- not from the menu and not by typing the web address directly. HR information is confidential, so the platform blocks everyone else at the server. If a blocked account tries the direct link, it is sent to the "access denied" page.

## How to open it

1. Sign in to the PF Platform with your own login.
2. In the left menu, open the **PF Admin** section.
3. Click **HR**.
4. The HR workspace loads in the main area.

## The seven tabs

| Tab | What it's for |
|-----|---------------|
| **Employee Records** | The employee directory and individual profiles |
| **Onboarding** | New-hire onboarding steps and progress |
| **Policies** | The HR policy library |
| **Time Off** | PTO and leave requests / balances |
| **Performance** | Performance reviews and tracking |
| **Org Chart** | The company's reporting structure |
| **Compliance** | HR compliance items and status |

## Frequently asked

**Can I edit real data?** Not yet. The module is in demo mode. A future phase will connect a live HR backend; when it does, editing and saving will be added and the same admin + HR access rule will apply.

**Why can't my teammate see HR?** Because their account role isn't `admin` or `hr`. That's the intended, confidential scope for HR.

**Is it a separate website?** No. It's served inside the platform at `/hr/` and uses your existing platform login -- there is no second password.

## For administrators

- The module is a single self-contained file at `platform/hr/index.html`, deployed byte-identical from the vetted source (SHA-256 verified).
- Access is enforced server-side in `functions/lib/auth.js` (`AREA_ROLES.hr = ['admin','hr']`) and `functions/_middleware.js`. The `/hr/` path is gated to the `hr` area; everyone else fails closed.
- To grant the HR role to a user, that user's `role` in the D1 `users` table must be `hr`. **Before that insert can succeed**, the D1 schema CHECK constraint in `platform/migrations/0001_init.sql` must be widened to include `hr` (and `business_dev`), which it currently does not. See the SRS "Known Gaps" section.
- To update the module later: re-vet the new source, verify SHA-256, replace `platform/hr/index.html`. Do not hand-edit the module.
