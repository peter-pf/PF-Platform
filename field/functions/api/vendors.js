// Cloudflare Pages Function — /api/vendors
// Vendor / parts-supplier directory for the field portal.
//
// Security:
//  - Standard session gate fires in _middleware.js.
//  - Additional UID-level preview gate fires in _middleware.js via vendorsAllowed().
//  - This endpoint re-checks the gate directly (belt + suspenders).
//  - Writes are further restricted to vendorsCanEdit() (VENDORS_EDITORS set).
//  - Fail-closed: absent session => 401.  Absent DB => 500.
//
// GET  /api/vendors               — list all sections + items
// POST /api/vendors               — write (action in JSON body)
//
// POST actions (all require vendorsCanEdit):
//   seed            — apply VENDORS_SEED only if sections table is empty
//   add_section     — { name }
//   edit_section    — { id, name }
//   delete_section  — { id }  — also deletes all items in the section
//   add_item        — { section_id, company, category, contact, phone,
//                       address, website, account_num, notes }
//   edit_item       — { id, company, category, contact, phone,
//                       address, website, account_num, notes }
//   delete_item     — { id }

import { vendorsAllowed, vendorsCanEdit } from '../lib/vendors-access.js';
import { VENDORS_SEED }                    from '../lib/vendors-seed.js';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

// Hard caps on free-text to prevent DB abuse.
const CAP = {
  name:        80,
  company:     120,
  category:    80,
  contact:     80,
  phone:       40,
  address:     200,
  website:     200,
  account_num: 60,
  notes:       500,
};

function cap(val, field) {
  const s = String(val || '').trim();
  return s.slice(0, CAP[field] || 200);
}

// Ensure the vendors tables exist (idempotent DDL — harmless on repeated calls).
async function ensureTables(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS vendors_sections (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_by TEXT, updated_at TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS vendors_items (
      id TEXT PRIMARY KEY, section_id TEXT NOT NULL, company TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '', contact TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '',
      website TEXT NOT NULL DEFAULT '', account_num TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_by TEXT, updated_at TEXT
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_vendors_items_section ON vendors_items (section_id)`),
  ]);
}

// ---- GET ----------------------------------------------------------------
export async function onRequestGet(context) {
  const session = context.data?.session;
  if (!session) return json({ ok: false, error: 'Authentication required.' }, 401);
  if (!vendorsAllowed(session)) return json({ ok: false, error: 'Access not enabled for your account.' }, 403);

  const db = context.env?.DB;
  if (!db) return json({ ok: false, error: 'Database unavailable.' }, 500);

  try {
    await ensureTables(db);

    const [secRows, itemRows] = await Promise.all([
      db.prepare('SELECT id, name, sort_order FROM vendors_sections ORDER BY sort_order, created_at').all(),
      db.prepare(`SELECT id, section_id, company, category, contact, phone, address,
                         website, account_num, notes, sort_order, updated_by, updated_at
                  FROM vendors_items ORDER BY sort_order, created_at`).all(),
    ]);

    // Group items by section_id.
    const itemsBySec = {};
    for (const row of (itemRows.results || [])) {
      const sid = row.section_id;
      if (!itemsBySec[sid]) itemsBySec[sid] = [];
      itemsBySec[sid].push(row);
    }

    return json({ ok: true, sections: secRows.results || [], items: itemsBySec });
  } catch (e) {
    console.error('[vendors] GET error:', e && e.message);
    return json({ ok: false, error: 'Failed to load vendor data.' }, 500);
  }
}

// ---- POST ---------------------------------------------------------------
export async function onRequestPost(context) {
  const session = context.data?.session;
  if (!session) return json({ ok: false, error: 'Authentication required.' }, 401);
  if (!vendorsAllowed(session)) return json({ ok: false, error: 'Access not enabled for your account.' }, 403);
  if (!vendorsCanEdit(session)) return json({ ok: false, error: 'Write access not enabled for your account.' }, 403);

  const db = context.env?.DB;
  if (!db) return json({ ok: false, error: 'Database unavailable.' }, 500);

  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body.' }, 400);
  }

  const { action } = body || {};
  const actor = session.name || session.uid || 'unknown';
  const now   = new Date().toISOString();

  try {
    await ensureTables(db);

    // ----------------------------------------------------------------
    if (action === 'seed') {
      // Insert seed data only if sections table is empty.
      const existing = await db.prepare('SELECT COUNT(*) AS n FROM vendors_sections').first();
      if ((existing?.n ?? 0) > 0) {
        return json({ ok: true, seeded: false, message: 'Already has data — seed skipped.' });
      }
      if (!Array.isArray(VENDORS_SEED) || VENDORS_SEED.length === 0) {
        return json({ ok: true, seeded: false, message: 'Seed array is empty.' });
      }

      // Create sections on-demand; collect section ids by name.
      const sectionIds = {};
      let secOrder = 0;
      for (const item of VENDORS_SEED) {
        const sname = String(item.section_name || 'Local (Fort Wayne)').trim().slice(0, 80);
        if (!sectionIds[sname]) {
          const sid = crypto.randomUUID();
          await db.prepare(
            `INSERT INTO vendors_sections (id, name, sort_order, created_by, created_at)
             VALUES (?, ?, ?, ?, ?)`
          ).bind(sid, sname, secOrder++, actor, now).run();
          sectionIds[sname] = sid;
        }
        const iid = crypto.randomUUID();
        const r = item;
        await db.prepare(
          `INSERT INTO vendors_items
             (id, section_id, company, category, contact, phone, address,
              website, account_num, notes, sort_order, created_by, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
        ).bind(
          iid, sectionIds[String(r.section_name || 'Local (Fort Wayne)').trim().slice(0,80)],
          cap(r.company, 'company'), cap(r.category, 'category'),
          cap(r.contact, 'contact'), cap(r.phone, 'phone'),
          cap(r.address, 'address'), cap(r.website, 'website'),
          cap(r.account_num, 'account_num'), cap(r.notes, 'notes'),
          0, actor, now
        ).run();
      }
      return json({ ok: true, seeded: true });
    }

    // ----------------------------------------------------------------
    if (action === 'add_section') {
      const name = cap(body.name, 'name');
      if (!name) return json({ ok: false, error: 'Section name is required.' }, 400);
      const countRow = await db.prepare('SELECT MAX(sort_order) AS m FROM vendors_sections').first();
      const nextSort = ((countRow?.m) ?? -1) + 1;
      const id = crypto.randomUUID();
      await db.prepare(
        `INSERT INTO vendors_sections (id, name, sort_order, created_by, created_at)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(id, name, nextSort, actor, now).run();
      return json({ ok: true, section: { id, name, sort_order: nextSort } });
    }

    // ----------------------------------------------------------------
    if (action === 'edit_section') {
      const { id } = body;
      const name = cap(body.name, 'name');
      if (!id || typeof id !== 'string') return json({ ok: false, error: 'id required.' }, 400);
      if (!name) return json({ ok: false, error: 'Section name is required.' }, 400);
      const result = await db.prepare(
        `UPDATE vendors_sections SET name=?, updated_by=?, updated_at=? WHERE id=?`
      ).bind(name, actor, now, id).run();
      if (!result.meta?.changes) return json({ ok: false, error: 'Section not found.' }, 404);
      return json({ ok: true });
    }

    // ----------------------------------------------------------------
    if (action === 'delete_section') {
      const { id } = body;
      if (!id || typeof id !== 'string') return json({ ok: false, error: 'id required.' }, 400);
      // Delete items first (application-level cascade), then the section.
      await db.batch([
        db.prepare('DELETE FROM vendors_items WHERE section_id=?').bind(id),
        db.prepare('DELETE FROM vendors_sections WHERE id=?').bind(id),
      ]);
      return json({ ok: true });
    }

    // ----------------------------------------------------------------
    if (action === 'add_item') {
      const { section_id } = body;
      const company = cap(body.company, 'company');
      if (!section_id || typeof section_id !== 'string') {
        return json({ ok: false, error: 'section_id required.' }, 400);
      }
      if (!company) return json({ ok: false, error: 'Company name is required.' }, 400);

      // Verify section exists.
      const sec = await db.prepare('SELECT id FROM vendors_sections WHERE id=?').bind(section_id).first();
      if (!sec) return json({ ok: false, error: 'Section not found.' }, 404);

      const sortRow = await db.prepare(
        'SELECT MAX(sort_order) AS m FROM vendors_items WHERE section_id=?'
      ).bind(section_id).first();
      const nextSort = ((sortRow?.m) ?? -1) + 1;
      const id = crypto.randomUUID();

      await db.prepare(
        `INSERT INTO vendors_items
           (id, section_id, company, category, contact, phone, address,
            website, account_num, notes, sort_order, created_by, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        id, section_id, company,
        cap(body.category, 'category'), cap(body.contact, 'contact'),
        cap(body.phone, 'phone'), cap(body.address, 'address'),
        cap(body.website, 'website'), cap(body.account_num, 'account_num'),
        cap(body.notes, 'notes'), nextSort, actor, now
      ).run();

      return json({ ok: true, item: {
        id, section_id, company,
        category: cap(body.category,'category'), contact: cap(body.contact,'contact'),
        phone: cap(body.phone,'phone'), address: cap(body.address,'address'),
        website: cap(body.website,'website'), account_num: cap(body.account_num,'account_num'),
        notes: cap(body.notes,'notes'), sort_order: nextSort,
        updated_by: null, updated_at: null,
      }});
    }

    // ----------------------------------------------------------------
    if (action === 'edit_item') {
      const { id } = body;
      const company = cap(body.company, 'company');
      if (!id || typeof id !== 'string') return json({ ok: false, error: 'id required.' }, 400);
      if (!company) return json({ ok: false, error: 'Company name is required.' }, 400);

      const result = await db.prepare(
        `UPDATE vendors_items
         SET company=?, category=?, contact=?, phone=?, address=?,
             website=?, account_num=?, notes=?, updated_by=?, updated_at=?
         WHERE id=?`
      ).bind(
        company, cap(body.category,'category'), cap(body.contact,'contact'),
        cap(body.phone,'phone'), cap(body.address,'address'),
        cap(body.website,'website'), cap(body.account_num,'account_num'),
        cap(body.notes,'notes'), actor, now, id
      ).run();
      if (!result.meta?.changes) return json({ ok: false, error: 'Item not found.' }, 404);
      return json({ ok: true });
    }

    // ----------------------------------------------------------------
    if (action === 'delete_item') {
      const { id } = body;
      if (!id || typeof id !== 'string') return json({ ok: false, error: 'id required.' }, 400);
      await db.prepare('DELETE FROM vendors_items WHERE id=?').bind(id).run();
      return json({ ok: true });
    }

    return json({ ok: false, error: 'Unknown action.' }, 400);

  } catch (e) {
    console.error('[vendors] POST error:', action, e && e.message);
    return json({ ok: false, error: 'Server error.' }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method === 'GET')  return onRequestGet(context);
  if (context.request.method === 'POST') return onRequestPost(context);
  return json({ ok: false, error: 'Method not allowed.' }, 405);
}
