// PF insurance baseline — from ACORD 25 COI "Pier Foundations LLC COI Coverages.pdf"
// Source of truth for comparing every job's contract insurance requirements.
// Broker: MJ Insurance (The MJ Companies), Carmel IN. COI dated 6/4/2026.
// Update this when the COI is renewed/changed (also in SharePoint).
window.PF_INSURANCE_BASELINE = {
  asOf: "2026-06-04",
  broker: "MJ Insurance (The MJ Companies), Carmel IN",
  coverages: [
    { line: "Commercial General Liability", carrier: "Evanston Insurance Co.", form: "Occurrence",
      limits: { eachOccurrence: 1000000, generalAggregate: 2000000, aggregateApplies: "Per Project",
                productsCompOpAgg: 2000000, personalAdvInjury: 1000000, damageToRented: 100000, medExp: "Excluded" } },
    { line: "Automobile Liability", carrier: "Evanston (HNOA)",
      limits: { hiredNonOwned: 1000000, ownedCombinedSingleLimit: null },
      note: "Hired & Non-Owned auto only ($1M). No owned/scheduled auto CSL on the COI — PF runs no titled road vehicles under auto liability." },
    { line: "Umbrella / Excess Liability", carrier: "Evanston + Houston Specialty (excess of $3M)",
      limits: { primaryUmbrellaEachOcc: 3000000, primaryUmbrellaAgg: 3000000, excessOcc: 5000000, excessAgg: 5000000, totalExcessStack: 8000000, retention: 0 } },
    { line: "Workers Compensation & Employers Liability", carrier: "Liberty Mutual",
      limits: { workersComp: "Statutory", elEachAccident: 1000000, elDiseaseEaEmployee: 1000000, elDiseasePolicyLimit: 1000000 },
      states: "IN incl; ND excl; OH/WA/WY monopolistic noted" },
    { line: "Professional Liability (E&O)", carrier: "Hiscox + Kinsale (excess of $2M)",
      limits: { occ: 2000000, agg: 2000000, excessOcc: 1000000, excessAgg: 1000000, totalOcc: 3000000, totalAgg: 3000000, deductible: 5000 } },
    { line: "Contractors Pollution Liability", carrier: "GuideOne",
      limits: { occ: 1000000, agg: 2000000, deductible: 5000 } },
    { line: "Rented / Leased Equipment", carrier: "Auto-Owners", limits: { limit: 750000 } }
  ],
  // Endorsement items that do NOT appear on the COI face and must be confirmed with the broker per job:
  endorsementWatchlist: [
    "Additional Insured (CG 20 10 + CG 20 37, ongoing + completed ops)",
    "Waiver of Subrogation",
    "Primary & Non-Contributory wording",
    "XCU (explosion/collapse/underground) — confirm not excluded on CGL"
  ]
};
