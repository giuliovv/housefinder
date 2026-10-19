"""Bounded Ireland worker. Durable reservation prevents retries resetting cooldown."""
import datetime as dt
import dataclasses
import json
import logging
import os

import boto3
from botocore.exceptions import ClientError

from scraper import export, http, keys
from scraper.agencies import AGENCIES

LOG = logging.getLogger(__name__)
LOG.setLevel(logging.INFO)
AGENCY = 'stirlingackroyd'
STATE_KEY = 'inbox/stirling-state.json'
RESULT_KEY = 'inbox/stirling.json'


def read_json(s3, bucket, key, default=None):
    try:
        obj = s3.get_object(Bucket=bucket, Key=key)
        return json.loads(obj['Body'].read()), obj['ETag']
    except ClientError as exc:
        if exc.response['Error']['Code'] in ('NoSuchKey', '404'):
            return default, None
        raise


def due_at(state, history):
    dates = [state.get('next_attempt_at', '1970-01-01T00:00:00')]
    blocked = history.get('blocked', {}).get(AGENCY)
    if blocked:
        dates.append((dt.datetime.fromisoformat(blocked) + dt.timedelta(days=3)).isoformat())
    for day, agencies in history.get('runs', {}).items():
        if AGENCY in agencies:
            dates.append((dt.datetime.fromisoformat(day) + dt.timedelta(days=2)).isoformat())
    return max(dt.datetime.fromisoformat(value) for value in dates)


def handler(event, context):
    if os.environ.get('AWS_REGION') != 'eu-west-1':
        raise RuntimeError('Stirling worker must run in eu-west-1')
    bucket = os.environ['BUCKET']
    s3 = boto3.client('s3')
    now = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
    history, _ = read_json(s3, bucket, 'analytics/history.json')
    if history is None:
        raise RuntimeError('Missing shared history; refusing to reset backoff')
    switch, _ = read_json(s3, bucket, 'killswitch.json', {'disabled': []})
    if AGENCY in switch.get('disabled', []):
        return {'status': 'disabled'}
    state, etag = read_json(s3, bucket, STATE_KEY, {})
    due = due_at(state, history)
    if now < due:
        LOG.info('cooldown next_attempt_at=%s', due.isoformat())
        return {'status': 'cooldown', 'next_attempt_at': due.isoformat()}
    reservation = {'started_at': now.isoformat(), 'status': 'running',
                   'next_attempt_at': (now + dt.timedelta(hours=48)).isoformat()}
    try:
        s3.put_object(Bucket=bucket, Key=STATE_KEY, Body=json.dumps(reservation),
                      ContentType='application/json',
                      **({'IfMatch': etag} if etag else {'IfNoneMatch': '*'}))
    except ClientError as exc:
        if exc.response['Error']['Code'] in ('PreconditionFailed', 'ConditionalRequestConflict'):
            return {'status': 'already_reserved'}
        raise
    # Persist reservation before network activity: timeout/crash still means 48h cooldown.
    existing, _ = read_json(s3, bucket, 'data/listings.json')
    if existing is None:
        raise RuntimeError('Missing listing cache; refusing a full detail crawl')
    known = {keys.listing_key(row): row for row in existing}
    export.BLOCKED.clear()
    export.REQUEST_LOG.clear()
    count = 0
    original = http._request

    def bounded(*args, **kwargs):
        nonlocal count
        if count >= 60 or context.get_remaining_time_in_millis() < 45000:
            raise RuntimeError('Worker request/time budget exhausted')
        count += 1
        LOG.info('request=%d/60 remaining_ms=%d', count, context.get_remaining_time_in_millis())
        return original(*args, **kwargs)

    http._request = bounded
    try:
        cfg = dataclasses.replace(AGENCIES[AGENCY], delay_seconds=5.0, max_details_per_run=15)
        result = export.scrape_agency(cfg, 800, 45, known)
        status = 'blocked' if AGENCY in export.BLOCKED else ('ok' if result is not None else 'failed')
        if status == 'blocked':
            reservation['next_attempt_at'] = (now + dt.timedelta(days=3)).isoformat()
        if status == 'ok':
            rows, _ = result
            payload = {'scraped_at': now.isoformat(), 'agencies': {
                AGENCY: {'rows': rows, 'truncated': True}}}
            # Always conservative: a capped scan must never mark unseen homes as gone.
            s3.put_object(Bucket=bucket, Key=RESULT_KEY, Body=json.dumps(payload), ContentType='application/json')
        reservation.update(status=status, requests=count)
        s3.put_object(Bucket=bucket, Key=STATE_KEY, Body=json.dumps(reservation), ContentType='application/json')
        LOG.info('finished %s', json.dumps(reservation))
        return reservation
    finally:
        http._request = original
