#!/usr/bin/env python3
"""
build-sops.py — Pull PDFs from SharePoint and regenerate the sops.html page.

This script downloads all PDF files from the SharePoint folder:
  Pier Foundations - Documents/01 - Admin/15 - SOP & Best Practices/Field

New or changed PDFs are written to field/sops/<filename>.pdf.
After downloading, the script reports what changed.

NOTE: sops.html is maintained by hand (the HTML rendering of each SOP is
hand-authored from the PDF content to ensure text fidelity and mobile
formatting). This script only manages the static PDF assets in field/sops/.
When the owner adds or updates an SOP, run this script to sync the PDF, then
hand-edit sops.html to reflect the new content.

USAGE:
    # From the repo root or any directory:
    source /home/aiciv/.env
    python3 field/scripts/build-sops.py

    # Or with a custom output directory:
    python3 field/scripts/build-sops.py --out /path/to/field/sops

CREDENTIALS:
    Requires AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID
    to be set in environment (loaded from /home/aiciv/.env).
    Uses the same app-only Graph token as the other PF tools.

OUTPUT:
    field/sops/*.pdf  — static PDF assets served behind portal auth
    Stdout: list of downloaded / skipped / changed files

DEPLOY AFTER:
    After pulling updated PDFs, run the standard deploy command:
        cd platform && source /home/aiciv/.env
        OMP_NUM_THREADS=1 GOMAXPROCS=1 npx wrangler pages deploy . \\
            --project-name pf-platform --branch website-build-20260609
    (Adjust project name for field portal if separate deployment.)
"""

import os
import sys
import json
import hashlib
import argparse
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from urllib.parse import quote

# ---------------------------------------------------------------------------
# Token acquisition  (same pattern as tools/inbox_check_daemon.py load_env/token)
# ---------------------------------------------------------------------------

def load_env() -> dict:
    """Load credentials from /home/aiciv/.env if not already in environment."""
    env_path = Path('/home/aiciv/.env')
    result = {}
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, _, v = line.partition('=')
            result[k.strip()] = v.strip().strip('"').strip("'")
    # Environment variables take precedence
    for k in ('AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_TENANT_ID'):
        if k in os.environ:
            result[k] = os.environ[k]
    return result


def token(creds: dict) -> str:
    """Acquire an app-only Graph access token via client_credentials flow."""
    tenant  = creds['AZURE_TENANT_ID']
    url     = f'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token'
    body    = (
        f"client_id={quote(creds['AZURE_CLIENT_ID'])}"
        f"&client_secret={quote(creds['AZURE_CLIENT_SECRET'])}"
        f"&scope=https://graph.microsoft.com/.default"
        f"&grant_type=client_credentials"
    ).encode()
    req = Request(url, data=body, method='POST')
    req.add_header('Content-Type', 'application/x-www-form-urlencoded')
    with urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())
    if 'access_token' not in data:
        raise RuntimeError(f"Token error: {data}")
    return data['access_token']


# ---------------------------------------------------------------------------
# SharePoint / Graph helpers
# ---------------------------------------------------------------------------

SITE_HOST   = 'pierfoundations.sharepoint.com'
SITE_PATH   = '/sites/PierFoundations'
SOP_FOLDER  = '01 - Admin/15 - SOP & Best Practices/Field'
# Drive is the default "Documents" library on the site
DRIVE_NAME  = 'Documents'


def graph_get(url: str, tok: str) -> dict:
    req = Request(url)
    req.add_header('Authorization', f'Bearer {tok}')
    req.add_header('Accept', 'application/json')
    with urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def get_drive_id(tok: str) -> str:
    """Find the drive ID for the Documents library on the PF site."""
    site_url = (
        f'https://graph.microsoft.com/v1.0/sites/'
        f'{SITE_HOST}:{SITE_PATH}'
    )
    site = graph_get(site_url, tok)
    site_id = site['id']

    drives_url = f'https://graph.microsoft.com/v1.0/sites/{site_id}/drives'
    drives = graph_get(drives_url, tok)
    for d in drives.get('value', []):
        if d.get('name') == DRIVE_NAME:
            return d['id']
    raise RuntimeError(
        f"Drive '{DRIVE_NAME}' not found on site. "
        f"Available: {[x['name'] for x in drives.get('value', [])]}"
    )


def list_folder(drive_id: str, folder_path: str, tok: str) -> list:
    """List children of folder_path in the drive. Returns list of item dicts."""
    encoded = quote(folder_path)
    url = (
        f'https://graph.microsoft.com/v1.0/drives/{drive_id}'
        f'/root:/{encoded}:/children'
        f'?$select=id,name,size,lastModifiedDateTime,file'
    )
    items = []
    while url:
        data = graph_get(url, tok)
        items.extend(data.get('value', []))
        url = data.get('@odata.nextLink')
    return items


def download_item(drive_id: str, item_id: str, tok: str) -> bytes:
    """Download file content via /content endpoint (follows redirect)."""
    url = f'https://graph.microsoft.com/v1.0/drives/{drive_id}/items/{item_id}/content'
    req = Request(url)
    req.add_header('Authorization', f'Bearer {tok}')
    with urlopen(req, timeout=60) as resp:
        return resp.read()


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description='Sync SOP PDFs from SharePoint')
    parser.add_argument(
        '--out',
        default=None,
        help='Output directory for PDF files (default: field/sops/ relative to script location)'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='List files that would be downloaded without writing anything'
    )
    args = parser.parse_args()

    # Resolve output directory
    if args.out:
        out_dir = Path(args.out)
    else:
        # script is at field/scripts/build-sops.py -> output is field/sops/
        out_dir = Path(__file__).parent.parent / 'sops'

    out_dir.mkdir(parents=True, exist_ok=True)
    print(f'Output directory: {out_dir.resolve()}')

    # Load credentials
    creds = load_env()
    for k in ('AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_TENANT_ID'):
        if k not in creds:
            print(f'ERROR: {k} not found in environment or /home/aiciv/.env', file=sys.stderr)
            sys.exit(1)

    print('Acquiring Graph token...')
    tok = token(creds)

    print('Locating SharePoint drive...')
    drive_id = get_drive_id(tok)
    print(f'  Drive ID: {drive_id}')

    print(f'Listing folder: {SOP_FOLDER}')
    items = list_folder(drive_id, SOP_FOLDER, tok)
    pdf_items = [i for i in items if i.get('file') and i['name'].lower().endswith('.pdf')]
    print(f'  Found {len(pdf_items)} PDF file(s):')
    for i in pdf_items:
        print(f'    {i["name"]} ({i.get("size", 0):,} bytes, modified {i.get("lastModifiedDateTime","?")})')

    if not pdf_items:
        print('No PDFs found. Check folder path or permissions.')
        sys.exit(0)

    # Download and write
    downloaded = []
    skipped    = []
    updated    = []

    for item in pdf_items:
        name     = item['name']
        dest     = out_dir / name
        item_id  = item['id']

        print(f'\nProcessing: {name}')

        if args.dry_run:
            print('  [dry-run] would download')
            downloaded.append(name)
            continue

        print('  Downloading...')
        try:
            data = download_item(drive_id, item_id, tok)
        except (HTTPError, URLError) as e:
            print(f'  ERROR: {e}', file=sys.stderr)
            continue

        new_hash = sha256(data)

        if dest.exists():
            old_hash = sha256(dest.read_bytes())
            if old_hash == new_hash:
                print(f'  Unchanged ({len(data):,} bytes)')
                skipped.append(name)
                continue
            else:
                print(f'  Updated ({len(data):,} bytes)')
                updated.append(name)
        else:
            print(f'  New file ({len(data):,} bytes)')
            downloaded.append(name)

        dest.write_bytes(data)
        print(f'  Written: {dest}')

    # Summary
    print('\n' + '='*60)
    print('SUMMARY')
    print('='*60)
    if downloaded:
        print(f'  New:       {len(downloaded)} file(s): {", ".join(downloaded)}')
    if updated:
        print(f'  Updated:   {len(updated)} file(s): {", ".join(updated)}')
    if skipped:
        print(f'  Unchanged: {len(skipped)} file(s): {", ".join(skipped)}')
    if not (downloaded or updated or skipped):
        print('  No files processed.')

    if downloaded or updated:
        print()
        print('NEXT STEPS:')
        print('  1. Review any new/updated PDFs for content changes.')
        print('  2. Update field/sops.html to reflect changes (new sections, revised text).')
        print('  3. Run the fidelity test: node field/tests/test-sops-fidelity.mjs')
        print('  4. Deploy: cd platform && source /home/aiciv/.env')
        print('     OMP_NUM_THREADS=1 GOMAXPROCS=1 npx wrangler pages deploy . \\')
        print('         --project-name pf-platform --branch website-build-20260609')


if __name__ == '__main__':
    main()
