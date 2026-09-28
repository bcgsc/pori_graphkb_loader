import json
import os
from datetime import date, datetime, timedelta
from unittest.mock import MagicMock

import pytest

from fda_approval_announcements import scrape

INDEX_HTML = """
<table>
    <tbody>
        <tr>
            <td><a href="/drugs/approval-1">Approval 1</a></td>
            <td>Description 1</td>
            <td>09/20/2026</td>
        </tr>
        <tr>
            <td><a href="/drugs/approval-2">Approval 2</a></td>
            <td>Description 2</td>
            <td>05/10/2026</td>
        </tr>
        <tr>
            <td><a href="/drugs/approval-3">Approval 3</a></td>
            <td>Description 3</td>
            <td>12/01/2025</td>
        </tr>
    </tbody>
</table>
"""

ANNOUNCEMENT_HTML = """
<html>
    <body>
        <h1 class="content-title">FDA approves example drug</h1>
        <article>
            On September 20, 2026, the FDA approved an example drug.
        </article>
    </body>
</html>
"""


class FakeSelect:
    def __init__(self, count=1):
        self._count = count
        self.selected = None

    def count(self):
        return self._count

    def select_option(self, value):
        self.selected = value


class FakePage:
    def __init__(self, html):
        self.html = html
        self.select = FakeSelect()
        self.visited = None

    def goto(self, url, wait_until=None):
        self.visited = url

    def locator(self, selector):
        return self.select

    def wait_for_timeout(self, timeout):
        pass

    def content(self):
        return self.html


@pytest.mark.parametrize(
    ("value", "expected"),
    [("2026-01-01", date(2026, 1, 1)), ("2025-12-31", date(2025, 12, 31))],
)
def test_parse_date(value, expected):
    assert scrape.parse_date(value) == expected


def test_parse_date_invalid():
    with pytest.raises(ValueError):
        scrape.parse_date("2026/01/01")


def test_page_cache_set_and_get(tmp_path):
    cache = scrape.PageCache(tmp_path)

    url = "https://www.fda.gov/drugs/example"
    content = "<html>example</html>"

    cache.set(url, content)

    assert cache.get(url) == content


def test_page_cache_missing(tmp_path):
    cache = scrape.PageCache(tmp_path)

    assert cache.get("https://www.fda.gov/drugs/missing") is None


def test_page_cache_expired(tmp_path):
    cache = scrape.PageCache(
        tmp_path,
        max_age=timedelta(days=1),
    )

    url = "https://www.fda.gov/drugs/example"
    cache.set(url, "<html>example</html>")

    path = cache._path(url)

    old_timestamp = (datetime.now() - timedelta(days=2)).timestamp()
    os.utime(path, (old_timestamp, old_timestamp))

    assert cache.get(url) is None


def test_get_uses_cache():
    page = MagicMock()
    cache = MagicMock()
    cache.get.return_value = "<html>cached</html>"

    result = scrape.get(page, "/drugs/example", cache=cache)

    assert result == "<html>cached</html>"
    cache.get.assert_called_once_with("https://www.fda.gov/drugs/example")
    page.goto.assert_not_called()
    cache.set.assert_not_called()


def test_get_fetches_and_caches_on_miss():
    page = MagicMock()
    page.content.return_value = "<html>fresh</html>"

    cache = MagicMock()
    cache.get.return_value = None

    result = scrape.get(page, "/drugs/example", cache=cache)

    assert result == "<html>fresh</html>"

    page.goto.assert_called_once_with(
        "https://www.fda.gov/drugs/example", wait_until="networkidle"
    )

    cache.set.assert_called_once_with(
        "https://www.fda.gov/drugs/example", "<html>fresh</html>"
    )


def test_get_without_cache():
    page = MagicMock()
    page.content.return_value = "<html>fresh</html>"

    result = scrape.get(page, "/drugs/example")

    assert result == "<html>fresh</html>"

    page.goto.assert_called_once_with(
        "https://www.fda.gov/drugs/example", wait_until="networkidle"
    )


@pytest.mark.parametrize(
    ("min_date", "expected"),
    [
        (
            None,
            [
                ("/drugs/approval-1", date(2026, 9, 20)),
                ("/drugs/approval-2", date(2026, 5, 10)),
                ("/drugs/approval-3", date(2025, 12, 1)),
            ],
        ),
        (
            date(2026, 1, 1),
            [
                ("/drugs/approval-1", date(2026, 9, 20)),
                ("/drugs/approval-2", date(2026, 5, 10)),
            ],
        ),
    ],
)
def test_fetch_announcement_links(min_date, expected):
    page = FakePage(INDEX_HTML)

    result = scrape.fetch_announcement_links(
        page,
        min_date=min_date,
    )

    assert result == expected

    # The index page must always be fetched directly.
    assert page.visited == scrape.BASE_URL + scrape.INDEX_PATH


@pytest.mark.parametrize(
    ("select_count", "expected_selected"),
    [
        (1, "-1"),
        (0, None),
    ],
)
def test_fetch_announcement_links_datatable(
    select_count,
    expected_selected,
):
    page = FakePage(INDEX_HTML)
    page.select = FakeSelect(count=select_count)

    result = scrape.fetch_announcement_links(page)

    assert len(result) == 3
    assert page.select.selected == expected_selected


@pytest.mark.parametrize(
    "row",
    [
        "<tr><td>Only one cell</td></tr>",
        """
        <tr>
            <td>No link</td>
            <td>Description</td>
            <td>01/01/2026</td>
        </tr>
        """,
    ],
)
def test_fetch_announcement_links_skips_invalid_rows(row):
    page = FakePage(f"<table><tbody>{row}</tbody></table>")

    assert scrape.fetch_announcement_links(page) == []


def test_parse_announcement_page(monkeypatch):
    get_mock = MagicMock(return_value=ANNOUNCEMENT_HTML)
    monkeypatch.setattr(scrape, "get", get_mock)

    cache = MagicMock()

    result = scrape.parse_announcement_page(
        page=None, path="/drugs/approval-1", page_date=date(2026, 9, 20), cache=cache
    )

    assert result == {
        "content": ("On September 20, 2026, the FDA approved an example drug."),
        "sourceIdVersion": "2026-09-20",
        "displayName": "FDA approves example drug",
        "name": "FDA approves example drug",
        "sourceId": "/drugs/approval-1",
        "url": "https://www.fda.gov/drugs/approval-1",
        "year": "2026",
    }

    get_mock.assert_called_once_with(None, "/drugs/approval-1", cache=cache)


@pytest.mark.parametrize(
    "html",
    [
        """
        <html>
            <body>
                <article>Some content</article>
            </body>
        </html>
        """,
        """
        <html>
            <body>
                <h1 class="content-title">Title</h1>
            </body>
        </html>
        """,
    ],
)
def test_parse_announcement_page_missing_required_element(
    monkeypatch,
    html,
):
    monkeypatch.setattr(scrape, "get", lambda page, path, cache=None: html)

    with pytest.raises(
        ValueError,
        match="Unexpected FDA page structure",
    ):
        scrape.parse_announcement_page(
            page=None, path="/drugs/bad-page", page_date=date(2026, 1, 1)
        )


@pytest.mark.parametrize(
    ("html", "expected_year"),
    [
        (
            """
            <h1 class="content-title">FDA approval</h1>
            <article>
                On January 1, 2026 something happened.
            </article>
            """,
            "2026",
        ),
        (
            """
            <h1 class="content-title">FDA approval</h1>
            <article>
                On January 1, 2026 something happened.
                On December 1, 2025 something else happened.
            </article>
            """,
            None,
        ),
    ],
)
def test_parse_announcement_page_year(
    monkeypatch,
    html,
    expected_year,
):
    monkeypatch.setattr(scrape, "get", lambda page, path, cache=None: html)

    result = scrape.parse_announcement_page(
        page=None,
        path="/drugs/approval",
        page_date=date(2026, 1, 1),
    )

    if expected_year is None:
        assert "year" not in result
    else:
        assert result["year"] == expected_year


def test_scrape(monkeypatch):
    page = MagicMock()
    browser = MagicMock()
    playwright = MagicMock()

    browser.new_page.return_value = page
    playwright.chromium.launch.return_value = browser

    context = MagicMock()
    context.__enter__.return_value = playwright
    context.__exit__.return_value = None

    monkeypatch.setattr(scrape, "sync_playwright", lambda: context)

    monkeypatch.setattr(
        scrape,
        "fetch_announcement_links",
        lambda page, min_date=None: [("/drugs/approval-1", date(2026, 9, 20))],
    )

    monkeypatch.setattr(
        scrape,
        "parse_announcement_page",
        lambda page, path, page_date, cache=None: {
            "sourceId": path,
            "sourceIdVersion": page_date.isoformat(),
        },
    )

    result = scrape.scrape(min_date=date(2026, 1, 1))

    assert result == [
        {
            "sourceId": "/drugs/approval-1",
            "sourceIdVersion": "2026-09-20",
        }
    ]

    browser.close.assert_called_once()


def test_scrape_uses_cache(monkeypatch, tmp_path):
    page = MagicMock()
    browser = MagicMock()
    playwright = MagicMock()

    browser.new_page.return_value = page
    playwright.chromium.launch.return_value = browser

    context = MagicMock()
    context.__enter__.return_value = playwright
    context.__exit__.return_value = None

    monkeypatch.setattr(
        scrape,
        "sync_playwright",
        lambda: context,
    )

    monkeypatch.setattr(
        scrape,
        "fetch_announcement_links",
        lambda page, min_date=None: [
            (
                "/drugs/approval-1",
                date(2026, 9, 20),
            )
        ],
    )

    parse_mock = MagicMock(
        return_value={
            "sourceId": "/drugs/approval-1",
        }
    )
    monkeypatch.setattr(scrape, "parse_announcement_page", parse_mock)

    cache_mock = MagicMock()
    page_cache_mock = MagicMock(return_value=cache_mock)

    monkeypatch.setattr(scrape, "PageCache", page_cache_mock)

    scrape.scrape(cache_dir=tmp_path, cache_max_age=30)

    page_cache_mock.assert_called_once_with(tmp_path, max_age=timedelta(days=30))

    parse_mock.assert_called_once_with(
        page, "/drugs/approval-1", date(2026, 9, 20), cache=cache_mock
    )


def test_scrape_skips_invalid_page(monkeypatch):
    page = MagicMock()
    browser = MagicMock()
    playwright = MagicMock()

    browser.new_page.return_value = page
    playwright.chromium.launch.return_value = browser

    context = MagicMock()
    context.__enter__.return_value = playwright
    context.__exit__.return_value = None

    monkeypatch.setattr(scrape, "sync_playwright", lambda: context)

    monkeypatch.setattr(
        scrape,
        "fetch_announcement_links",
        lambda page, min_date=None: [("/drugs/bad", date(2026, 1, 1))],
    )

    monkeypatch.setattr(
        scrape,
        "parse_announcement_page",
        MagicMock(side_effect=ValueError("bad page")),
    )

    assert scrape.scrape() == []


def test_main(monkeypatch, tmp_path):
    output = tmp_path / "output.jsonl"
    cache_dir = tmp_path / "cache"

    monkeypatch.setattr(
        "sys.argv",
        [
            "scrape",
            str(output),
            "--min_date",
            "2026-01-01",
            "--cache_dir",
            str(cache_dir),
            "--cache_max_age",
            "30",
        ],
    )

    scrape_mock = MagicMock(return_value=[{"sourceId": "/drugs/example"}])

    monkeypatch.setattr(scrape, "scrape", scrape_mock)

    scrape.main()

    assert [json.loads(line) for line in output.read_text().splitlines()] == [
        {"sourceId": "/drugs/example"}
    ]

    scrape_mock.assert_called_once_with(
        min_date=date(2026, 1, 1), cache_dir=str(cache_dir), cache_max_age=30.0
    )


def test_main_cache_defaults(monkeypatch, tmp_path):
    output = tmp_path / "output.jsonl"

    monkeypatch.setattr("sys.argv", ["scrape", str(output)])

    scrape_mock = MagicMock(return_value=[])

    monkeypatch.setattr(scrape, "scrape", scrape_mock)

    scrape.main()

    scrape_mock.assert_called_once_with(
        min_date=None, cache_dir=".fda_cache", cache_max_age=None
    )
