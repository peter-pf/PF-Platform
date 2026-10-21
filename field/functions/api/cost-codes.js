// Cloudflare Pages Function -- /api/cost-codes
// Returns the PF QuickBooks chart of accounts / cost codes, filtered by role.
//
// RBAC: field_ops area (any signed-in user can call this endpoint).
// Server-side role filtering:
//   admin / partner  -> all 163 codes (full chart of accounts)
//   field_ops / other -> 79 operational codes only (no balance sheet, income,
//                        management payroll, professional fees/insurance,
//                        bank/payroll fees, interest, depreciation)
//
// The restricted rows are NEVER serialised and sent to non-privileged callers.
// Do NOT move the CODES array to a static JS file -- that would ship restricted
// financial account codes to the field crew's browser.
//
// RESPONSE:
//   { ok: true, codes: [...], total: N, role: "field_ops" }
//   Each code: { code, name, type, jobSpecific, group, headingLevel }
//     headingLevel 0 = line item  (copy-target)
//     headingLevel 1 = group heading  (5000 Job Expenses, 7200 Business Overhead…)
//     headingLevel 2 = section heading within a group  (5050 Professional Services…)

import { requireArea } from '../lib/auth.js';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

// ---------------------------------------------------------------------------
// Full chart of accounts (verbatim from PDF, 2026-10-21 extraction).
// r:true  = restricted (admin/partner only – NEVER sent to field_ops).
// hl = headingLevel: 1=major group, 2=section within group, 0=line item.
// g  = display group label.
// s  = section label within the group (null if none).
// ---------------------------------------------------------------------------
const CODES = [
  // ---- Balance Sheet: Assets (admin/partner only) ----
  { code:'1000',  name:'Checking - Chase Bank',                      type:'Bank',                    js:false, r:true, g:'Balance Sheet', hl:0, s:null },
  { code:'1100',  name:'Checking - State Bank',                      type:'Bank',                    js:false, r:true, g:'Balance Sheet', hl:0, s:null },
  { code:'1150',  name:'Savings - State Bank',                       type:'Bank',                    js:false, r:true, g:'Balance Sheet', hl:0, s:null },
  { code:'1200',  name:'AR',                                         type:'Accounts Receivable',     js:false, r:true, g:'Balance Sheet', hl:0, s:null },
  { code:'12000', name:'Undeposited Funds',                          type:'Other Current Asset',     js:false, r:true, g:'Balance Sheet', hl:0, s:null },
  { code:'1500',  name:'Office Equipment',                           type:'Fixed Asset',             js:false, r:true, g:'Balance Sheet', hl:0, s:null },
  { code:'1530',  name:'Agg Pier Equipment Asset Purchase',          type:'Fixed Asset',             js:false, r:true, g:'Balance Sheet', hl:0, s:null },
  { code:'1535',  name:'Helical Equipment Asset Purchase',           type:'Fixed Asset',             js:false, r:true, g:'Balance Sheet', hl:0, s:null },
  { code:'1540',  name:'Support Equipment Asset Purchase',           type:'Fixed Asset',             js:false, r:true, g:'Balance Sheet', hl:0, s:null },
  { code:'1545',  name:'Small Tools Equipment',                      type:'Fixed Asset',             js:false, r:true, g:'Balance Sheet', hl:0, s:null },
  { code:'1700',  name:'Accumulated Depreciation',                   type:'Fixed Asset',             js:false, r:true, g:'Balance Sheet', hl:0, s:null },
  // ---- Balance Sheet: Liabilities (admin/partner only) ----
  { code:'2000',  name:'AP',                                         type:'Accounts Payable',        js:false, r:true, g:'Balance Sheet', hl:0, s:null },
  { code:'2100',  name:'Chase CC Payable',                           type:'Credit Card',             js:false, r:true, g:'Balance Sheet', hl:0, s:null },
  { code:'2200',  name:'Payroll Tax Liabilities',                    type:'Other Current Liability', js:false, r:true, g:'Balance Sheet', hl:0, s:null },
  { code:'2210',  name:'Federal Withholding',                        type:'Other Current Liability', js:false, r:true, g:'Balance Sheet', hl:0, s:null },
  { code:'2220',  name:'SS WH',                                      type:'Other Current Liability', js:false, r:true, g:'Balance Sheet', hl:0, s:null },
  { code:'2230',  name:'Medicare WH',                                type:'Other Current Liability', js:false, r:true, g:'Balance Sheet', hl:0, s:null },
  { code:'2232',  name:'Indiana SIT withholding',                    type:'Other Current Liability', js:false, r:true, g:'Balance Sheet', hl:0, s:null },
  { code:'2234',  name:'Indiana CIT withholding',                    type:'Other Current Liability', js:false, r:true, g:'Balance Sheet', hl:0, s:null },
  { code:'2240',  name:'Accrued FICA Expenses',                      type:'Other Current Liability', js:false, r:true, g:'Balance Sheet', hl:0, s:null },
  { code:'2250',  name:'Accrued FUTA Expenses',                      type:'Other Current Liability', js:false, r:true, g:'Balance Sheet', hl:0, s:null },
  { code:'2260',  name:'Accrued SUTA Expenses',                      type:'Other Current Liability', js:false, r:true, g:'Balance Sheet', hl:0, s:null },
  { code:'2300',  name:'PF Business Line of Credit - State Bank',    type:'Other Current Liability', js:false, r:true, g:'Balance Sheet', hl:0, s:null },
  { code:'2310',  name:'HWG Loan to PF',                             type:'Other Current Liability', js:false, r:true, g:'Balance Sheet', hl:0, s:null },
  { code:'2320',  name:'Jonathan R Loan to PF',                      type:'Other Current Liability', js:false, r:true, g:'Balance Sheet', hl:0, s:null },
  { code:'2330',  name:'Derek F Loan to PF',                         type:'Other Current Liability', js:false, r:true, g:'Balance Sheet', hl:0, s:null },
  { code:'2400',  name:'Sales (Use) Tax Payable',                    type:'Other Current Liability', js:false, r:true, g:'Balance Sheet', hl:0, s:null },
  { code:'2450',  name:'Due to HWG',                                 type:'Other Current Liability', js:false, r:true, g:'Balance Sheet', hl:0, s:null },
  { code:'2500',  name:'Loan Payable - State Bank',                  type:'Long Term Liability',     js:false, r:true, g:'Balance Sheet', hl:0, s:null },
  // ---- Balance Sheet: Equity (admin/partner only) ----
  { code:'3000',  name:'Opening Acct Bal Equity',                    type:'Equity',                  js:false, r:true, g:'Balance Sheet', hl:0, s:null },
  { code:'3030',  name:'HWG - Loan to PF',                           type:'Equity',                  js:false, r:true, g:'Balance Sheet', hl:0, s:null },
  { code:'3040',  name:'HWG - Equity',                               type:'Equity',                  js:false, r:true, g:'Balance Sheet', hl:0, s:null },
  { code:'3050',  name:'Jonathan - Loan to PF',                      type:'Equity',                  js:false, r:true, g:'Balance Sheet', hl:0, s:null },
  { code:'3060',  name:'Jonathan - Equity',                          type:'Equity',                  js:false, r:true, g:'Balance Sheet', hl:0, s:null },
  { code:'3070',  name:'Derek - Loan to PF',                         type:'Equity',                  js:false, r:true, g:'Balance Sheet', hl:0, s:null },
  { code:'3080',  name:'Derek - Equity',                             type:'Equity',                  js:false, r:true, g:'Balance Sheet', hl:0, s:null },
  { code:'3200',  name:'Retained Earnings',                          type:'Equity',                  js:false, r:true, g:'Balance Sheet', hl:0, s:null },

  // ---- Income (admin/partner only) ----
  { code:'4000',  name:'Job Income',                                  type:'Heading',                 js:false, r:true, g:'Income',          hl:1, s:null },
  { code:'4100',  name:'Agg Pier Income',                             type:'Income',                  js:false, r:true, g:'Income',          hl:0, s:null },
  { code:'4200',  name:'Helical Piling Income',                       type:'Income',                  js:false, r:true, g:'Income',          hl:0, s:null },
  { code:'4900',  name:'Retainage Income',                            type:'Income',                  js:false, r:true, g:'Income',          hl:0, s:null },

  // ---- Job Expenses (ALL roles) ----
  { code:'5000',  name:'Job Expenses',                                type:'Cost of Goods Sold',      js:true,  r:false, g:'Job Expenses',   hl:1, s:null },
  { code:'5050',  name:'Professional Services',                       type:'Cost of Goods Sold',      js:true,  r:false, g:'Job Expenses',   hl:2, s:'Professional Services' },
  { code:'5051',  name:'Engineering & Design Services',               type:'Cost of Goods Sold',      js:true,  r:false, g:'Job Expenses',   hl:0, s:'Professional Services' },
  { code:'5052',  name:'Material Testing',                            type:'Cost of Goods Sold',      js:true,  r:false, g:'Job Expenses',   hl:0, s:'Professional Services' },
  { code:'5053',  name:'Surveying & Staking',                         type:'Cost of Goods Sold',      js:true,  r:false, g:'Job Expenses',   hl:0, s:'Professional Services' },
  { code:'5100',  name:'Jobsite Materials',                           type:'Cost of Goods Sold',      js:true,  r:false, g:'Job Expenses',   hl:2, s:'Jobsite Materials' },
  { code:'5110',  name:'Stone Materials',                             type:'Cost of Goods Sold',      js:true,  r:false, g:'Job Expenses',   hl:0, s:'Jobsite Materials' },
  { code:'5120',  name:'Rigid Inclusion Materials',                   type:'Cost of Goods Sold',      js:true,  r:false, g:'Job Expenses',   hl:0, s:'Jobsite Materials' },
  { code:'5130',  name:'Helical Piling Materials',                    type:'Cost of Goods Sold',      js:true,  r:false, g:'Job Expenses',   hl:0, s:'Jobsite Materials' },
  { code:'5140',  name:'Equipment Consumables',                       type:'Cost of Goods Sold',      js:true,  r:false, g:'Job Expenses',   hl:0, s:'Jobsite Materials' },
  { code:'5190',  name:'Ground Improvement Testing',                  type:'Cost of Goods Sold',      js:true,  r:false, g:'Job Expenses',   hl:0, s:'Jobsite Materials' },
  { code:'5200',  name:'Job Labor',                                   type:'Cost of Goods Sold',      js:true,  r:false, g:'Job Expenses',   hl:2, s:'Job Labor' },
  { code:'5210',  name:'Subcontractors Labor',                        type:'Cost of Goods Sold',      js:true,  r:false, g:'Job Expenses',   hl:0, s:'Job Labor' },
  { code:'5215',  name:'Willis Dirt Works Retainer',                  type:'Cost of Goods Sold',      js:true,  r:false, g:'Job Expenses',   hl:0, s:'Job Labor' },
  { code:'5220',  name:'Employee Job Labor',                          type:'Cost of Goods Sold',      js:true,  r:false, g:'Job Expenses',   hl:0, s:'Job Labor' },
  { code:'5230',  name:'Payroll Tax Expenses',                        type:'Cost of Goods Sold',      js:true,  r:false, g:'Job Expenses',   hl:0, s:'Job Labor' },
  { code:'5300',  name:'Job Travel',                                  type:'Cost of Goods Sold',      js:true,  r:false, g:'Job Expenses',   hl:2, s:'Job Travel' },
  { code:'5310',  name:'Travel - Air',                                type:'Cost of Goods Sold',      js:true,  r:false, g:'Job Expenses',   hl:0, s:'Job Travel' },
  { code:'5320',  name:'Travel - Car Rental/Uber',                    type:'Cost of Goods Sold',      js:true,  r:false, g:'Job Expenses',   hl:0, s:'Job Travel' },
  { code:'5330',  name:'Travel - Mileage',                            type:'Cost of Goods Sold',      js:true,  r:false, g:'Job Expenses',   hl:0, s:'Job Travel' },
  { code:'5340',  name:'Travel - Hotel/Housing',                      type:'Cost of Goods Sold',      js:true,  r:false, g:'Job Expenses',   hl:0, s:'Job Travel' },
  { code:'5350',  name:'Travel - Parking',                            type:'Cost of Goods Sold',      js:true,  r:false, g:'Job Expenses',   hl:0, s:'Job Travel' },
  { code:'5360',  name:'Travel - Meals/Per Diem',                     type:'Cost of Goods Sold',      js:true,  r:false, g:'Job Expenses',   hl:0, s:'Job Travel' },
  { code:'5400',  name:'Jobsite Equipment Expenses',                  type:'Cost of Goods Sold',      js:true,  r:false, g:'Job Expenses',   hl:2, s:'Jobsite Equipment Expenses' },
  { code:'5405',  name:'Equipment Transportation',                    type:'Cost of Goods Sold',      js:true,  r:false, g:'Job Expenses',   hl:0, s:'Jobsite Equipment Expenses' },
  { code:'5406',  name:'AP Rig',                                      type:'Cost of Goods Sold',      js:true,  r:false, g:'Job Expenses',   hl:0, s:'Jobsite Equipment Expenses' },
  { code:'5407',  name:'PF Predrill',                                 type:'Cost of Goods Sold',      js:true,  r:false, g:'Job Expenses',   hl:0, s:'Jobsite Equipment Expenses' },
  { code:'5408',  name:'Gooseneck Parts Load',                        type:'Cost of Goods Sold',      js:true,  r:false, g:'Job Expenses',   hl:0, s:'Jobsite Equipment Expenses' },
  { code:'5409',  name:'Fall Off Load/Misc Mob',                      type:'Cost of Goods Sold',      js:true,  r:false, g:'Job Expenses',   hl:0, s:'Jobsite Equipment Expenses' },
  { code:'5410',  name:'Equipment Rental for Jobs',                   type:'Cost of Goods Sold',      js:true,  r:false, g:'Job Expenses',   hl:0, s:'Jobsite Equipment Expenses' },
  { code:'5420',  name:'Equipment Maintenance & Repairs',             type:'Cost of Goods Sold',      js:true,  r:false, g:'Job Expenses',   hl:0, s:'Jobsite Equipment Expenses' },
  { code:'5430',  name:'Equipment Fuel',                              type:'Cost of Goods Sold',      js:true,  r:false, g:'Job Expenses',   hl:0, s:'Jobsite Equipment Expenses' },
  { code:'5600',  name:'Small Tools & Equipment - Job Specific',      type:'Cost of Goods Sold',      js:true,  r:false, g:'Job Expenses',   hl:2, s:null },
  { code:'5700',  name:'Permits & Fees',                              type:'Cost of Goods Sold',      js:true,  r:false, g:'Job Expenses',   hl:2, s:'Permits & Fees' },
  { code:'5710',  name:'Printing / Drawing Expense',                  type:'Cost of Goods Sold',      js:true,  r:false, g:'Job Expenses',   hl:0, s:'Permits & Fees' },
  { code:'5720',  name:'Bonds',                                       type:'Cost of Goods Sold',      js:true,  r:false, g:'Job Expenses',   hl:0, s:'Permits & Fees' },
  { code:'5730',  name:'Permits & Licenses',                          type:'Cost of Goods Sold',      js:true,  r:false, g:'Job Expenses',   hl:0, s:'Permits & Fees' },
  { code:'5800',  name:'Project Closeout',                            type:'Cost of Goods Sold',      js:false, r:false, g:'Job Expenses',   hl:2, s:'Project Closeout' },
  { code:'5810',  name:'As Built Documents',                          type:'Cost of Goods Sold',      js:true,  r:false, g:'Job Expenses',   hl:0, s:'Project Closeout' },
  { code:'5820',  name:'Warranty',                                    type:'Cost of Goods Sold',      js:true,  r:false, g:'Job Expenses',   hl:0, s:'Project Closeout' },
  { code:'5900',  name:'Project Incentives',                          type:'Cost of Goods Sold',      js:true,  r:false, g:'Job Expenses',   hl:2, s:'Project Incentives' },
  { code:'5910',  name:'Commissions',                                 type:'Cost of Goods Sold',      js:true,  r:false, g:'Job Expenses',   hl:0, s:'Project Incentives' },
  { code:'5920',  name:'Project Bonuses',                             type:'Cost of Goods Sold',      js:true,  r:false, g:'Job Expenses',   hl:0, s:'Project Incentives' },
  { code:'5950',  name:'Other Job Related Costs / Contingency',       type:'Cost of Goods Sold',      js:true,  r:false, g:'Job Expenses',   hl:0, s:'Project Incentives' },

  // ---- Management Expenses (admin/partner only) ----
  { code:'6000',  name:'Management Expenses',                         type:'Expense',                 js:false, r:true, g:'Management Expenses', hl:1, s:null },
  { code:'6100',  name:'Business Development',                        type:'Expense',                 js:false, r:true, g:'Management Expenses', hl:0, s:null },
  { code:'6200',  name:'Estimating',                                  type:'Expense',                 js:false, r:true, g:'Management Expenses', hl:0, s:null },
  { code:'6300',  name:'Project Manager',                             type:'Expense',                 js:false, r:true, g:'Management Expenses', hl:0, s:null },
  { code:'6400',  name:'Partner Guaranteed Payments',                 type:'Expense',                 js:false, r:true, g:'Management Expenses', hl:0, s:null },
  { code:'6500',  name:'Accounting',                                  type:'Expense',                 js:false, r:true, g:'Management Expenses', hl:0, s:null },
  { code:'6600',  name:'General Superintendent',                      type:'Expense',                 js:false, r:true, g:'Management Expenses', hl:0, s:null },
  { code:'6700',  name:'Field Payroll (offsite)',                      type:'Expense',                 js:false, r:true, g:'Management Expenses', hl:0, s:null },
  { code:'6800',  name:'Management Payroll taxes',                    type:'Expense',                 js:false, r:true, g:'Management Expenses', hl:0, s:null },

  // ---- Professional Fees (admin/partner only) ----
  { code:'7000',  name:'Professional Fees',                           type:'Expense',                 js:false, r:true, g:'Professional Fees', hl:1, s:null },
  { code:'7010',  name:'Acct & Tax Services',                         type:'Expense',                 js:false, r:true, g:'Professional Fees', hl:0, s:null },
  { code:'7020',  name:'Attorney Services',                           type:'Expense',                 js:false, r:true, g:'Professional Fees', hl:0, s:null },
  { code:'7040',  name:'Consulting Services',                         type:'Expense',                 js:false, r:true, g:'Professional Fees', hl:0, s:null },
  { code:'7050',  name:'Engineering Services',                        type:'Expense',                 js:false, r:true, g:'Professional Fees', hl:0, s:null },
  { code:'7060',  name:'Safety Management Consultant',                type:'Expense',                 js:false, r:true, g:'Professional Fees', hl:0, s:null },

  // ---- Insurance (admin/partner only) ----
  { code:'7100',  name:'Insurance Expense',                           type:'Expense',                 js:false, r:true, g:'Insurance', hl:1, s:null },
  { code:'7110',  name:'Equipment Insurance',                         type:'Expense',                 js:false, r:true, g:'Insurance', hl:0, s:null },
  { code:'7120',  name:'Gen Liability Insurance',                     type:'Expense',                 js:false, r:true, g:'Insurance', hl:0, s:null },
  { code:'7125',  name:'Umbrella / Excess Liability',                 type:'Expense',                 js:false, r:true, g:'Insurance', hl:0, s:null },
  { code:'7130',  name:'Workers Comp Insurance',                      type:'Expense',                 js:false, r:true, g:'Insurance', hl:0, s:null },
  { code:'7140',  name:'Professional Liability Insurance',            type:'Expense',                 js:false, r:true, g:'Insurance', hl:0, s:null },
  { code:'7150',  name:'Contractors Pollution Liability Insurance',   type:'Expense',                 js:false, r:true, g:'Insurance', hl:0, s:null },
  { code:'7180',  name:'Partners Medical Insurance',                  type:'Expense',                 js:false, r:true, g:'Insurance', hl:0, s:null },
  { code:'7181',  name:'Partners Health Insurance',                   type:'Expense',                 js:false, r:true, g:'Insurance', hl:0, s:null },
  { code:'7182',  name:'Partners Dental Insurance',                   type:'Expense',                 js:false, r:true, g:'Insurance', hl:0, s:null },
  { code:'7183',  name:'Partners Vision Insurance',                   type:'Expense',                 js:false, r:true, g:'Insurance', hl:0, s:null },
  { code:'7184',  name:'Partners HSA Contributions',                  type:'Expense',                 js:false, r:true, g:'Insurance', hl:0, s:null },
  { code:'7190',  name:'Employee Medical Insurance',                  type:'Expense',                 js:false, r:true, g:'Insurance', hl:0, s:null },
  { code:'7191',  name:'Employee Health Insurance',                   type:'Expense',                 js:false, r:true, g:'Insurance', hl:0, s:null },
  { code:'7192',  name:'Employee Dental Insurance',                   type:'Expense',                 js:false, r:true, g:'Insurance', hl:0, s:null },
  { code:'7193',  name:'Employee Vision Insurance',                   type:'Expense',                 js:false, r:true, g:'Insurance', hl:0, s:null },

  // ---- Business Overhead (ALL roles, EXCEPT 7270/7272 which are admin/partner only) ----
  { code:'7200',  name:'Business Overhead',                           type:'Expense',                 js:false, r:false, g:'Business Overhead', hl:1, s:null },
  { code:'7201',  name:'Business Licenses',                           type:'Expense',                 js:false, r:false, g:'Business Overhead', hl:0, s:null },
  { code:'7230',  name:'Meals & Entertainment',                       type:'Expense',                 js:false, r:false, g:'Business Overhead', hl:0, s:null },
  { code:'7240',  name:'IT Small Equipment & Software',               type:'Expense',                 js:false, r:false, g:'Business Overhead', hl:0, s:null },
  { code:'7245',  name:'Technology Dues & Subscriptions',             type:'Expense',                 js:false, r:false, g:'Business Overhead', hl:0, s:null },
  { code:'7250',  name:'Telephone Expense',                           type:'Expense',                 js:false, r:false, g:'Business Overhead', hl:0, s:null },
  { code:'7260',  name:'Office Supplies',                             type:'Expense',                 js:false, r:false, g:'Business Overhead', hl:0, s:null },
  { code:'7270',  name:'Bank Service Charges',                        type:'Expense',                 js:false, r:true,  g:'Business Overhead', hl:0, s:null },
  { code:'7272',  name:'Payroll Processing Fees',                     type:'Expense',                 js:false, r:true,  g:'Business Overhead', hl:0, s:null },
  { code:'7280',  name:'Miscellaneous',                               type:'Expense',                 js:false, r:false, g:'Business Overhead', hl:0, s:null },

  // ---- Interest Expense (admin/partner only) ----
  { code:'7300',  name:'Interest Expense',                            type:'Expense',                 js:false, r:true, g:'Interest Expense', hl:1, s:null },
  { code:'7310',  name:'Credit Card Interest',                        type:'Expense',                 js:false, r:true, g:'Interest Expense', hl:0, s:null },
  { code:'7320',  name:'SBA Loan #1 Interest',                        type:'Expense',                 js:false, r:true, g:'Interest Expense', hl:0, s:null },
  { code:'7321',  name:'SBA Loan #2 Interest',                        type:'Expense',                 js:false, r:true, g:'Interest Expense', hl:0, s:null },
  { code:'7325',  name:'LOC Interest',                                type:'Expense',                 js:false, r:true, g:'Interest Expense', hl:0, s:null },

  // ---- Advertising & Marketing (ALL roles) ----
  { code:'7400',  name:'Advertising & Marketing',                     type:'Expense',                 js:false, r:false, g:'Advertising & Marketing', hl:1, s:null },
  { code:'7410',  name:'Website',                                     type:'Expense',                 js:false, r:false, g:'Advertising & Marketing', hl:0, s:null },
  { code:'7420',  name:'Advertising',                                 type:'Expense',                 js:false, r:false, g:'Advertising & Marketing', hl:0, s:null },
  { code:'7430',  name:'Company Apparel',                             type:'Expense',                 js:false, r:false, g:'Advertising & Marketing', hl:0, s:null },

  // ---- Non-Job Materials & Equipment Repair (ALL roles) ----
  { code:'7500',  name:'Non Job Mtls / Equipmt Repair',               type:'Expense',                 js:false, r:false, g:'Non-Job Materials & Equipment', hl:1, s:null },
  { code:'7501',  name:'Safety Materials',                            type:'Expense',                 js:false, r:false, g:'Non-Job Materials & Equipment', hl:0, s:null },
  { code:'7505',  name:'Equipment Transportation',                    type:'Expense',                 js:false, r:false, g:'Non-Job Materials & Equipment', hl:0, s:null },
  { code:'7507',  name:'Small Tools',                                 type:'Expense',                 js:false, r:false, g:'Non-Job Materials & Equipment', hl:0, s:null },
  { code:'7509',  name:'Consumables-Spent,Drained,Exhausted',         type:'Expense',                 js:false, r:false, g:'Non-Job Materials & Equipment', hl:0, s:null },
  { code:'7511',  name:'Equip Repair - Labor Payroll',                type:'Expense',                 js:false, r:false, g:'Non-Job Materials & Equipment', hl:0, s:null },
  { code:'7512',  name:'Equip Repair - PR taxes',                     type:'Expense',                 js:false, r:false, g:'Non-Job Materials & Equipment', hl:0, s:null },
  { code:'7513',  name:'Shipping Goods/Parts',                        type:'Expense',                 js:false, r:false, g:'Non-Job Materials & Equipment', hl:0, s:null },
  { code:'7515',  name:'Equipment rent',                              type:'Expense',                 js:false, r:false, g:'Non-Job Materials & Equipment', hl:0, s:null },
  { code:'7516',  name:'Excavator Parts / Service / Repair',          type:'Expense',                 js:false, r:false, g:'Non-Job Materials & Equipment', hl:0, s:null },
  { code:'7517',  name:'Mast Vibro Parts / Service / Repair',         type:'Expense',                 js:false, r:false, g:'Non-Job Materials & Equipment', hl:0, s:null },
  { code:'7518',  name:'Drill Tools Parts / Service / Repair',        type:'Expense',                 js:false, r:false, g:'Non-Job Materials & Equipment', hl:0, s:null },
  { code:'7519',  name:'Support Equipment Parts / Service / Repair',  type:'Expense',                 js:false, r:false, g:'Non-Job Materials & Equipment', hl:0, s:null },
  { code:'7520',  name:'Auto & Truck Expenses',                       type:'Expense',                 js:false, r:false, g:'Non-Job Materials & Equipment', hl:2, s:'Auto & Truck' },
  { code:'7521',  name:'Employee Vehicle Allowance',                  type:'Expense',                 js:false, r:false, g:'Non-Job Materials & Equipment', hl:0, s:'Auto & Truck' },
  { code:'7522',  name:'Vehicle Maintenance',                         type:'Expense',                 js:false, r:false, g:'Non-Job Materials & Equipment', hl:0, s:'Auto & Truck' },
  { code:'7525',  name:'Fuel Expense',                                type:'Expense',                 js:false, r:false, g:'Non-Job Materials & Equipment', hl:0, s:'Auto & Truck' },

  // ---- Personnel Travel - Non Job (ALL roles) ----
  { code:'7600',  name:'Personnel Travel - Non Job',                  type:'Expense',                 js:false, r:false, g:'Personnel Travel - Non Job', hl:1, s:null },
  { code:'7610',  name:'Transportation (Non Job)',                    type:'Expense',                 js:false, r:false, g:'Personnel Travel - Non Job', hl:0, s:null },
  { code:'7620',  name:'Hotels (Non Job)',                            type:'Expense',                 js:false, r:false, g:'Personnel Travel - Non Job', hl:0, s:null },
  { code:'7630',  name:'Meals (Non Job)',                             type:'Expense',                 js:false, r:false, g:'Personnel Travel - Non Job', hl:0, s:null },
  { code:'7635',  name:'Non Job Per Diem',                            type:'Expense',                 js:false, r:false, g:'Personnel Travel - Non Job', hl:0, s:null },

  // ---- Farm Yard (ALL roles) ----
  { code:'7700',  name:'Farm Yard Rent / Expense Reimb',              type:'Expense',                 js:false, r:false, g:'Farm Yard', hl:1, s:null },

  // ---- Depreciation & Other (admin/partner only) ----
  { code:'7800',  name:'Depreciation Expense',                        type:'Expense',                 js:false, r:true, g:'Depreciation & Other', hl:1, s:null },
  { code:'8010',  name:'Other Income',                                type:'Other Income',            js:false, r:true, g:'Depreciation & Other', hl:0, s:null },
  { code:'8015',  name:'Interest Income',                             type:'Other Income',            js:false, r:true, g:'Depreciation & Other', hl:0, s:null },
  { code:'8020',  name:'Other Expense',                               type:'Other Expense',           js:false, r:true, g:'Depreciation & Other', hl:0, s:null },
  { code:'8500',  name:'Ask My Accountant',                           type:'Other Expense',           js:false, r:true, g:'Depreciation & Other', hl:0, s:null },
];

// Codes the field_ops role may never receive, regardless of path.
// The `r:true` flag marks these rows — no hardcoded list of codes needed here,
// the filter is applied from the data itself.

export async function onRequestGet(context) {
  const session = context.data && context.data.session;
  const denied = requireArea(session, 'field_ops');
  if (denied) return denied;

  const role = session && session.role;
  // Privileged roles see everything; field crew sees only unrestricted codes.
  const isPrivileged = role === 'admin' || role === 'partner';
  const visible = isPrivileged ? CODES : CODES.filter(c => !c.r);

  // Shape the outbound objects (drop the internal flags `r`).
  const codes = visible.map(c => ({
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
