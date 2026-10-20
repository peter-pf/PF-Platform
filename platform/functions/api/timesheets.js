// Cloudflare Pages Function -- /api/timesheets
// LIVE timesheet roll-up DERIVED FROM SUBMITTED DAILY REPORTS.
//
// WHY: the Timesheet module used to read ONLY the static data/timesheets.js
// (synced from the SharePoint workbook). Now the field crew files daily reports
// (/api/daily-report, KV daily_reports_v1) with per-employee Start/End -> Hours.
// This endpoint aggregates those daily reports into the SAME week shape the
// Timesheet renderers already consume (per-employee days with Reg/OT/Total,
// plus by_cost_code / by_job / week totals), applying the Brad-approved OT rule
// via the shared functions/lib/ot-engine.mjs (single source of truth). The
// client merges these live weeks over the static ones so the UI keeps working
// with or without daily reports.
//
// PAYROLL RULE (see functions/lib/ot-engine.mjs, Brad approved):
//   day:  reg = min(dayHours,8), dailyOT = max(dayHours-8,0)
//   week: Sun 12:01am .. Sat 11:59pm; weeklyOT = max(0, sum(dayReg)-40);
//         finalReg = min(sum(dayReg),40); totalOT = sum(dailyOT)+weeklyOT.
//   NO pyramiding -- an hour is never paid OT twice.
//
// ZERO FINANCIALS: hours only. No wage/rate/$ is read, computed, or returned.
//
// RBAC: field_ops area (admin/partner/business_dev/field_ops) -- same readership
// as the daily reports it summarizes. areaForPath maps /api/timesheets ->
// 'field_ops'; the handler also calls requireArea(session,'field_ops').
//
// SHAPE returned (matches window.PF_TIMESHEETS weeks[] enough for the renderers):
//   { ok, source:'daily-reports', generated, year, latest_week_with_hours,
//     weeks:[ { week_label, week_start, week_end, crew:'live',
//       employees:[ { name, number:'', title:'', days:[ {day,date,job,
//         cost_code,activity,start,end,regular,ot,total,per_diem:''} ],
//         totals:{regular,ot,total,per_diem_nights:0}, days_with_hours } ],
//       by_cost_code:[{code,regular,ot,total}], by_job:[{job,regular,ot,total}],
//       totals:{regular,ot,total,per_diem_nights:0}, has_hours, employee_count } ],
//     by_employee_year:[{name,number:'',title:'',regular,ot,total,per_diem_nights:0}],
//     year_grand_total:{regular,ot,total,per_diem_nights:0} }

import { requireArea } from '../lib/auth.js';
import { buildWeeks, buildEmployeeYear } from '../lib/timesheet-rollup.mjs';
import { listReports } from '../lib/daily-report-store.js';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const denied = requireArea(context.data && context.data.session, 'field_ops');
  if (denied) return denied;
  try {
    if (!env.PF_SCHEDULE && !env.DB) {
      return json({ ok: true, source: 'daily-reports', weeks: [], by_employee_year: [],
        year_grand_total: { regular: 0, ot: 0, total: 0, per_diem_nights: 0 },
        fallback: true, note: 'No data store (KV + D1) available; no daily reports yet.' });
    }
    const url = new URL(request.url);
    const includeDrafts = url.searchParams.get('includeDrafts') === '1';
    // listReports reads from D1 (primary) with automatic KV fallback.
    const { reports } = await listReports(env, {});
    const weeks = buildWeeks(reports, { includeDrafts });
    const { rows, grand } = buildEmployeeYear(weeks);
    const weeksWithHours = weeks.filter((w) => w.has_hours);
    const latest = weeksWithHours.length ? weeksWithHours[weeksWithHours.length - 1].week_label : null;
    const year = weeks.length ? String(weeks[weeks.length - 1].week_start).slice(0, 4) : String(new Date().getUTCFullYear());
    return json({
      ok: true,
      source: 'daily-reports',
      generated: new Date().toISOString(),
      year,
      latest_week_with_hours: latest,
      weeks,
      by_employee_year: rows,
      year_grand_total: grand,
      report_count: reports.length,
    });
  } catch (err) {
    console.error('api/timesheets GET error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}
