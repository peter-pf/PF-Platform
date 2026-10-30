// toolbox-talk-store.js: persistence layer for Toolbox Talk / Safety Analysis records.
//
// DISPLAY NAME: "Safety Analysis" (Derek Franke, 2026-10-30).
// STORAGE: D1 table `toolbox_talks`, mailing list key `toolbox_talk`,
//          SP folder "05 - Field Operations/Toolbox Talks" - all UNCHANGED.
//
// D1 table schema (migrations 0010 + 0012):
//   id, project_id, project_name, talk_date, talk_time, location,
//   superintendent, presenter, topic, topic_other, key_points, hazards, questions,
//   actions, jsa_steps, jsa_hazards, jsa_preventative, hazard_checks (JSON),
//   hierarchy_names (JSON), attendees (JSON [{name,title,acknowledged}]),
//   status, pdf_name, pdf_web_url, emailed_to (JSON), sent_at,
//   created_by, created_at, updated_at, updated_by

export const KV_KEY = null; // D1 only - no KV

// Superintendent options - ONLY these two are accepted (validated server-side).
// Different from the presenter dropdown which has four options.
export const SUPERINTENDENT_OPTIONS = ['John Willis', 'Seth Willis'];
export const SUPERINTENDENT_SET     = new Set(SUPERINTENDENT_OPTIONS);

// Toolbox Talk presenter options (unchanged from pre-SA form).
export const PRESENTER_OPTIONS = ['John Willis', 'Seth Willis', 'Christian Boutte', 'Jordan Lemay'];
export const PRESENTER_SET     = new Set(PRESENTER_OPTIONS);

// Standard topic keys for the Toolbox Talk section dropdown.
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

// 20-item Jobsite Safety Analysis hazard checklist (Derek Franke paper form, 2026-10-30).
// Keys are snake_case versions of the label text; validated server-side.
export const HAZARD_ITEMS = [
  { key: 'personal_injury',       label: 'Personal Injury' },
  { key: 'equipment_lifting',     label: 'Equipment Lifting' },
  { key: 'vehicle_operations',    label: 'Vehicle Operations' },
  { key: 'rotating_equipment',    label: 'Rotating Equipment' },
  { key: 'equipment_operations',  label: 'Equipment Operations' },
  { key: 'excavations',           label: 'Excavations' },
  { key: 'pinch_points',          label: 'Pinch Points' },
  { key: 'environment',           label: 'Environment' },
  { key: 'overhead_work',         label: 'Overhead Work' },
  { key: 'welding_burning',       label: 'Welding/Burning' },
  { key: 'site_access',           label: 'Site Access' },
  { key: 'air_quality',           label: 'Air Quality' },
  { key: 'lack_of_ppe',           label: 'Lack of PPE' },
  { key: 'ladder_use',            label: 'Ladder Use' },
  { key: 'new_worker',            label: 'New Worker' },
  { key: 'tools',                 label: 'Tools' },
  { key: 'pipeline_plumbing',     label: 'Pipeline/Plumbing' },
  { key: 'struck_by',             label: 'Struck By' },
  { key: 'electrical',            label: 'Electrical' },
  { key: 'chemicals',             label: 'Chemicals' },
];
export const HAZARD_KEYS       = new Set(HAZARD_ITEMS.map((h) => h.key));
export const HAZARD_KEY_LABELS = Object.fromEntries(HAZARD_ITEMS.map((h) => [h.key, h.label]));

// ---- row mapper (D1 row -> JS object) --------------------------------------
function rowToRecord(row) {
  if (!row) return null;
  let attendees = [];
  try { attendees = JSON.parse(row.attendees || '[]'); } catch { /* ignore */ }
  let emailedTo = null;
  try { emailedTo = row.emailed_to ? JSON.parse(row.emailed_to) : null; } catch { /* ignore */ }
  let hazardChecks = [];
  try { hazardChecks = JSON.parse(row.hazard_checks || '[]'); } catch { /* ignore */ }
  let hierarchyNames = [];
  try { hierarchyNames = JSON.parse(row.hierarchy_names || '[]'); } catch { /* ignore */ }

  return {
    id:              row.id,
    projectId:       row.project_id,
    projectName:     row.project_name,
    date:            row.talk_date,
    time:            row.talk_time,
    location:        row.location,
    superintendent:  row.superintendent  || '',
    presenter:       row.presenter,
    topic:           row.topic,
    topicOther:      row.topic_other,
    keyPoints:       row.key_points,
    hazards:         row.hazards,
    questions:       row.questions,
    actions:         row.actions,
    jsaSteps:        row.jsa_steps        || '',
    jsaHazards:      row.jsa_hazards      || '',
    jsaPreventative: row.jsa_preventative || '',
    hazardChecks,
    hierarchyNames,
    attendees,
    status:          row.status,
    pdfName:         row.pdf_name || null,
    pdfWebUrl:       row.pdf_web_url || null,
    emailedTo,
    sentAt:          row.sent_at || null,
    createdBy:       row.created_by,
    createdAt:       row.created_at,
    updatedAt:       row.updated_at || null,
    updatedBy:       row.updated_by || null,
  };
}

// ---- upsertRecord ----------------------------------------------------------
export async function upsertRecord(env, rec) {
  if (!env.DB) throw new Error('D1 (DB) not configured');
  const attendeesJson      = JSON.stringify(Array.isArray(rec.attendees) ? rec.attendees : []);
  const emailedToJson      = rec.emailedTo ? JSON.stringify(rec.emailedTo) : null;
  const hazardChecksJson   = JSON.stringify(Array.isArray(rec.hazardChecks) ? rec.hazardChecks : []);
  const hierarchyNamesJson = JSON.stringify(Array.isArray(rec.hierarchyNames) ? rec.hierarchyNames : []);

  await env.DB.prepare(`
    INSERT INTO toolbox_talks
      (id, project_id, project_name, talk_date, talk_time, location,
       superintendent, presenter, topic, topic_other, key_points, hazards, questions,
       actions, jsa_steps, jsa_hazards, jsa_preventative, hazard_checks, hierarchy_names,
       attendees, status, pdf_name, pdf_web_url, emailed_to,
       sent_at, created_by, created_at, updated_at, updated_by)
    VALUES
      (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      project_id=excluded.project_id, project_name=excluded.project_name,
      talk_date=excluded.talk_date, talk_time=excluded.talk_time,
      location=excluded.location, superintendent=excluded.superintendent,
      presenter=excluded.presenter,
      topic=excluded.topic, topic_other=excluded.topic_other,
      key_points=excluded.key_points, hazards=excluded.hazards,
      questions=excluded.questions, actions=excluded.actions,
      jsa_steps=excluded.jsa_steps, jsa_hazards=excluded.jsa_hazards,
      jsa_preventative=excluded.jsa_preventative,
      hazard_checks=excluded.hazard_checks, hierarchy_names=excluded.hierarchy_names,
      attendees=excluded.attendees, status=excluded.status,
      pdf_name=excluded.pdf_name, pdf_web_url=excluded.pdf_web_url,
      emailed_to=excluded.emailed_to, sent_at=excluded.sent_at,
      updated_at=excluded.updated_at, updated_by=excluded.updated_by
  `).bind(
    rec.id, rec.projectId || '', rec.projectName || '',
    rec.date || '', rec.time || '', rec.location || '',
    rec.superintendent || '', rec.presenter || '', rec.topic || '', rec.topicOther || '',
    rec.keyPoints || '', rec.hazards || '', rec.questions || '',
    rec.actions || '', rec.jsaSteps || '', rec.jsaHazards || '', rec.jsaPreventative || '',
    hazardChecksJson, hierarchyNamesJson,
    attendeesJson, rec.status || 'draft',
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
