// toolbox-talk-store.js: persistence layer for Toolbox Talk records.
//
// STORAGE: D1 ONLY. If env.DB is absent or the query fails, the function
// throws so the calling endpoint can return 503. Fail-closed posture.
//
// D1 table schema (migration 0010_toolbox_talks.sql):
//   id, project_id, project_name, talk_date, talk_time, location,
//   presenter, topic, topic_other, key_points, hazards, questions,
//   actions, attendees (JSON), status, pdf_name, pdf_web_url,
//   emailed_to (JSON), sent_at, created_by, created_at, updated_at, updated_by

export const KV_KEY = null; // D1 only — no KV

// Toolbox Talk presenter options (mirrors INSPECTED_BY_OPTIONS in EI store).
export const PRESENTER_OPTIONS = ['John Willis', 'Seth Willis', 'Christian Boutte', 'Jordan Lemay'];
export const PRESENTER_SET     = new Set(PRESENTER_OPTIONS);

// Standard topic keys for the dropdown.
export const TOPICS = [
  { key: 'fall_protection',          label: 'Fall Protection' },
  { key: 'excavation_trenching',     label: 'Excavation and Trenching' },
  { key: 'struck_caught',            label: 'Struck-By and Caught-Between' },
  { key: 'heavy_equipment_spotters', label: 'Heavy Equipment and Spotters' },
  { key: 'ppe',                      label: 'PPE (Personal Protective Equipment)' },
  { key: 'heat_cold_stress',         label: 'Heat and Cold Stress' },
  { key: 'housekeeping',             label: 'Housekeeping' },
  { key: 'electrical_overhead',      label: 'Electrical and Overhead Lines' },
  { key: 'utilities_locates',        label: 'Utilities and Locates' },
  { key: 'silica',                   label: 'Silica' },
  { key: 'other',                    label: 'Other' },
];
export const TOPIC_KEYS    = new Set(TOPICS.map((t) => t.key));
export const TOPIC_LABELS  = Object.fromEntries(TOPICS.map((t) => [t.key, t.label]));

// ---- row mapper (D1 row -> JS object) --------------------------------------
function rowToRecord(row) {
  if (!row) return null;
  let attendees = [];
  try { attendees = JSON.parse(row.attendees || '[]'); } catch { /* ignore */ }
  let emailedTo = null;
  try { emailedTo = row.emailed_to ? JSON.parse(row.emailed_to) : null; } catch { /* ignore */ }
  return {
    id:           row.id,
    projectId:    row.project_id,
    projectName:  row.project_name,
    date:         row.talk_date,
    time:         row.talk_time,
    location:     row.location,
    presenter:    row.presenter,
    topic:        row.topic,
    topicOther:   row.topic_other,
    keyPoints:    row.key_points,
    hazards:      row.hazards,
    questions:    row.questions,
    actions:      row.actions,
    attendees,
    status:       row.status,
    pdfName:      row.pdf_name || null,
    pdfWebUrl:    row.pdf_web_url || null,
    emailedTo,
    sentAt:       row.sent_at || null,
    createdBy:    row.created_by,
    createdAt:    row.created_at,
    updatedAt:    row.updated_at || null,
    updatedBy:    row.updated_by || null,
  };
}

// ---- upsertRecord ----------------------------------------------------------
export async function upsertRecord(env, rec) {
  if (!env.DB) throw new Error('D1 (DB) not configured');
  const attendeesJson = JSON.stringify(Array.isArray(rec.attendees) ? rec.attendees : []);
  const emailedToJson = rec.emailedTo ? JSON.stringify(rec.emailedTo) : null;
  await env.DB.prepare(`
    INSERT INTO toolbox_talks
      (id, project_id, project_name, talk_date, talk_time, location,
       presenter, topic, topic_other, key_points, hazards, questions,
       actions, attendees, status, pdf_name, pdf_web_url, emailed_to,
       sent_at, created_by, created_at, updated_at, updated_by)
    VALUES
      (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      project_id=excluded.project_id, project_name=excluded.project_name,
      talk_date=excluded.talk_date, talk_time=excluded.talk_time,
      location=excluded.location, presenter=excluded.presenter,
      topic=excluded.topic, topic_other=excluded.topic_other,
      key_points=excluded.key_points, hazards=excluded.hazards,
      questions=excluded.questions, actions=excluded.actions,
      attendees=excluded.attendees, status=excluded.status,
      pdf_name=excluded.pdf_name, pdf_web_url=excluded.pdf_web_url,
      emailed_to=excluded.emailed_to, sent_at=excluded.sent_at,
      updated_at=excluded.updated_at, updated_by=excluded.updated_by
  `).bind(
    rec.id, rec.projectId || '', rec.projectName || '',
    rec.date || '', rec.time || '', rec.location || '',
    rec.presenter || '', rec.topic || '', rec.topicOther || '',
    rec.keyPoints || '', rec.hazards || '', rec.questions || '',
    rec.actions || '', attendeesJson, rec.status || 'draft',
    rec.pdfName || null, rec.pdfWebUrl || null,
    emailedToJson, rec.sentAt || null,
    rec.createdBy || '', rec.createdAt || new Date().toISOString(),
    rec.updatedAt || null, rec.updatedBy || null
  ).run();
  return rec.updatedAt || rec.createdAt;
}

// ---- loadRecordById --------------------------------------------------------
export async function loadRecordById(env, id) {
  if (!env.DB) return null;
  const row = await env.DB.prepare(
    'SELECT * FROM toolbox_talks WHERE id = ?'
  ).bind(id).first();
  return rowToRecord(row);
}

// ---- listRecords -----------------------------------------------------------
export async function listRecords(env, { projectId, date } = {}) {
  if (!env.DB) return { records: [] };
  let sql = 'SELECT * FROM toolbox_talks';
  const params = [];
  const where = [];
  if (projectId) { where.push('project_id = ?'); params.push(projectId); }
  if (date)      { where.push('talk_date = ?');   params.push(date); }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY talk_date DESC, created_at DESC LIMIT 2000';
  const result = await env.DB.prepare(sql).bind(...params).all();
  return { records: (result.results || []).map(rowToRecord).filter(Boolean) };
}

// ---- countRecords ----------------------------------------------------------
export async function countRecords(env) {
  if (!env.DB) return 0;
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM toolbox_talks').first();
  return (row && row.n) || 0;
}
