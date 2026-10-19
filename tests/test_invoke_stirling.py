import json
import sys

from ops import invoke_stirling


def test_cooldown_skips_lambda_invocation(monkeypatch, tmp_path):
    state = tmp_path / 'state.json'
    state.write_text(json.dumps({'next_attempt_at': '2099-01-01T00:00:00'}))
    monkeypatch.setattr(invoke_stirling.subprocess, 'run', lambda *a, **kw: (_ for _ in ()).throw(AssertionError('invoked')))
    monkeypatch.setattr(sys, 'argv', ['invoke_stirling', '--state', str(state), '--out-dir', str(tmp_path / 'alerts')])
    invoke_stirling.main()
    assert not (tmp_path / 'alerts').exists()


def test_invoke_failure_writes_watcher_alert(monkeypatch, tmp_path):
    class Failed:
        returncode = 1
        stderr = 'AccessDenied'
        stdout = ''

    monkeypatch.setattr(invoke_stirling.subprocess, 'run', lambda *a, **kw: Failed())
    monkeypatch.setattr(sys, 'argv', ['invoke_stirling', '--out-dir', str(tmp_path / 'alerts')])
    invoke_stirling.main()
    files = list((tmp_path / 'alerts').glob('*.json'))
    assert len(files) == 1
    assert json.loads(files[0].read_text())['severity'] == 'critical'
