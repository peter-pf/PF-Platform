# Runbook: Meeting Minutes Auto-Filing to OneNote

**For:** Peter (operator) and anyone re-authenticating the connection
**Feature:** Filing PF meeting minutes into the "Pier Foundations" OneNote
**Status:** Working as of June 30, 2026

---

## The one rule that breaks everything if you get it wrong

The OneNote connection MUST be authenticated as **peter@pierfoundations.com**.

If you ever re-authenticate and complete the sign-in **as Brad**, the connection re-binds to Brad's account, and Brad's account **cannot see the site notebook**. Filing then fails.

So when you re-auth:

1. Open a **private or incognito** browser window.
2. Sign in **as peter@pierfoundations.com**, never as Brad.
3. Complete the device-code flow there.

A normal browser window may already be signed in as Brad, which is exactly how this goes wrong. Private window, peter@, every time.

## Where the notebook lives

The "Pier Foundations" notebook is hosted on a SharePoint **site**, not a personal account. So you reach it at:

```
/sites/{SP_SITE_ID}/onenote
```

NOT `/me/onenote`. The `/me` path cannot see the site notebook.

Access is through `tools/onenote.py` using a delegated device-code refresh token with scope **Notes.ReadWrite.All**.

## Notebook structure

```
Pier Foundations (notebook)
  Meeting Notes (section group)
    BD Weekly
    GGG PF
    Investigation Meetings
    Meetings
    PF Action Items
    PF Leadership Meetings
    Weekly Owners Meetings
```

## Page naming convention

```
YY-MMDD - <short name>
```

Examples:

- `26-0629 - Owners Mtg`
- `26-0624 - PF Leadership Mtg`

## Which section does a meeting go in

| Meeting | Section |
|---------|---------|
| Weekly catch-up | Weekly Owners Meetings |
| Leadership | PF Leadership Meetings |

## Filing minutes, step by step

1. Author the minutes first.
2. Find the section for the meeting type (table above).
3. Look for the existing placeholder page for this date and meeting.
4. **If the page exists:** append the minutes into it.

   ```
   PATCH /sites/{SP_SITE_ID}/onenote/pages/{id}/content
   (append command)
   ```

5. **If no page exists:** create one.

   ```
   POST .../sections/{id}/pages
   Content-Type: application/xhtml+xml
   ```

Prefer the append path. Creating a page should only happen when there is genuinely no placeholder, so the team does not end up with duplicates.

## Confirming it worked

Open the section in OneNote and check the page exists with the right name and your minutes inside it. Last confirmed working filing: the 6/29 PF Weekly Catch Up minutes filed into **Weekly Owners Meetings**, page **"26-0629 - Owners Mtg"**.

## If filing fails

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Cannot see the notebook | Token bound to Brad, or using `/me/onenote` | Re-auth as peter@ in a private window, use `/sites/{SP_SITE_ID}/onenote` |
| Auth expired | Refresh token aged out | Re-run the device-code flow as peter@ in a private window |
| Duplicate pages appearing | Creating instead of appending | Find the placeholder page and append into it |
| Page in the wrong place | Wrong section mapping | Re-check the meeting-to-section table |
