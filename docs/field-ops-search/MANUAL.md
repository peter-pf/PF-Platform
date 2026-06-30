# User Manual: Field Operations Smart Search

**For:** Field crew and Field Operations users
**Feature:** Smart search in "Projects - Field"
**Status:** Live

---

## What it does

The search box on "Projects - Field" now answers questions, not just project names. You can ask who your stone vendor is, who the contact is, what materials are on a job, and more. The answer comes back as a card right under the search box.

It never shows pricing. Field Operations does not see any dollar values, by design.

## How to use it

1. Open **Projects - Field**.
2. Type your question in the search box the same way you would say it out loud.
3. Read the answer card that appears.

## Things you can ask

| You type | You get |
|----------|---------|
| `who is my stone vendor for POET?` | The stone vendor for that job plus the contact |
| `rock vendor 26-002` | Same answer, "rock" and "stone" mean the same thing here |
| `fuel for Madison` | The fuel vendor for that project |
| `trucking POET` | The trucking vendor and contact |
| `equipment 26-002` | The equipment listed on that job |

## Two things that make it smart

**Nicknames work.** You can type a friendly name like `POET` and it finds the right project number (26-002) for you. You do not have to memorize project numbers.

**Word choice does not matter.** Stone, rock, and aggregate all find the same answer. Same for fuel, trucking, and equipment. Ask it your way.

## What it will not do

- It will not show any pricing or dollar amounts. That is intentional and cannot be turned on for field roles.
- If it cannot answer yet, you get no card. A future update (Phase 2) will hand those harder questions to an AI helper that still stays field-safe.

## Tips

- Include the project (name or number) in your question so it knows where to look.
- Keep it short. "stone vendor POET" works as well as a full sentence.
- If you get nothing back, try the project number instead of the nickname, or rephrase using a plain word like "stone" or "trucking."

## Coming next (Phase 2)

A natural-language AI companion will answer the questions Phase 1 cannot. It runs on Hermes, Corey's own AI, never reads raw data directly, and stays field-safe with no financials. The approach is decided and the field-ops front end is in progress now. It turns on once the front end and the Hermes back end are melded together.
