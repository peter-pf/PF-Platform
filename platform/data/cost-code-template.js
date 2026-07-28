// AUTO-DERIVED from data/budget-actual-poet.js — the STANDARD cost-code template.
// Money is ZEROED; a per-project saved budget (KV via /api/project-budget) merges on top.
// Groups + row order + cost_code + description + vendor + is_subtotal preserved so
// category subtotals and the grand total compute correctly per project.
// Regenerate: node sync/build-cost-code-template.js (reads POET codes, zeroes money).
window.PF_COST_CODE_TEMPLATE = {
  "version": 1,
  "label": "Standard Cost Code Template",
  "note": "Derived from the POET (26-002) Budget vs Actual code list — the STANDARD ~69 cost codes for every job (Brad confirmed 2026-07-28). Money ZEROED; per-project budgets merge on top at render.",
  "source": "data/budget-actual-poet.js (window.PF_BUDGET_ACTUAL_POET)",
  "groups": [
    {
      "title": "General Conditions / OH",
      "rows": [
        {
          "cost_code": "",
          "description": "General Conditions",
          "vendor": "",
          "notes": "",
          "is_subtotal": true,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "5600",
          "description": "Small Tools & Equipment",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "",
          "description": "Permits & Fees",
          "vendor": "",
          "notes": "",
          "is_subtotal": true,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "5710",
          "description": "Reprographics",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "5720",
          "description": "Bonds",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "5730",
          "description": "Permits & Licenses",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "6000",
          "description": "Mgmt & Office Personnel",
          "vendor": "",
          "notes": "",
          "is_subtotal": true,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "6100",
          "description": "Business Development",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "6200",
          "description": "Estimating",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "6300",
          "description": "Project Management",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "6400",
          "description": "Admin",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "6500",
          "description": "Accounting",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "6600",
          "description": "General Superintendent / Operations Mgr",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "7000",
          "description": "Additional General Conditions",
          "vendor": "",
          "notes": "",
          "is_subtotal": true,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "7020",
          "description": "Legal Fees / Attorney Services",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "7100",
          "description": "Insurance",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "7210",
          "description": "Safety",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "7230",
          "description": "Meals & Entertainment",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "7240",
          "description": "IT Small Equipment & Software",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "7245",
          "description": "Technology Dues & Subscriptions",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "7250",
          "description": "Cell Phone / iPad",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "7260",
          "description": "Office Equip & Supplies",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "7700",
          "description": "Yard Rental / Equip Storage Lease",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "5600",
          "description": "Storage Container",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "6910",
          "description": "Closeouts / As Builts",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "6920",
          "description": "Warranty",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        }
      ]
    },
    {
      "title": "Project Professional Services & Fees",
      "rows": [
        {
          "cost_code": "5050",
          "description": "Professional Services",
          "vendor": "",
          "notes": "",
          "is_subtotal": true,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "5051",
          "description": "Engineering & Design Services",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "5052",
          "description": "Material Testing",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "5053",
          "description": "Surveying & Staking",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        }
      ]
    },
    {
      "title": "Project Material Costs",
      "rows": [
        {
          "cost_code": "5110",
          "description": "Stone Material Costs",
          "vendor": "",
          "notes": "",
          "is_subtotal": true,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "5110",
          "description": "Vibratory Stone Columns - Stone",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "5110",
          "description": "Vibratory Stone Columns - Trucking to Site",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "5120",
          "description": "Rigid Inclusions",
          "vendor": "",
          "notes": "",
          "is_subtotal": true,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "5120",
          "description": "Rigid Inclusion Material Cost",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "5130",
          "description": "Helical Material Costs",
          "vendor": "",
          "notes": "",
          "is_subtotal": true,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "5130",
          "description": "Round Shaft Helical Piles (30%)",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "5130",
          "description": "Helical Pile Accessories (30%)",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "5130",
          "description": "Freight",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "5190",
          "description": "Job Testing",
          "vendor": "",
          "notes": "",
          "is_subtotal": true,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "5190",
          "description": "Ground Improvement Testing",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        }
      ]
    },
    {
      "title": "Project Labor Costs",
      "rows": [
        {
          "cost_code": "5200",
          "description": "Onsite Job Labor",
          "vendor": "",
          "notes": "",
          "is_subtotal": true,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "5210",
          "description": "Subcontractor Labor",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "5220",
          "description": "Employee Job Labor",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "5230",
          "description": "Employee Labor Burden (18%)",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "5300",
          "description": "Job Travel",
          "vendor": "",
          "notes": "",
          "is_subtotal": true,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "5310",
          "description": "Travel - Air",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "5320",
          "description": "Travel - Car Rental/Uber",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "5330",
          "description": "Travel - Mileage",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "5340",
          "description": "Travel - Hotel/Housing",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "5350",
          "description": "Travel - Parking",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "5360",
          "description": "Travel - Meals / Per Diem",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        }
      ]
    },
    {
      "title": "Project Equipment Costs",
      "rows": [
        {
          "cost_code": "5405",
          "description": "Equipment Transport",
          "vendor": "",
          "notes": "",
          "is_subtotal": true,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "5405",
          "description": "VSC Rig Mob/ Demob",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "5405",
          "description": "Predrill Mob/Demob",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "5405",
          "description": "Fall Off Load",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "5405",
          "description": "Misc Mob Costs",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "5400",
          "description": "Equipment Costs",
          "vendor": "",
          "notes": "",
          "is_subtotal": true,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "",
          "description": "PF Owned Equipment",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "5410",
          "description": "Rental Equipment",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "5420",
          "description": "Equipment Maintenance & Repairs",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "5430",
          "description": "Equipment Fuel",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "5500",
          "description": "Auto & Truck Expenses",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        }
      ]
    },
    {
      "title": "Project Incentives & Contingencies",
      "rows": [
        {
          "cost_code": "5900",
          "description": "Project Incentives",
          "vendor": "",
          "notes": "",
          "is_subtotal": true,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "5910",
          "description": "Commissions",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "5920",
          "description": "Project Bonuses",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "5950",
          "description": "Contingency",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        }
      ]
    },
    {
      "title": "Pier Foundations Fee",
      "rows": [
        {
          "cost_code": "",
          "description": "PF Fee/Profit",
          "vendor": "",
          "notes": "",
          "is_subtotal": true,
          "budget": 0,
          "actual": 0,
          "variance": 0
        },
        {
          "cost_code": "",
          "description": "PF Fee / Profit",
          "vendor": "",
          "notes": "",
          "is_subtotal": false,
          "budget": 0,
          "actual": 0,
          "variance": 0
        }
      ]
    }
  ]
};
