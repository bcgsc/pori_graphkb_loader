import json
from unittest.mock import MagicMock

import pytest

from fda_approvals import upload


def _disable_tqdm(monkeypatch):
    """Replace tqdm with a transparent iterable for tests."""

    def fake_tqdm(iterable, **kwargs):
        return iterable

    fake_tqdm.write = MagicMock()

    monkeypatch.setattr(upload, "tqdm", fake_tqdm)

    return fake_tqdm


def _write_jsonl(tmp_path, records):
    filename = tmp_path / "records.jsonl"

    filename.write_text(
        "\n".join(json.dumps(record) for record in records) + "\n", encoding="utf-8"
    )

    return filename


def test_get_or_create_source_existing():
    conn = MagicMock()

    conn.query.return_value = [{"@rid": "#1:1"}]

    result = upload.get_or_create_source(conn)

    assert result == "#1:1"

    conn.query.assert_called_once_with(
        {"target": "Source", "filters": {"name": upload.SOURCE["name"]}},
        force_refresh=True,
    )

    conn.post.assert_not_called()


def test_get_or_create_source_duplicate():
    conn = MagicMock()

    conn.query.return_value = [{"@rid": "#1:1"}, {"@rid": "#1:2"}]

    with pytest.raises(ValueError, match="source name is not unique"):
        upload.get_or_create_source(conn)


def test_get_or_create_source_creates_source():
    conn = MagicMock()

    conn.query.return_value = []

    conn.post.return_value = {"result": {"@rid": "#1:1"}}

    result = upload.get_or_create_source(conn)

    assert result == "#1:1"

    conn.post.assert_called_once_with("sources", upload.SOURCE)


def test_read_jsonl(tmp_path):
    filename = tmp_path / "records.jsonl"

    filename.write_text(
        "\n".join(
            [
                ('{"sourceId": "/drugs/one", "name": "One"}'),
                ('{"sourceId": "/drugs/two", "name": "Two"}'),
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    assert upload.read_jsonl(filename) == [
        {"sourceId": "/drugs/one", "name": "One"},
        {"sourceId": "/drugs/two", "name": "Two"},
    ]


def test_read_jsonl_ignores_blank_lines(tmp_path):
    filename = tmp_path / "records.jsonl"

    filename.write_text(
        ('{"sourceId": "/drugs/one"}\n\n{"sourceId": "/drugs/two"}\n'), encoding="utf-8"
    )

    assert upload.read_jsonl(filename) == [
        {"sourceId": "/drugs/one"},
        {"sourceId": "/drugs/two"},
    ]


def test_upload_new_record(monkeypatch, tmp_path, capsys):
    _disable_tqdm(monkeypatch)

    conn = MagicMock()

    monkeypatch.setattr(upload, "get_or_create_source", lambda conn: "#1:1")

    conn.query.return_value = []

    filename = _write_jsonl(
        tmp_path,
        [
            {
                "id": "temporary-id",
                "name": "FDA approves drug",
                "sourceId": "/drugs/example",
                "url": ("https://www.fda.gov/drugs/example"),
            }
        ],
    )

    result = upload.upload(input_path=filename, conn=conn)

    assert result is None

    conn.post.assert_called_once_with(
        "curatedcontents",
        {
            "name": "FDA approves drug",
            "sourceId": "/drugs/example",
            "url": ("https://www.fda.gov/drugs/example"),
            "source": "#1:1",
        },
    )

    assert "{'success': 1, 'skipped': 0, 'error': 0}" in capsys.readouterr().out


def test_upload_existing_record(monkeypatch, tmp_path, capsys):
    _disable_tqdm(monkeypatch)

    conn = MagicMock()

    monkeypatch.setattr(upload, "get_or_create_source", lambda conn: "#1:1")

    conn.query.return_value = [{"@rid": "#2:1"}]

    filename = _write_jsonl(
        tmp_path, [{"id": "temporary-id", "sourceId": "/drugs/example"}]
    )

    upload.upload(input_path=filename, conn=conn)

    conn.post.assert_not_called()

    assert "{'success': 0, 'skipped': 1, 'error': 0}" in capsys.readouterr().out


def test_upload_query(monkeypatch, tmp_path):
    _disable_tqdm(monkeypatch)

    conn = MagicMock()

    monkeypatch.setattr(upload, "get_or_create_source", lambda conn: "#1:1")

    conn.query.return_value = []

    filename = _write_jsonl(
        tmp_path, [{"id": "temporary-id", "sourceId": "/drugs/example"}]
    )

    upload.upload(input_path=filename, conn=conn)

    conn.query.assert_called_once_with(
        {
            "target": "CuratedContent",
            "filters": {"AND": [{"source": "#1:1"}, {"sourceId": "/drugs/example"}]},
        },
        force_refresh=True,
    )


def test_upload_multiple_records(monkeypatch, tmp_path, capsys):
    _disable_tqdm(monkeypatch)

    conn = MagicMock()

    monkeypatch.setattr(upload, "get_or_create_source", lambda conn: "#1:1")

    conn.query.side_effect = [[], [{"@rid": "#2:1"}]]

    filename = _write_jsonl(
        tmp_path,
        [
            {"id": "one", "name": "New record", "sourceId": "/drugs/new"},
            {"id": "two", "name": "Existing record", "sourceId": "/drugs/existing"},
        ],
    )

    upload.upload(input_path=filename, conn=conn)

    assert conn.query.call_count == 2
    assert conn.post.call_count == 1

    assert "{'success': 1, 'skipped': 1, 'error': 0}" in capsys.readouterr().out


def test_upload_error(monkeypatch, tmp_path, capsys):
    fake_tqdm = _disable_tqdm(monkeypatch)

    conn = MagicMock()

    monkeypatch.setattr(upload, "get_or_create_source", lambda conn: "#1:1")

    conn.query.side_effect = RuntimeError("GraphKB error")

    filename = _write_jsonl(
        tmp_path, [{"id": "temporary-id", "sourceId": "/drugs/example"}]
    )

    upload.upload(input_path=filename, conn=conn)

    fake_tqdm.write.assert_called_once_with("Failed /drugs/example: GraphKB error")

    assert "{'success': 0, 'skipped': 0, 'error': 1}" in capsys.readouterr().out


def test_upload_removes_temporary_id(monkeypatch, tmp_path):
    _disable_tqdm(monkeypatch)

    conn = MagicMock()

    monkeypatch.setattr(upload, "get_or_create_source", lambda conn: "#1:1")

    conn.query.return_value = []

    filename = _write_jsonl(
        tmp_path,
        [{"id": "temporary-id", "sourceId": "/drugs/example", "name": "Example"}],
    )

    upload.upload(input_path=filename, conn=conn)

    payload = conn.post.call_args.args[1]

    assert "id" not in payload
    assert payload["sourceId"] == "/drugs/example"
    assert payload["source"] == "#1:1"


def test_upload_passes_tqdm_description(monkeypatch, tmp_path):
    tqdm_mock = MagicMock()

    tqdm_mock.return_value = []

    monkeypatch.setattr(upload, "tqdm", tqdm_mock)

    conn = MagicMock()

    monkeypatch.setattr(upload, "get_or_create_source", lambda conn: "#1:1")

    filename = _write_jsonl(tmp_path, [])

    upload.upload(input_path=filename, conn=conn)

    tqdm_mock.assert_called_once_with([], desc="Uploading to GraphKB", unit="record")
