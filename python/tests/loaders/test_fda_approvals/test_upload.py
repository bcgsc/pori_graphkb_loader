from unittest.mock import MagicMock

import pytest

from fda_approval_announcements import upload


def test_get_or_create_source_existing():
    conn = MagicMock()
    conn.query.return_value = [{"@rid": "#1:1"}]

    result = upload.get_or_create_source(conn)

    assert result == "#1:1"
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


@pytest.mark.parametrize(
    ("existing", "expected", "post_count"),
    [
        ([], {"success": 1, "skipped": 0, "error": 0}, 1),
        ([{"@rid": "#2:1"}], {"success": 0, "skipped": 1, "error": 0}, 0),
    ],
)
def test_upload_record(monkeypatch, existing, expected, post_count):
    conn = MagicMock()

    monkeypatch.setattr(upload, "get_or_create_source", lambda conn: "#1:1")

    conn.query.return_value = existing

    records = [
        {
            "name": "FDA approves drug",
            "sourceId": "/drugs/example",
            "url": "https://www.fda.gov/drugs/example",
        }
    ]

    result = upload.upload(conn, records)

    assert result == expected
    assert conn.post.call_count == post_count


def test_upload_new_record_payload(monkeypatch):
    conn = MagicMock()

    monkeypatch.setattr(upload, "get_or_create_source", lambda conn: "#1:1")

    conn.query.return_value = []

    record = {
        "name": "FDA approves drug",
        "sourceId": "/drugs/example",
        "url": "https://www.fda.gov/drugs/example",
    }

    upload.upload(conn, [record])

    conn.post.assert_called_once_with(
        "curated-content",
        {**record, "source": "#1:1"},
    )


def test_upload_multiple_records(monkeypatch):
    conn = MagicMock()

    monkeypatch.setattr(upload, "get_or_create_source", lambda conn: "#1:1")

    conn.query.side_effect = [[], [{"@rid": "#2:1"}]]

    records = [
        {"name": "New record", "sourceId": "/drugs/new"},
        {"name": "Existing record", "sourceId": "/drugs/existing"},
    ]

    result = upload.upload(conn, records)

    assert result == {"success": 1, "skipped": 1, "error": 0}
    assert conn.post.call_count == 1


def test_upload_query(monkeypatch):
    conn = MagicMock()

    monkeypatch.setattr(upload, "get_or_create_source", lambda conn: "#1:1")

    conn.query.return_value = []

    upload.upload(conn, [{"sourceId": "/drugs/example"}])

    conn.query.assert_called_once_with(
        {
            "target": "CuratedContent",
            "filters": {
                "AND": [
                    {"source": "#1:1"},
                    {"sourceId": "/drugs/example"},
                ]
            },
        },
        force_refresh=True,
    )


def test_upload_error(monkeypatch):
    conn = MagicMock()

    monkeypatch.setattr(upload, "get_or_create_source", lambda conn: "#1:1")

    conn.query.side_effect = RuntimeError("GraphKB error")

    result = upload.upload(conn, [{"sourceId": "/drugs/example"}])

    assert result == {"success": 0, "skipped": 0, "error": 1}


def test_read_jsonl(tmp_path):
    filename = tmp_path / "records.jsonl"
    filename.write_text(
        "\n".join(
            [
                '{"sourceId": "/drugs/one", "name": "One"}',
                '{"sourceId": "/drugs/two", "name": "Two"}',
            ]
        )
        + "\n"
    )

    assert upload.read_jsonl(filename) == [
        {"sourceId": "/drugs/one", "name": "One"},
        {"sourceId": "/drugs/two", "name": "Two"},
    ]


@pytest.mark.parametrize(
    ("missing_env", "expected"),
    [
        (("GRAPHKB_URL",), "--graphkb-url / GRAPHKB_URL"),
        (("GRAPHKB_USER",), "--username / GRAPHKB_USER"),
        (("GRAPHKB_PASS",), "--password / GRAPHKB_PASS"),
        (
            ("GRAPHKB_URL", "GRAPHKB_USER", "GRAPHKB_PASS"),
            "Missing required GraphKB configuration",
        ),
    ],
)
def test_main_missing_graphkb_config(
    monkeypatch,
    capsys,
    missing_env,
    expected,
):
    env = {
        "GRAPHKB_URL": "https://graphkb.example",
        "GRAPHKB_USER": "user",
        "GRAPHKB_PASS": "password",
    }

    for key, value in env.items():
        monkeypatch.setenv(key, value)

    for key in missing_env:
        monkeypatch.delenv(key, raising=False)

    monkeypatch.setattr("sys.argv", ["upload", "records.jsonl"])

    with pytest.raises(SystemExit) as exc:
        upload.main()

    assert exc.value.code == 2
    assert expected in capsys.readouterr().err


@pytest.mark.parametrize(
    ("argv", "env", "expected_url", "expected_username", "expected_password"),
    [
        (
            ["upload", "records.jsonl"],
            {
                "GRAPHKB_URL": "https://graphkb.example",
                "GRAPHKB_USER": "env-user",
                "GRAPHKB_PASS": "env-pass",
            },
            "https://graphkb.example",
            "env-user",
            "env-pass",
        ),
        (
            [
                "upload",
                "records.jsonl",
                "--graphkb-url",
                "cli-url",
                "--username",
                "cli-user",
                "--password",
                "cli-pass",
            ],
            {
                "GRAPHKB_URL": "env-url",
                "GRAPHKB_USER": "env-user",
                "GRAPHKB_PASS": "env-pass",
            },
            "cli-url",
            "cli-user",
            "cli-pass",
        ),
    ],
)
def test_main_graphkb_configuration(
    monkeypatch,
    argv,
    env,
    expected_url,
    expected_username,
    expected_password,
):
    for key, value in env.items():
        monkeypatch.setenv(key, value)

    monkeypatch.setattr("sys.argv", argv)

    read_jsonl_mock = MagicMock(return_value=[])
    monkeypatch.setattr(upload, "read_jsonl", read_jsonl_mock)

    conn = MagicMock()
    graphkb_connection = MagicMock(return_value=conn)
    monkeypatch.setattr(upload, "GraphKBConnection", graphkb_connection)

    upload_mock = MagicMock(return_value={})
    monkeypatch.setattr(upload, "upload", upload_mock)

    upload.main()

    graphkb_connection.assert_called_once_with(
        url=expected_url,
        username=expected_username,
        password=expected_password,
        use_global_cache=False,
    )
    read_jsonl_mock.assert_called_once_with("records.jsonl")
    upload_mock.assert_called_once_with(conn, [])


def test_main_reads_and_uploads_jsonl(monkeypatch, tmp_path):
    monkeypatch.setenv("GRAPHKB_URL", "https://graphkb.example")
    monkeypatch.setenv("GRAPHKB_USER", "user")
    monkeypatch.setenv("GRAPHKB_PASS", "password")

    filename = tmp_path / "records.jsonl"
    filename.write_text('{"sourceId": "/drugs/example", "name": "FDA approves drug"}\n')

    monkeypatch.setattr("sys.argv", ["upload", str(filename)])

    conn = MagicMock()
    monkeypatch.setattr(
        upload,
        "GraphKBConnection",
        MagicMock(return_value=conn),
    )

    upload_mock = MagicMock(return_value={"success": 1, "skipped": 0, "error": 0})
    monkeypatch.setattr(upload, "upload", upload_mock)

    upload.main()

    upload_mock.assert_called_once_with(
        conn, [{"sourceId": "/drugs/example", "name": "FDA approves drug"}]
    )
