

def test_get_page_retries_transient_errors_then_raises(monkeypatch):
    import pytest
    import requests
    from scraper import http

    calls = []

    def flaky(url, **kw):
        calls.append(url)
        raise requests.ConnectionError("boom")

    monkeypatch.setattr(http, "get", flaky)
    monkeypatch.setattr(http.time, "sleep", lambda s: None)
    with pytest.raises(requests.ConnectionError):
        http.get_page("https://x.example/page-2")
    assert len(calls) == 3


def test_get_page_recovers_and_treats_404_as_end(monkeypatch):
    import requests
    from scraper import http

    state = {"n": 0}

    def once_flaky(url, **kw):
        state["n"] += 1
        if state["n"] == 1:
            raise requests.ConnectionError("blip")
        return "<html>ok</html>"

    monkeypatch.setattr(http, "get", once_flaky)
    monkeypatch.setattr(http.time, "sleep", lambda s: None)
    assert http.get_page("https://x.example/page-2") == "<html>ok</html>"

    def gone(url, **kw):
        resp = requests.Response()
        resp.status_code = 404
        raise requests.HTTPError(response=resp)

    monkeypatch.setattr(http, "get", gone)
    assert http.get_page("https://x.example/page-99") is None
