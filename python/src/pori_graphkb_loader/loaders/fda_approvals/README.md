# FDA Approval Announcements

web scraper for automatically pulling and storing oncology drug approval annoucements from the FDA webpage

Install with poetry

```bash
poetry install
```

Then the main script can be run as follows

min_date is optional, it should be the date since you last ran this if you only want new records

```bash
python -m fda_approvals.scrape output.jsonl --min_date 2025-01-01
```

then to upload to gkb

```bash
python -m fda_approvals.upload \
    output.jsonl \
    --graphkb-url "<YOUR GKB INSTANCE URL>" \
    --username "<USERNAME>" \
    --password "<PASSWORD>"
```
