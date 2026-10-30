-- Migration 0012: Safety Analysis fields for toolbox_talks (Derek Franke, 2026-10-30).
--
-- Renames the TT form to "Safety Analysis" (display only).
-- Storage path, mailing list key and SP folder UNCHANGED.
--
-- ADDITIVE ONLY. No existing column is modified. Old TT records that have NULL
-- for new columns will load with those fields blank (handled in rowToRecord).
--
-- New fields:
--   superintendent     TEXT  - must be 'John Willis' or 'Seth Willis' (validated server-side)
--   jsa_steps          TEXT  - Sequence of Basic Job Steps (textarea, JSA section)
--   jsa_hazards        TEXT  - Potential Hazards described in full (textarea, JSA section)
--   jsa_preventative   TEXT  - Preventative Measures (textarea, JSA section)
--   hazard_checks      TEXT  - JSON array of checked hazard-category keys (20-item allowlist)
--   hierarchy_names    TEXT  - JSON array of 5 strings (Hierarchy of Competency ranked names)
--
-- attendees column already exists as JSON [{name, acknowledged}].
-- Extended format: [{name, title, acknowledged}]. Additive in JSON — old records missing
-- title/acknowledged are treated as blank/false respectively.

ALTER TABLE toolbox_talks ADD COLUMN superintendent   TEXT NOT NULL DEFAULT '';
ALTER TABLE toolbox_talks ADD COLUMN jsa_steps        TEXT NOT NULL DEFAULT '';
ALTER TABLE toolbox_talks ADD COLUMN jsa_hazards      TEXT NOT NULL DEFAULT '';
ALTER TABLE toolbox_talks ADD COLUMN jsa_preventative TEXT NOT NULL DEFAULT '';
ALTER TABLE toolbox_talks ADD COLUMN hazard_checks    TEXT NOT NULL DEFAULT '[]';
ALTER TABLE toolbox_talks ADD COLUMN hierarchy_names  TEXT NOT NULL DEFAULT '[]';
