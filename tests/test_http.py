

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


def test_get_first_page_retries_once_after_a_timeout(monkeypatch) -> None:
    import requests
    from scraper import http

    calls = []

    def fake_get(url, *, timeout, user_agent=None, session=None):
        calls.append(timeout)
        if len(calls) == 1:
            raise requests.ReadTimeout("slow")
        return "<html>ok</html>"

    monkeypatch.setattr(http, "get", fake_get)
    monkeypatch.setattr(http.time, "sleep", lambda s: None)
    assert http.get_first_page("https://example.test/") == "<html>ok</html>"
    assert calls == [45.0, 45.0]


def test_get_first_page_gives_up_after_the_retry(monkeypatch) -> None:
    import pytest
    import requests
    from scraper import http

    monkeypatch.setattr(http, "get", lambda *a, **k: (_ for _ in ()).throw(requests.ReadTimeout("slow")))
    monkeypatch.setattr(http.time, "sleep", lambda s: None)
    with pytest.raises(requests.ReadTimeout):
        http.get_first_page("https://example.test/")


def test_get_first_page_does_not_retry_http_errors(monkeypatch) -> None:
    import pytest
    import requests
    from scraper import http

    calls = []

    def fake_get(*a, **k):
        calls.append(1)
        raise requests.HTTPError("500")

    monkeypatch.setattr(http, "get", fake_get)
    with pytest.raises(requests.HTTPError):
        http.get_first_page("https://example.test/")
    assert len(calls) == 1
