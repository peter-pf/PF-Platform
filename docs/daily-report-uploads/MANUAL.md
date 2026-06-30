# User Manual: Daily Report File Uploads

**For:** Field crew submitting daily reports
**Feature:** Upload hand logs and GUHM data with the daily report
**Status:** Live

---

## What it does

When you submit a daily report you can now attach the day's hand logs and GUHM data right on the form. The platform files them into the project's SharePoint QAQC folder, organized by the report date, so the office and the engineer can find them without you sending anything separately.

## Where to find it

Scroll to the bottom of **Submit Daily Report**, just below the safety field. You will see two upload sections:

- **Upload Hand Logs**
- **Upload GUHM Data**

## How to upload

1. Fill out the daily report as usual.
2. At the bottom, tap **Upload Hand Logs** and pick your file or files.
3. Tap **Upload GUHM Data** and pick the GUHM file or files.
4. Submit the report.

Your files go to:

```
03 - Engineering & Design / QAQC / <report date> / Hand Logs
03 - Engineering & Design / QAQC / <report date> / GUHMA Data
```

The folders are created for you if they do not exist yet.

## File rules

| Rule | Limit |
|------|-------|
| Allowed types | .guh, .jpg, .jpeg, .png, .heic, .pdf, .zip, .xlsx |
| Max size per file | 50 MB |
| Max files per report | 25 |
| Max total per report | 120 MB |

## Good to know

- **Big files are fine.** Large files upload in chunks, so a big GUHM zip or a batch of photos will go through.
- **Nothing gets overwritten.** If a file with the same name already exists, your upload is saved under a slightly different name. The original stays put.
- **It picks the right project.** The platform finds the correct project folder automatically, including projects that have already been completed.

## If an upload does not go through

- Check the file type is on the allowed list above.
- Check the file is under 50 MB and you are under 25 files total.
- Make sure you have a connection. If you are on a weak signal, try again when you have better service.
- If it still fails, note it and let the office know so the file can be filed manually.
