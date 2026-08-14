-- PF Platform — D1 migration 0004: set Derek Franke to role='partner'
--
-- WHY (Brad, 2026-08-14): "Derek is a partner so he should be able to see
-- everything in the portal that I and Jonathan can both see." Partner is the
-- correct role for full partner-level visibility (financials + financials_global
-- / COO checklist + estimating + preconstruction + contracts + business_dev/CRM),
-- WITHOUT admin-only user management. Partner is a strict SUPERSET of business_dev
-- on every area (proven in test-harness/derek-partner-rbac.test.mjs), so this
-- gains partner visibility while losing NO BD/CRM access.
--
-- STATE NOTE (flag to Brad): as of 2026-08-14 the LIVE D1 has BOTH Derek AND
-- Jonathan at role='admin' (the checked-in seed 0002 had them as 'partner'). This
-- migration sets Derek to 'partner' — the role that matches Brad's directive
-- ("what I and Jonathan can BOTH see" = the partner intersection, NOT admin/user
-- management). If the intent is instead to keep Derek at admin, do NOT apply this.
-- Jonathan's live role is left untouched here (out of scope for this change).
--
-- WHAT IT DOES: a single guarded UPDATE keyed on the stable email. No password
-- hash / salt / session change (role-only). updated_at is refreshed for audit.
-- Idempotent: re-running is a no-op once the role is already 'partner'.
--
-- Requires migration 0003 (widened role CHECK) already applied — 'partner' is a
-- valid role under both the old and new CHECK, so this is safe regardless.
--
-- Apply (ONLY when Brad approves — not part of this build):
--   npx wrangler d1 execute pf-platform-db --remote --file=platform/migrations/0004_derek_partner_role.sql

UPDATE users
   SET role = 'partner',
       updated_at = '2026-08-14T00:00:00.000Z'
 WHERE email = 'dfranke@pierfoundations.com'
   AND role <> 'partner';
