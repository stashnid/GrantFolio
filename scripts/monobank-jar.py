#!/usr/bin/env python3
"""Operator helper: credentials stay in process memory and HTTPS requests only."""
import getpass, json, os, sys, subprocess, urllib.request, urllib.error

def request(url, body=None, token=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['X-Token'] = token
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, headers=headers)
    with urllib.request.urlopen(req, timeout=20) as response:
        return response.read().decode()

mode = sys.argv[1] if len(sys.argv) > 1 else 'connect'
base = os.environ.get('MONOBANK_PUBLIC_BASE_URL', 'https://grantfolio.pp.ua').rstrip('/')
if not base.startswith('https://'):
    raise SystemExit('HTTPS required')
try:
    secret = subprocess.check_output(['gcloud', 'secrets', 'versions', 'access', '1', '--secret=grantfolio-monobank-jar-webhook', '--project=grantfolio-pp-ua'], stderr=subprocess.DEVNULL, text=True).strip()
except (OSError, subprocess.CalledProcessError):
    secret = getpass.getpass('Webhook secret (hidden): ')
if len(secret) < 32 or not secret.isalnum():
    raise SystemExit('Secret must be at least 32 letters/digits')
url = base + '/api/payments/monobank/' + secret
try:
    if mode == 'connect':
        request(url)  # Require working deployed GET before changing the bank webhook.
        token = getpass.getpass('Monobank personal API token (hidden, not stored): ')
        reply = json.loads(request('https://api.monobank.ua/personal/webhook', {'webHookUrl': url}, token))
        token = None
        if reply.get('status') != 'ok':
            raise SystemExit('Monobank did not confirm registration; payments remain disabled.')
        print('Monobank webhook registered. Enabling payment instructions...')
        subprocess.run(['gcloud', 'run', 'services', 'update', 'grantfolio-web', '--project=grantfolio-pp-ua', '--region=europe-west1', '--update-env-vars=MONOBANK_JAR_ENABLED=true', '--quiet'], check=True)
        service = json.loads(subprocess.check_output(['gcloud', 'run', 'services', 'describe', 'grantfolio-web', '--project=grantfolio-pp-ua', '--region=europe-west1', '--format=json'], text=True))
        revision = service['status']['latestCreatedRevisionName']
        # A service pinned to a named revision does not move traffic on env updates.
        subprocess.run(['gcloud', 'run', 'services', 'update-traffic', 'grantfolio-web', '--project=grantfolio-pp-ua', '--region=europe-west1', '--set-tags=payment-candidate=' + revision, '--quiet'], check=True)
        candidate = json.loads(subprocess.check_output(['gcloud', 'run', 'revisions', 'describe', revision, '--project=grantfolio-pp-ua', '--region=europe-west1', '--format=json'], text=True))
        conditions = {c['type']: c['status'] for c in candidate['status']['conditions']}
        if not all(conditions.get(c) == 'True' for c in ['Ready', 'Active', 'ContainerHealthy']):
            raise SystemExit('Candidate is not healthy. Live traffic unchanged.')
        subprocess.run(['gcloud', 'run', 'services', 'update-traffic', 'grantfolio-web', '--project=grantfolio-pp-ua', '--region=europe-west1', '--to-revisions=' + revision + '=100', '--quiet'], check=True)
        print('Payment instructions enabled on the active revision.')
    elif mode == 'payments':
        print(request(url + '/summary'))
    elif mode == 'unlock':
        import re
        code = os.environ.get('CODE', '').upper()
        if not re.fullmatch(r'GF-[0-9A-F]{10}', code):
            raise SystemExit('Use CODE=GF-XXXXXXXXXX make unlock')
        print(request(url + '/unlock/' + code, {}))
    else:
        raise SystemExit('Unknown command')
except urllib.error.HTTPError as error:
    print('HTTP', error.code, 'Request failed; secret URL withheld.', file=sys.stderr)
    sys.exit(1)
except Exception:
    print('Connection failed; credentials and URL withheld.', file=sys.stderr)
    sys.exit(1)
