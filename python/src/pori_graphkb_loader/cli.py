import argparse
import importlib
import importlib.util
import os
from collections.abc import Sequence
from pathlib import Path
from types import ModuleType

from pori_python.graphkb import GraphKBConnection

ACTIONS = ('fetch_data', 'upload')


def _normalize_loader_name(loader: str) -> str:
    """Convert CLI names such as fda-approvals to Python module names."""
    return loader.replace('-', '_')


def _load_action(loader: str, action: str) -> ModuleType:
    """Import <loader>.<action>."""

    package = _normalize_loader_name(loader)
    module_name = f'{package}.{action}'

    try:
        module = importlib.import_module(module_name)
    except ModuleNotFoundError as exc:
        if exc.name == package:
            raise RuntimeError(
                f"Loader '{loader}' is not installed.\n"
                f'Install it with:\n'
                f'  poetry install -E {loader}'
            ) from exc

        if exc.name == module_name:
            raise RuntimeError(f"Loader '{loader}' does not implement '{action}'.") from exc

        raise RuntimeError(f"Loader '{loader}' is missing dependency '{exc.name}'.") from exc

    func = getattr(module, action, None)

    if func is None or not callable(func):
        raise RuntimeError(
            f"Loader '{loader}' does not implement a callable {action}() in {module_name}."
        )

    return module


def _base_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog='graphkb-loader',
        description='Fetch external source data and upload it to GraphKB.',
    )

    parser.add_argument('loader', help='Loader name, e.g. fda-approvals')

    parser.add_argument(
        'action',
        choices=ACTIONS,
        help='Action to perform',
    )

    return parser


def _action_parser(
    loader: str,
    action: str,
    module: ModuleType,
) -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog=f'graphkb-loader {loader} {action}',
    )

    if action == 'fetch_data':
        parser.add_argument(
            '-o',
            '--output',
            type=Path,
            required=True,
            help='Path where fetched source data will be written',
        )

    elif action == 'upload':
        parser.add_argument(
            'input',
            type=Path,
            help='Previously fetched source data to upload',
        )

        parser.add_argument(
            '-g',
            '--graphkb',
            default=os.getenv('GKB_URL'),
            help='GraphKB API URL (env: GKB_URL)',
        )

        parser.add_argument(
            '-u',
            '--username',
            default=os.getenv('GKB_USER'),
            help='GraphKB username (env: GKB_USER)',
        )

        parser.add_argument(
            '-p',
            '--password',
            default=os.getenv('GKB_PASS'),
            help='GraphKB password (env: GKB_PASS)',
        )

        parser.add_argument(
            '--max-records',
            type=int,
            default=None,
            help='Maximum number of records to process',
        )

    # Loader-specific arguments may be added by defining:
    #
    #     def add_arguments(parser):
    #         parser.add_argument(...)
    #
    # in either fetch_data.py or upload.py.
    add_arguments = getattr(module, 'add_arguments', None)

    if add_arguments is not None:
        add_arguments(parser)

    return parser


def _run_fetch_data(
    module: ModuleType,
    args: argparse.Namespace,
) -> None:
    fetch_data = getattr(module, 'fetch_data', None)

    if fetch_data is None:
        raise RuntimeError('Loader does not implement fetch_data().')

    kwargs = vars(args).copy()
    output = kwargs.pop('output')

    fetch_data(output=output, **kwargs)


def _run_upload(
    module: ModuleType,
    args: argparse.Namespace,
) -> None:
    upload = getattr(module, 'upload', None)

    if upload is None:
        raise RuntimeError('Loader does not implement upload().')

    if not args.graphkb:
        raise RuntimeError('GraphKB URL is required. Use --graphkb or set GKB_URL.')

    if not args.username:
        raise RuntimeError('GraphKB username is required. Use --username or set GKB_USER.')

    if not args.password:
        raise RuntimeError('GraphKB password is required. Use --password or set GKB_PASS.')

    conn = GraphKBConnection(
        url=args.graphkb,
        username=args.username,
        password=args.password,
    )

    kwargs = vars(args).copy()

    input_path = kwargs.pop('input')
    kwargs.pop('graphkb')
    kwargs.pop('username')
    kwargs.pop('password')

    upload(input_path=input_path, conn=conn, **kwargs)


def main(argv: Sequence[str] | None = None) -> None:
    base_parser = _base_parser()

    args, remaining = base_parser.parse_known_args(argv)

    module = _load_action(loader=args.loader, action=args.action)

    action_parser = _action_parser(loader=args.loader, action=args.action, module=module)

    action_args = action_parser.parse_args(remaining)

    if args.action == 'fetch_data':
        _run_fetch_data(module, action_args)
    else:
        _run_upload(module, action_args)


if __name__ == '__main__':
    main()
