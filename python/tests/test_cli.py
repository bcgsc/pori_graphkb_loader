import argparse
from pathlib import Path
from types import ModuleType
from unittest.mock import Mock

import pytest

from pori_graphkb_loader import cli


def test_normalize_loader_name() -> None:
    assert cli._normalize_loader_name('fda-approvals') == 'fda_approvals'
    assert cli._normalize_loader_name('cancer-hotspots') == 'cancer_hotspots'
    assert cli._normalize_loader_name('oncotree') == 'oncotree'


def test_load_action_uses_normalized_module_name(monkeypatch) -> None:
    module = ModuleType('fda_approvals.fetch_data')
    module.fetch_data = Mock()

    import_module = Mock(return_value=module)

    monkeypatch.setattr(cli.importlib, 'import_module', import_module)

    result = cli._load_action(loader='fda-approvals', action='fetch_data')

    assert result is module

    import_module.assert_called_once_with('fda_approvals.fetch_data')


def test_load_action_loader_not_installed(monkeypatch) -> None:
    def raise_missing_module(name: str):
        raise ModuleNotFoundError(f"No module named '{name}'", name='fda_approvals')

    monkeypatch.setattr(cli.importlib, 'import_module', raise_missing_module)

    with pytest.raises(
        RuntimeError,
        match="Loader 'fda-approvals' is not installed",
    ):
        cli._load_action(loader='fda-approvals', action='fetch_data')


def test_load_action_action_not_implemented(monkeypatch) -> None:
    def raise_missing_module(name: str):
        raise ModuleNotFoundError(f"No module named '{name}'", name='fda_approvals.fetch_data')

    monkeypatch.setattr(cli.importlib, 'import_module', raise_missing_module)

    with pytest.raises(
        RuntimeError,
        match="does not implement 'fetch_data'",
    ):
        cli._load_action(loader='fda-approvals', action='fetch_data')


def test_load_action_missing_dependency(monkeypatch) -> None:
    def raise_missing_dependency(name: str):
        raise ModuleNotFoundError("No module named 'playwright'", name='playwright')

    monkeypatch.setattr(cli.importlib, 'import_module', raise_missing_dependency)

    with pytest.raises(
        RuntimeError,
        match="missing dependency 'playwright'",
    ):
        cli._load_action(loader='fda-approvals', action='fetch_data')


def test_fetch_data_parser() -> None:
    module = ModuleType('test_loader.fetch_data')

    parser = cli._action_parser(loader='test-loader', action='fetch_data', module=module)

    args = parser.parse_args(['--output', 'output.json'])

    assert args.output == Path('output.json')


def test_fetch_data_does_not_have_max_records() -> None:
    module = ModuleType('test_loader.fetch_data')

    parser = cli._action_parser(loader='test-loader', action='fetch_data', module=module)

    with pytest.raises(SystemExit):
        parser.parse_args(['--output', 'output.json', '--max-records', '10'])


def test_fetch_data_loader_specific_arguments() -> None:
    module = ModuleType('test_loader.fetch_data')

    def add_arguments(parser: argparse.ArgumentParser) -> None:
        parser.add_argument('--start-year', type=int)

    module.add_arguments = add_arguments

    parser = cli._action_parser(loader='test-loader', action='fetch_data', module=module)

    args = parser.parse_args(['--output', 'output.json', '--start-year', '2020'])

    assert args.output == Path('output.json')
    assert args.start_year == 2020


def test_run_fetch_data() -> None:
    module = ModuleType('test_loader.fetch_data')
    fetch_data = Mock()
    module.fetch_data = fetch_data

    args = argparse.Namespace(output=Path('output.json'), start_year=2020)

    cli._run_fetch_data(module, args)

    fetch_data.assert_called_once_with(output=Path('output.json'), start_year=2020)


def test_upload_parser(monkeypatch) -> None:
    monkeypatch.setenv('GKB_URL', 'http://localhost:8080/api')
    monkeypatch.setenv('GKB_USER', 'graphkb_importer')
    monkeypatch.setenv('GKB_PASS', 'secret')

    module = ModuleType('test_loader.upload')

    parser = cli._action_parser(loader='test-loader', action='upload', module=module)

    args = parser.parse_args(['input.json', '--max-records', '100'])

    assert args.input == Path('input.json')
    assert args.graphkb == 'http://localhost:8080/api'
    assert args.username == 'graphkb_importer'
    assert args.password == 'secret'
    assert args.max_records == 100


def test_upload_loader_specific_arguments() -> None:
    module = ModuleType('test_loader.upload')

    def add_arguments(parser: argparse.ArgumentParser) -> None:
        parser.add_argument('--replace-existing', action='store_true')

    module.add_arguments = add_arguments

    parser = cli._action_parser(
        loader='test-loader',
        action='upload',
        module=module,
    )

    args = parser.parse_args(
        [
            'input.json',
            '--graphkb',
            'http://localhost/api',
            '--username',
            'user',
            '--password',
            'secret',
            '--replace-existing',
        ]
    )

    assert args.replace_existing is True


def test_run_upload(monkeypatch) -> None:
    module = ModuleType('test_loader.upload')
    upload = Mock()
    module.upload = upload

    connection = Mock()

    graphkb_connection = Mock(return_value=connection)

    monkeypatch.setattr(cli, 'GraphKBConnection', graphkb_connection)

    args = argparse.Namespace(
        input=Path('input.json'),
        graphkb='http://localhost:8080/api',
        username='graphkb_importer',
        password='secret',
        max_records=25,
    )

    cli._run_upload(module, args)

    graphkb_connection.assert_called_once_with(
        url='http://localhost:8080/api',
        username='graphkb_importer',
        password='secret',
    )

    upload.assert_called_once_with(input_path=Path('input.json'), conn=connection, max_records=25)


def test_upload_requires_graphkb_url() -> None:
    module = ModuleType('test_loader.upload')
    module.upload = Mock()

    args = argparse.Namespace(
        input=Path('input.json'),
        graphkb=None,
        username='graphkb_importer',
        password='secret',
        max_records=None,
    )

    with pytest.raises(RuntimeError, match='GraphKB URL is required'):
        cli._run_upload(module, args)


def test_upload_requires_username() -> None:
    module = ModuleType('test_loader.upload')
    module.upload = Mock()

    args = argparse.Namespace(
        input=Path('input.json'),
        graphkb='http://localhost/api',
        username=None,
        password='secret',
        max_records=None,
    )

    with pytest.raises(RuntimeError, match='GraphKB username is required'):
        cli._run_upload(module, args)


def test_upload_requires_password() -> None:
    module = ModuleType('test_loader.upload')
    module.upload = Mock()

    args = argparse.Namespace(
        input=Path('input.json'),
        graphkb='http://localhost/api',
        username='graphkb_importer',
        password=None,
        max_records=None,
    )

    with pytest.raises(RuntimeError, match='GraphKB password is required'):
        cli._run_upload(module, args)


def test_main_fetch_data(monkeypatch, tmp_path: Path) -> None:
    module = ModuleType('fda_approvals.fetch_data')
    fetch_data = Mock()
    module.fetch_data = fetch_data

    monkeypatch.setattr(cli, '_load_action', Mock(return_value=module))

    output = tmp_path / 'fda.json'

    cli.main(['fda-approvals', 'fetch_data', '--output', str(output)])

    fetch_data.assert_called_once_with(
        output=output,
    )


def test_main_help(capsys) -> None:
    with pytest.raises(SystemExit) as exc:
        cli.main(['--help'])

    assert exc.value.code == 0

    output = capsys.readouterr().out

    assert 'graphkb-loader' in output
    assert 'fetch_data' in output
    assert 'upload' in output
