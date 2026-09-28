from pori_graphkb_loader.registry import get_loader, get_loaders


def test_get_loader() -> None:
    loader = get_loader('oncotree')

    assert loader.name == 'oncotree'
    assert loader.kind == 'api'
    assert loader.extra == 'oncotree'


def test_get_api_loaders() -> None:
    loaders = get_loaders('api')
    assert 'oncotree' in loaders


def test_get_file_loaders() -> None:
    loaders = get_loaders('file')
    assert 'oncotree' not in loaders
