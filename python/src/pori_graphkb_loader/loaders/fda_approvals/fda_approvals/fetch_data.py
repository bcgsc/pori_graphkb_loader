import hashlib
import json
import re
from datetime import datetime, timedelta
from pathlib import Path

from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright
from tqdm import tqdm

BASE_URL = "https://www.fda.gov"
INDEX_PATH = (
    "/drugs/resources-information-approved-drugs/"
    "oncology-cancerhematologic-malignancies-approval-notifications"
)


def parse_date(value):
    return datetime.strptime(value, "%Y-%m-%d").date()


class PageCache:
    def __init__(self, cache_dir, max_age=None):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.max_age = max_age

    def _path(self, url):
        key = hashlib.sha256(url.encode()).hexdigest()
        return self.cache_dir / f"{key}.html"

    def get(self, url):
        path = self._path(url)

        if not path.exists():
            return None

        if self.max_age is not None:
            age = datetime.now() - datetime.fromtimestamp(path.stat().st_mtime)
            if age > self.max_age:
                return None

        return path.read_text(encoding="utf-8")

    def set(self, url, content):
        self._path(url).write_text(content, encoding="utf-8")


def extract_drug(title):
    """
    Extract only the first drug name from common FDA approval titles.

    Examples:
        FDA approves pembrolizumab for ...
            -> pembrolizumab

        FDA grants accelerated approval to adagrasib for ...
            -> adagrasib

        FDA approves nivolumab with ipilimumab for ...
            -> nivolumab

        FDA approves amivantamab-vmjw with lazertinib for ...
            -> amivantamab-vmjw
    """
    text = title.strip()

    prefixes = [
        r"^FDA grants accelerated approval to\s+",
        r"^FDA grants regular approval to\s+",
        r"^FDA grants approval to\s+",
        r"^FDA approves\s+",
        r"^FDA approved\s+",
    ]

    for prefix in prefixes:
        new_text = re.sub(prefix, "", text, flags=re.IGNORECASE)
        if new_text != text:
            text = new_text
            break

    # Keep only the first word/token, which should be the first drug name.
    drug = text.split()[0]

    drug = drug.lower()
    drug = re.sub(r"[®™]", "", drug)
    drug = re.sub(r"[^a-z0-9-]+", "", drug)
    drug = drug.strip("-")

    return drug


class IdMap:
    """
    Persist stable FDA page IDs across scraper runs.

    IDs have the form:

        FDA-<drug>:YYYY-MM-DD

    If more than one page would receive the same ID:

        FDA-<drug>:YYYY-MM-DD.2
        FDA-<drug>:YYYY-MM-DD.3
        ...

    The FDA page path is used as the persistent identity, so once an ID
    has been assigned to a page it will not change on later runs.
    """

    def __init__(self, path):
        self.path = Path(path)

        if self.path.exists():
            self.ids = json.loads(self.path.read_text(encoding="utf-8"))
        else:
            self.ids = {}

        self.used_ids = set(self.ids.values())

    def _save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)

        # Write atomically to avoid corrupting the map if interrupted.
        tmp_path = self.path.with_suffix(self.path.suffix + ".tmp")

        tmp_path.write_text(
            json.dumps(self.ids, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )

        tmp_path.replace(self.path)

    def get_or_create(self, path, title, page_date):
        # Existing FDA pages retain their previously assigned ID.
        if path in self.ids:
            return self.ids[path]

        drug = extract_drug(title)
        base_id = f"FDA-{drug}:{page_date.isoformat()}"

        page_id = base_id
        n = 2

        while page_id in self.used_ids:
            page_id = f"{base_id}.{n}"
            n += 1

        self.ids[path] = page_id
        self.used_ids.add(page_id)
        self._save()

        return page_id


def get(page, path, cache=None):
    url = BASE_URL + path

    if cache is not None:
        content = cache.get(url)
        if content is not None:
            return content

    page.goto(url, wait_until="domcontentloaded", timeout=120_000)
    content = page.content()

    if cache is not None:
        cache.set(url, content)

    return content


def fetch_announcement_links(page, min_date=None):
    # Intentionally don't cache the index page so newly added
    # FDA announcements are discovered on every run.
    page.goto(BASE_URL + INDEX_PATH, wait_until="domcontentloaded", timeout=120_000)

    # DataTables defaults to 10 rows; switch to "All".
    select = page.locator("select[name$='_length']")
    if select.count():
        select.select_option("-1")
        page.wait_for_timeout(200)

    soup = BeautifulSoup(page.content(), "html.parser")
    links = []

    for row in soup.select("table tbody tr"):
        cells = row.find_all("td")
        if len(cells) < 3:
            continue

        link = cells[0].find("a")
        if not link:
            continue

        page_date = datetime.strptime(cells[2].get_text(strip=True), "%m/%d/%Y").date()

        if min_date and page_date < min_date:
            break

        links.append((link["href"], page_date))

    return links


def parse_announcement_page(page, path, page_date, id_map, cache=None):
    soup = BeautifulSoup(get(page, path, cache=cache), "html.parser")

    title = soup.select_one("h1.content-title")
    article = soup.select_one("article")

    if not title or not article:
        raise ValueError(f"Unexpected FDA page structure: {path}")

    title = title.get_text(" ", strip=True)
    content = article.get_text("\n", strip=True)

    record = {
        "id": id_map.get_or_create(path, title, page_date),
        "content": content,
        "sourceIdVersion": page_date.isoformat(),
        "displayName": title,
        "name": title,
        "sourceId": path,
        "url": BASE_URL + path,
    }

    years = set(
        re.findall(
            r"\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? "
            r"\d+, (20\d\d)\b",
            content,
            re.IGNORECASE,
        )
    )

    if len(years) == 1:
        record["year"] = years.pop()

    return record


def scrape(
    min_date=None, cache_dir=None, cache_max_age=None, id_map_path=".fda_id_map.json"
):
    records = []
    id_map = IdMap(id_map_path)

    cache = None
    if cache_dir:
        max_age = timedelta(days=cache_max_age) if cache_max_age is not None else None
        cache = PageCache(cache_dir, max_age=max_age)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        items = fetch_announcement_links(page, min_date=min_date)

        for path, page_date in tqdm(items, desc="Scraping FDA approvals", unit="page"):
            try:
                records.append(
                    parse_announcement_page(
                        page, path, page_date, id_map=id_map, cache=cache
                    )
                )
            except ValueError as e:
                tqdm.write(f"Skipping {path}: {e}")

        browser.close()

    return records


def add_arguments(parser):
    parser.add_argument(
        "--min_date",
        type=parse_date,
        help="Only include records on or after this date (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--cache_dir",
        default=".fda_cache",
        help="Directory for cached FDA pages (default: .fda_cache)",
    )
    parser.add_argument(
        "--cache_max_age",
        type=float,
        help="Expire cached pages after this many days; default is never",
    )
    parser.add_argument(
        "--id_map",
        default=".fda_id_map.json",
        help="Persistent FDA page-to-ID mapping (default: .fda_id_map.json)",
    )


def fetch_data(
    output: Path,
    # loader-specific args...
    min_date,
    cache_max_age,
    cache_dir,
    id_map,
):
    records = scrape(
        min_date=min_date,
        cache_dir=cache_dir,
        cache_max_age=cache_max_age,
        id_map_path=id_map,
    )

    with open(output, "w", encoding="utf-8") as fh:
        fh.writelines(json.dumps(record, sort_keys=True) + "\n" for record in records)
