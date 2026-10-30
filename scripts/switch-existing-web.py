#!/usr/bin/env python3
"""Switch an existing single-host Web image after a verified paired backup.

Does not migrate, seed, change worker images or restore business data.
Deployment configuration and all audit output stay on the deployment host.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--project', required=True)
parser.add_argument('--env-file', required=True)
parser.add_argument('--operation', required=True)
parser.add_argument('--backup', required=True)
parser.add_argument('--image', required=True)
args = parser.parse_args()
os.umask(0o077)
project, env, operation, backup = map(Path, [args.project, args.env_file, args.operation, args.backup])
operation.mkdir(parents=True, exist_ok=True)
if not backup.is_file() or backup.stat().st_size == 0:
    raise RuntimeError('A completed backup is required.')
expected = Path(str(backup) + '.sha256').read_text().split()[0]
digest = hashlib.sha256()
with backup.open('rb') as stream:
    for part in iter(lambda: stream.read(1024 * 1024), b''):
        digest.update(part)
if digest.hexdigest() != expected:
    raise RuntimeError('Backup checksum mismatch; nothing switched.')
if time.time() - backup.stat().st_mtime > 21600:
    raise RuntimeError('Backup is older than six hours; nothing switched.')
image = json.loads(subprocess.check_output(['docker', 'image', 'inspect', args.image]))[0]
if image['Os'] != 'linux' or image['Architecture'] != 'amd64':
    raise RuntimeError('Expected a Linux amd64 release image.')
compose = ['docker', 'compose', '--env-file', str(env), '-f', str(project / 'docker-compose.single-ecs.yml')]
subprocess.run(compose + ['config', '--quiet'], check=True)
original = env.read_text()
if len(re.findall(r'^APP_IMAGE=.*$', original, re.M)) != 1:
    raise RuntimeError('Expected exactly one APP_IMAGE setting.')
if (operation / 'runtime.previous.env').exists():
    raise RuntimeError('Operation already used; choose a fresh directory.')
shutil.copy2(env, operation / 'runtime.previous.env')
services = ['app', 'translation-worker', 'geo-publish-worker', 'geo-article-worker']
sql = r"""
\set ON_ERROR_STOP on
CREATE TEMP TABLE release_snapshot(name text,n bigint,digest text);
DO $$ DECLARE r record; BEGIN
FOR r IN SELECT schemaname,tablename FROM pg_tables
 WHERE schemaname IN ('public','platform_geo','platform_knowledge')
 AND tablename NOT IN ('payload_locked_documents','payload_locked_documents_rels','payload_jobs','users_sessions')
 ORDER BY schemaname,tablename LOOP
 EXECUTE format('INSERT INTO release_snapshot SELECT %L,count(*),md5(coalesce(string_agg(to_jsonb(t)::text,E''\n'' ORDER BY to_jsonb(t)::text),'''')) FROM %I.%I t',r.schemaname||'.'||r.tablename,r.schemaname,r.tablename);
END LOOP; END $$;
SELECT row_to_json(s) FROM release_snapshot s ORDER BY name;
"""
def snapshot(name):
    data = subprocess.check_output(['docker', 'exec', '-i', 'novasite-single-postgres-1',
        'psql', '-U', 'postgres', '-d', 'novasite', '-XAtq'], input=sql.encode())
    (operation / name).write_bytes(data)
    return data

def run(*command):
    subprocess.run(compose + list(command), check=True)

try:
    run('stop', '-t', '30', *services)
    before = snapshot('business-before.jsonl')
    replacement = re.sub(r'^APP_IMAGE=.*$', lambda _: 'APP_IMAGE=' + args.image, original, flags=re.M)
    env.write_text(replacement)
    run('up', '-d', '--no-deps', 'app')
    for _ in range(45):
        status = subprocess.check_output(['docker', 'inspect', '--format', '{{.State.Health.Status}}', 'novasite-single-app-1'], text=True).strip()
        if status == 'healthy':
            break
        time.sleep(2)
    else:
        raise RuntimeError('New application did not become healthy.')
    after = snapshot('business-after.jsonl')
    if before != after:
        raise RuntimeError('Business snapshot changed; rolling back application image without restoring data.')
    run('start', *services[1:])
    result = {'image': args.image, 'imageID': image['Id'], 'tablesCompared': len(before.splitlines()),
        'existingBusinessRowsUnchanged': True, 'backupVerified': True, 'migrationRun': False}
    (operation / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
    print('SWITCH_OK', json.dumps(result), flush=True)
except BaseException:
    shutil.copy2(operation / 'runtime.previous.env', env)
    subprocess.run(compose + ['up', '-d', '--no-deps', 'app'])
    subprocess.run(compose + ['start', *services[1:]])
    print('Application configuration restored; customer data was not restored or deleted.', flush=True)
    raise
