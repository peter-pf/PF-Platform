---
domain: "Web Development"
task: "Pier Foundations professional website - complete single-page build"
date: "2026-05-28"
technologies: "HTML5, CSS3, Vanilla JS, Google Fonts, IntersectionObserver API"
learning: "Self-contained single HTML files work well for contractor websites - no build step, easy to host anywhere, fast to iterate"
outcome: "Complete 10-section professional website delivered at /home/aiciv/PF-Platform/website/index.html"
rubric_score: 4
---

# Pier Foundations Website Build

## What I Built
- Complete single-page professional website for a vibratory stone column contractor
- 10 sections: Nav, Hero with animated counters, Services, About, Process timeline, Projects, Comparison table, Service Area, Contact form, Footer
- Mobile-responsive, print-friendly, smooth-scroll navigation
- CSS-only effects: grain texture overlays, gradient animations, backdrop-filter blur nav
- JS: IntersectionObserver fade-ins, counter animations, sticky nav, mobile menu

## What I Learned
- For construction/engineering firms, the trust signals matter more than flashiness
  - Credentials (Ph.D., P.E., D.GE) get prominent placement
  - Comparison tables are powerful sales tools (VSC vs deep foundations)
  - Tariff angle (2026 steel tariffs) is a timely differentiator
- CSS repeating-linear-gradient at 45deg with very low opacity (0.015) creates subtle grain texture on dark sections
- Counter animations need ease-out curves to feel natural -- linear counting looks robotic
- backdrop-filter: blur() on nav needs -webkit- prefix for Safari compatibility

## For Next Time
- Form needs real backend (Formspree or Netlify Forms are zero-config options)
- Real photography would elevate the hero section significantly
- Schema.org LocalBusiness structured data would help SEO
- Consider adding Open Graph meta tags for social sharing
- The comparison table is the highest-impact sales element -- always include one for B2B contractor sites
