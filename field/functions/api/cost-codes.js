// Cloudflare Pages Function -- /api/cost-codes
// Returns PF QuickBooks cost codes for field use: 5000-5600 (Job Expenses)
// and 7500-7635 (Non-Job Materials & Equipment + Personnel Travel - Non Job).
//
// Auth: any signed-in user (field_ops area). No role split — all authenticated
// users receive the same 55 codes. Nothing sensitive remains in this set.
//
// RESPONSE:
//   { ok: true, codes: [...], total: 55, role: "<role>" }
//   Each code: { code, name, type, jobSpecific, group, section, headingLevel }
//     headingLevel 0 = line item  (copy-target)
//     headingLevel 1 = group heading
//     headingLevel 2 = section heading within a group

import { requireArea } from '../lib/auth.js';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

// ---------------------------------------------------------------------------
// Codes 5000-5600 (Job Expenses) and 7500-7635 (Non-Job + Personnel Travel).
// Verbatim from QuickBooks chart of accounts PDF (2026-10-21 extraction).
// Ranges per Derek Franke directive 2026-10-21.
// hl = headingLevel: 1=major group, 2=section within group, 0=line item.
// g  = display group label.
// s  = section label within the group (null if none).
// ---------------------------------------------------------------------------
const CODES = [
  // ---- Job Expenses: 5000-5600 ----
  { code:'5000', name:'Job Expenses',                                 type:'Cost of Goods Sold', js:true,  g:'Job Expenses',                     hl:1, s:null },
  { code:'5050', name:'Professional Services',                        type:'Cost of Goods Sold', js:true,  g:'Job Expenses',                     hl:2, s:'Professional Services' },
  { code:'5051', name:'Engineering & Design Services',                type:'Cost of Goods Sold', js:true,  g:'Job Expenses',                     hl:0, s:'Professional Services' },
  { code:'5052', name:'Material Testing',                             type:'Cost of Goods Sold', js:true,  g:'Job Expenses',                     hl:0, s:'Professional Services' },
  { code:'5053', name:'Surveying & Staking',                          type:'Cost of Goods Sold', js:true,  g:'Job Expenses',                     hl:0, s:'Professional Services' },
  { code:'5100', name:'Jobsite Materials',                            type:'Cost of Goods Sold', js:true,  g:'Job Expenses',                     hl:2, s:'Jobsite Materials' },
  { code:'5110', name:'Stone Materials',                              type:'Cost of Goods Sold', js:true,  g:'Job Expenses',                     hl:0, s:'Jobsite Materials' },
  { code:'5120', name:'Rigid Inclusion Materials',                    type:'Cost of Goods Sold', js:true,  g:'Job Expenses',                     hl:0, s:'Jobsite Materials' },
  { code:'5130', name:'Helical Piling Materials',                     type:'Cost of Goods Sold', js:true,  g:'Job Expenses',                     hl:0, s:'Jobsite Materials' },
  { code:'5140', name:'Equipment Consumables',                        type:'Cost of Goods Sold', js:true,  g:'Job Expenses',                     hl:0, s:'Jobsite Materials' },
  { code:'5190', name:'Ground Improvement Testing',                   type:'Cost of Goods Sold', js:true,  g:'Job Expenses',                     hl:0, s:'Jobsite Materials' },
  { code:'5200', name:'Job Labor',                                    type:'Cost of Goods Sold', js:true,  g:'Job Expenses',                     hl:2, s:'Job Labor' },
  { code:'5210', name:'Subcontractors Labor',                         type:'Cost of Goods Sold', js:true,  g:'Job Expenses',                     hl:0, s:'Job Labor' },
  { code:'5215', name:'Willis Dirt Works Retainer',                   type:'Cost of Goods Sold', js:true,  g:'Job Expenses',                     hl:0, s:'Job Labor' },
  { code:'5220', name:'Employee Job Labor',                           type:'Cost of Goods Sold', js:true,  g:'Job Expenses',                     hl:0, s:'Job Labor' },
  { code:'5230', name:'Payroll Tax Expenses',                         type:'Cost of Goods Sold', js:true,  g:'Job Expenses',                     hl:0, s:'Job Labor' },
  { code:'5300', name:'Job Travel',                                   type:'Cost of Goods Sold', js:true,  g:'Job Expenses',                     hl:2, s:'Job Travel' },
  { code:'5310', name:'Travel - Air',                                 type:'Cost of Goods Sold', js:true,  g:'Job Expenses',                     hl:0, s:'Job Travel' },
  { code:'5320', name:'Travel - Car Rental/Uber',                     type:'Cost of Goods Sold', js:true,  g:'Job Expenses',                     hl:0, s:'Job Travel' },
  { code:'5330', name:'Travel - Mileage',                             type:'Cost of Goods Sold', js:true,  g:'Job Expenses',                     hl:0, s:'Job Travel' },
  { code:'5340', name:'Travel - Hotel/Housing',                       type:'Cost of Goods Sold', js:true,  g:'Job Expenses',                     hl:0, s:'Job Travel' },
  { code:'5350', name:'Travel - Parking',                             type:'Cost of Goods Sold', js:true,  g:'Job Expenses',                     hl:0, s:'Job Travel' },
  { code:'5360', name:'Travel - Meals/Per Diem',                      type:'Cost of Goods Sold', js:true,  g:'Job Expenses',                     hl:0, s:'Job Travel' },
  { code:'5400', name:'Jobsite Equipment Expenses',                   type:'Cost of Goods Sold', js:true,  g:'Job Expenses',                     hl:2, s:'Jobsite Equipment Expenses' },
  { code:'5405', name:'Equipment Transportation',                     type:'Cost of Goods Sold', js:true,  g:'Job Expenses',                     hl:0, s:'Jobsite Equipment Expenses' },
  { code:'5406', name:'AP Rig',                                       type:'Cost of Goods Sold', js:true,  g:'Job Expenses',                     hl:0, s:'Jobsite Equipment Expenses' },
  { code:'5407', name:'PF Predrill',                                  type:'Cost of Goods Sold', js:true,  g:'Job Expenses',                     hl:0, s:'Jobsite Equipment Expenses' },
  { code:'5408', name:'Gooseneck Parts Load',                         type:'Cost of Goods Sold', js:true,  g:'Job Expenses',                     hl:0, s:'Jobsite Equipment Expenses' },
  { code:'5409', name:'Fall Off Load/Misc Mob',                       type:'Cost of Goods Sold', js:true,  g:'Job Expenses',                     hl:0, s:'Jobsite Equipment Expenses' },
  { code:'5410', name:'Equipment Rental for Jobs',                    type:'Cost of Goods Sold', js:true,  g:'Job Expenses',                     hl:0, s:'Jobsite Equipment Expenses' },
  { code:'5420', name:'Equipment Maintenance & Repairs',              type:'Cost of Goods Sold', js:true,  g:'Job Expenses',                     hl:0, s:'Jobsite Equipment Expenses' },
  { code:'5430', name:'Equipment Fuel',                               type:'Cost of Goods Sold', js:true,  g:'Job Expenses',                     hl:0, s:'Jobsite Equipment Expenses' },
  { code:'5600', name:'Small Tools & Equipment - Job Specific',       type:'Cost of Goods Sold', js:true,  g:'Job Expenses',                     hl:2, s:null },

  // ---- Non-Job Materials & Equipment: 7500-7525 ----
  { code:'7500', name:'Non Job Mtls / Equipmt Repair',                type:'Expense',            js:false, g:'Non-Job Materials & Equipment',    hl:1, s:null },
  { code:'7501', name:'Safety Materials',                             type:'Expense',            js:false, g:'Non-Job Materials & Equipment',    hl:0, s:null },
  { code:'7505', name:'Equipment Transportation',                     type:'Expense',            js:false, g:'Non-Job Materials & Equipment',    hl:0, s:null },
  { code:'7507', name:'Small Tools',                                  type:'Expense',            js:false, g:'Non-Job Materials & Equipment',    hl:0, s:null },
  { code:'7509', name:'Consumables-Spent,Drained,Exhausted',          type:'Expense',            js:false, g:'Non-Job Materials & Equipment',    hl:0, s:null },
  { code:'7511', name:'Equip Repair - Labor Payroll',                 type:'Expense',            js:false, g:'Non-Job Materials & Equipment',    hl:0, s:null },
  { code:'7512', name:'Equip Repair - PR taxes',                      type:'Expense',            js:false, g:'Non-Job Materials & Equipment',    hl:0, s:null },
  { code:'7513', name:'Shipping Goods/Parts',                         type:'Expense',            js:false, g:'Non-Job Materials & Equipment',    hl:0, s:null },
  { code:'7515', name:'Equipment rent',                               type:'Expense',            js:false, g:'Non-Job Materials & Equipment',    hl:0, s:null },
  { code:'7516', name:'Excavator Parts / Service / Repair',           type:'Expense',            js:false, g:'Non-Job Materials & Equipment',    hl:0, s:null },
  { code:'7517', name:'Mast Vibro Parts / Service / Repair',          type:'Expense',            js:false, g:'Non-Job Materials & Equipment',    hl:0, s:null },
  { code:'7518', name:'Drill Tools Parts / Service / Repair',         type:'Expense',            js:false, g:'Non-Job Materials & Equipment',    hl:0, s:null },
  { code:'7519', name:'Support Equipment Parts / Service / Repair',   type:'Expense',            js:false, g:'Non-Job Materials & Equipment',    hl:0, s:null },
  { code:'7520', name:'Auto & Truck Expenses',                        type:'Expense',            js:false, g:'Non-Job Materials & Equipment',    hl:2, s:'Auto & Truck' },
  { code:'7521', name:'Employee Vehicle Allowance',                   type:'Expense',            js:false, g:'Non-Job Materials & Equipment',    hl:0, s:'Auto & Truck' },
  { code:'7522', name:'Vehicle Maintenance',                          type:'Expense',            js:false, g:'Non-Job Materials & Equipment',    hl:0, s:'Auto & Truck' },
  { code:'7525', name:'Fuel Expense',                                 type:'Expense',            js:false, g:'Non-Job Materials & Equipment',    hl:0, s:'Auto & Truck' },

  // ---- Personnel Travel - Non Job: 7600-7635 ----
  { code:'7600', name:'Personnel Travel - Non Job',                   type:'Expense',            js:false, g:'Personnel Travel - Non Job',       hl:1, s:null },
  { code:'7610', name:'Transportation (Non Job)',                     type:'Expense',            js:false, g:'Personnel Travel - Non Job',       hl:0, s:null },
  { code:'7620', name:'Hotels (Non Job)',                             type:'Expense',            js:false, g:'Personnel Travel - Non Job',       hl:0, s:null },
  { code:'7630', name:'Meals (Non Job)',                              type:'Expense',            js:false, g:'Personnel Travel - Non Job',       hl:0, s:null },
  { code:'7635', name:'Non Job Per Diem',                             type:'Expense',            js:false, g:'Personnel Travel - Non Job',       hl:0, s:null },
];

export async function onRequestGet(context) {
  const session = context.data && context.data.session;
  const denied = requireArea(session, 'field_ops');
  if (denied) return denied;

  const role = session && session.role;

  // All authenticated users receive the same set — no role split.
  const codes = CODES.map(c => ({
    code:         c.code,
    name:         c.name,
    type:         c.type,
    jobSpecific:  c.js,
    group:        c.g,
    section:      c.s,
    headingLevel: c.hl,
  }));

  return json({ ok: true, codes, total: codes.length, role: role || 'unknown' });
}
