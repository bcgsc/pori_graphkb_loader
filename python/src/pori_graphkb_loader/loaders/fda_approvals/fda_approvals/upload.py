import json
from pathlib import Path

from pori_python.graphkb import GraphKBConnection
from tqdm import tqdm

from .fetch_data import BASE_URL, INDEX_PATH

SOURCE = {
    "displayName": "FDA Approvals",
    "longName": "FDA Hematology/Oncology (Cancer) Approvals & Safety Notifications",
    "name": "fda approvals",
    "url": BASE_URL + INDEX_PATH,
}


def get_or_create_source(conn):
    records = conn.query(
        {"target": "Source", "filters": {"name": SOURCE["name"]}}, force_refresh=True
    )

    if len(records) > 1:
        raise ValueError(f"source name is not unique: {SOURCE['name']}")
    if records:
        return records[0]["@rid"]

    result = conn.post("sources", SOURCE)
    return result["result"]["@rid"]


def read_jsonl(input_path: Path) -> list[dict]:
    records = []
    for line in input_path.read_text().split("\n"):
        if line.strip():
            records.append(json.loads(line))
    return records


def upload(input_path: Path, conn: GraphKBConnection, **kwargs) -> None:
    records = read_jsonl(input_path)

    source = get_or_create_source(conn)
    counts = {"success": 0, "skipped": 0, "error": 0}

    for record in tqdm(records, desc="Uploading to GraphKB", unit="record"):
        try:
            existing = conn.query(
                {
                    "target": "CuratedContent",
                    "filters": {
                        "AND": [{"source": source}, {"sourceId": record["sourceId"]}]
                    },
                },
                force_refresh=True,
            )

            if existing:
                counts["skipped"] += 1
                continue

            record.pop("id")  # TODO: generated for non-gkb until we migrate these all

            conn.post("curatedcontents", {**record, "source": source})

            counts["success"] += 1

        except Exception as e:
            tqdm.write(f"Failed {record['sourceId']}: {e}")
            counts["error"] += 1

    print(counts)
