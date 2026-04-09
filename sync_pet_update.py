#!/usr/bin/env python3
import json
import subprocess
from pathlib import Path
from datetime import datetime

REPO_DIR = Path(__file__).resolve().parent
TRACKER = Path('/Users/openclaw/.hermes/pet_party_tracker.json')
STATE = REPO_DIR / 'state.json'


def run(cmd):
    return subprocess.run(cmd, cwd=REPO_DIR, text=True, capture_output=True)


def main():
    if not TRACKER.exists():
        raise SystemExit(f'Tracker missing: {TRACKER}')

    data = json.loads(TRACKER.read_text())
    for p in data.get('party', []):
        if not p.get('id'):
            p['id'] = p.get('name', '').lower().split()[0]

    data['updated_at'] = datetime.now().astimezone().isoformat(timespec='seconds')
    STATE.write_text(json.dumps(data, indent=2))

    run(['git', 'add', 'state.json'])
    status = run(['git', 'status', '--porcelain'])
    if 'state.json' not in status.stdout:
        print('No state changes to commit.')
        return

    run(['git', 'commit', '-m', 'Sync pet state from tracker'])
    push = run(['git', 'push'])
    if push.returncode != 0:
        raise SystemExit(push.stderr)
    print('Pushed pet state update to GitHub Pages source.')


if __name__ == '__main__':
    main()
