"""Invoke the Ireland worker without letting a Stirling failure stop other agencies."""
import argparse
import datetime as dt
import json
import pathlib
import subprocess


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out-dir', type=pathlib.Path, required=True)
    parser.add_argument('--state', type=pathlib.Path, help='cached worker state; skip invocation until due')
    args = parser.parse_args()
    if args.state and args.state.exists():
        try:
            state = json.loads(args.state.read_text())
            due = dt.datetime.fromisoformat(state['next_attempt_at'])
            if due.tzinfo is None:
                due = due.replace(tzinfo=dt.timezone.utc)
            if dt.datetime.now(dt.timezone.utc) < due:
                print(f'Stirling Lambda not due until {due.isoformat()}', flush=True)
                return
        except (KeyError, ValueError, TypeError):
            print('Stirling state unreadable; deferring to Lambda cooldown', flush=True)
    response = pathlib.Path('/tmp/stirling-invoke.json')
    command = ['aws', 'lambda', 'invoke', '--region', 'eu-west-1',
               '--function-name', 'houseswipe-stirling-worker',
               '--cli-read-timeout', '930', str(response)]
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=950)
        metadata = json.loads(result.stdout) if result.returncode == 0 else {}
        body = json.loads(response.read_text()) if result.returncode == 0 else {}
        print(f"Stirling Lambda: invoke_rc={result.returncode} metadata={metadata} response={body}", flush=True)
        if result.returncode == 0 and not metadata.get('FunctionError') and body.get('status') in (
            'ok', 'cooldown', 'already_reserved', 'disabled', 'blocked', 'failed'
        ):
            return
        detail = f"Lambda invocation failed: {result.stderr[-1000:]} metadata={metadata} response={body}"
    except (subprocess.TimeoutExpired, ValueError, OSError) as exc:
        detail = f"Lambda invocation failed: {type(exc).__name__}: {exc}"

    now = dt.datetime.now(dt.timezone.utc)
    key = f'agency-invoke-failed:stirlingackroyd:{now.date().isoformat()}'
    args.out_dir.mkdir(parents=True, exist_ok=True)
    (args.out_dir / f'{key}.json').write_text(json.dumps({
        'key': key, 'severity': 'critical', 'title': 'Stirling Lambda invocation failed',
        'detail': detail, 'created': now.isoformat(), 'run_url': '',
    }))
    print(detail, flush=True)


if __name__ == '__main__':
    main()
