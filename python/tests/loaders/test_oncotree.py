from pori_graphkb_loader.loaders.oncotree.loader import (
    CURRENT_VERSION_ID,
    ONCOTREE_API,
)


def test_constants() -> None:
    assert CURRENT_VERSION_ID == 'oncotree_latest_stable'
    assert ONCOTREE_API.startswith('https://')
