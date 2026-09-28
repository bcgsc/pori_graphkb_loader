from pori_graphkb_loader.cli import create_parser


def test_parse_api_loader() -> None:
    parser = create_parser()

    args = parser.parse_args(
        [
            '--password',
            'secret',
            'api',
            'oncotree',
        ]
    )

    assert args.command == 'api'
    assert args.module == 'oncotree'
    assert args.password == 'secret'


def test_graphkb_arguments() -> None:
    parser = create_parser()

    args = parser.parse_args(
        [
            '--graphkb',
            'http://localhost:8080/api',
            '--username',
            'graphkb_importer',
            '--password',
            'secret',
            'api',
            'oncotree',
        ]
    )

    assert args.graphkb == 'http://localhost:8080/api'
    assert args.username == 'graphkb_importer'
