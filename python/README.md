# GraphKB Python Loaders

Python implementations of loaders for `pori_graphkb_loader`.

GraphKB API access is provided by [`pori_python`](https://github.com/bcgsc/pori_python),
including `GraphKBConnection` and the common GraphKB client functionality.

## Setup

From this directory:

```bash
poetry lock
poetry install
```

Install a specific loader extra:

```bash
poetry install -E fda-approvals
```

Install all Python loader extras:

```bash
poetry install --all-extras
```

The built package can also be installed without Poetry:

```bash
pip install "pori-graphkb-loader[fda-approvals]"
```

## Running

Using Poetry:

```bash
poetry run graphkb-loader-python \
    --graphkb http://localhost:8080/api \
    --username graphkb_importer \
    --password secret \
    fda-approvals
```

Or after installing the package:

```bash
graphkb-loader-python \
    --graphkb http://localhost:8080/api \
    --username graphkb_importer \
    --password secret \
    api oncotree
```

The module can also be run directly:

```bash
python -m pori_graphkb_loader \
    --graphkb http://localhost:8080/api \
    --username graphkb_importer \
    --password secret \
    api oncotree
```

Environment variables are supported:

```bash
export GKB_URL=http://localhost:8080/api
export GKB_USER=graphkb_importer
export GKB_PASS=secret

poetry run graphkb-loader-python api oncotree
```

## Tests

```bash
poetry run pytest
```

## Adding a loader

Create:

```text
src/pori_graphkb_loader/loaders/<loader>/
├── __init__.py
└── loader.py
```

API loaders expose:

```python
def upload(*, options: LoaderOptions) -> None:
    ...
```

File loaders expose:

```python
def upload_file(*, filename: Path, options: LoaderOptions) -> None:
    ...
```

Then add a `LoaderSpec` entry to `registry.py`.

If the loader needs third-party packages beyond the shared dependencies, add those packages
as optional dependencies in `pyproject.toml` and associate them with a loader-specific extra.

## Poetry lock file

`poetry.lock` is intentionally not included in this scaffold. Generate it from the actual
environment and package index with:

```bash
poetry lock
```
