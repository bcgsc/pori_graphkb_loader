# FDA Oncology Approval Announcements

Loads Evidence records which are a copy of the content from the
[FDA Oncology Approval Announcements](https://www.fda.gov/drugs/resources-information-approved-drugs/hematologyoncology-cancer-approvals-safety-notifications)
Page. These are loaded so that they can be used as evidence for statements. The web pages are
parsed and the cleaned text is included in an Evidence record for reference

This is a web-scraper that pulls and stores FDA approval announcements and loads them into GKB as CuratedContent.

It should be run in two steps

min_date is optional, it should be the date since you last ran this if you only want new records

1. Scrape New Records

```bash
python -m fda_approvals.scrape output.jsonl --min_date 2025-01-01
```

2. Upload to gkb

```bash
python -m fda_approvals.upload \
    output.jsonl \
    --graphkb-url "<YOUR GKB INSTANCE URL>" \
    --username "<USERNAME>" \
    --password "<PASSWORD>"
```

Note: an "id" field is generated for each page. It is composed of the date and the first drug mentioned. If there are conflicts a numbered suffix is appended `.#`. If the FDA pages are changed this may not be stable across loads. Therefore the IDs are persisted to the filesystem between runs.
