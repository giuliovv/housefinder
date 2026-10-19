import datetime as dt
from ops.stirling_worker import due_at


def test_shared_block_survives_new_worker():
    assert due_at({}, {'blocked': {'stirlingackroyd': '2026-10-16'}}) == dt.datetime(2026, 10, 19)


def test_reservation_survives_retry():
    assert due_at({'next_attempt_at': '2026-10-22T12:00:00'}, {}) == dt.datetime(2026, 10, 22, 12)


def test_recent_github_scrape_prevents_duplicate():
    assert due_at({}, {'runs': {'2026-10-18': {'stirlingackroyd': 397}}}) == dt.datetime(2026, 10, 20)


def test_failure_uses_existing_alert_queue(monkeypatch):
    import json
    from ops import stirling_worker

    writes = []
    class S3:
        def put_object(self, **kwargs):
            writes.append(kwargs)
    monkeypatch.setenv('AWS_REGION', 'eu-west-1')
    monkeypatch.setenv('BUCKET', 'test-bucket')
    monkeypatch.setattr(stirling_worker.boto3, 'client', lambda service: S3())
    monkeypatch.setattr(stirling_worker, 'run', lambda *args: {
        'status': 'blocked', 'requests': 10, 'next_attempt_at': '2026-10-22T00:00:00',
    })
    stirling_worker.handler({}, None)
    assert writes[0]['Key'].startswith('alerts/pending/agency-blocked:stirlingackroyd:')
    assert json.loads(writes[0]['Body'])['severity'] == 'warning'
