# GraphKB Python Loaders

Python implementations of loaders for `pori_graphkb_loader`.

GraphKB API access is provided by [`pori_python`](https://github.com/bcgsc/pori_python), including `GraphKBConnection` and common GraphKB client functionality.

## Setup

From the `python/` directory:

```bash
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

The CLI has the form:

```text
graphkb-loader <loader> <action> [options]
```

All loaders support two actions:

- `fetch_data` — retrieve data from the external source and write it to a file.
- `upload` — load previously fetched data into GraphKB.

### Fetch data

Using Poetry:

```bash
poetry run graphkb-loader \
    fda-approvals \
    fetch_data \
    --output data/fda_approvals.jsonl
```

Or after installing the package:

```bash
graphkb-loader \
    fda-approvals \
    fetch_data \
    --output data/fda_approvals.jsonl
```

Loader-specific options are also supported. For example:

```bash
graphkb-loader \
    fda-approvals \
    fetch_data \
    --output data/fda_approvals.jsonl \
    --min-date 2026-01-01
```

### Upload data

GraphKB connection information may be supplied on the command line:

```bash
graphkb-loader \
    fda-approvals \
    upload \
    data/fda_approvals.jsonl \
    --graphkb http://localhost:8080/api \
    --username graphkb_importer \
    --password secret
```

Or through environment variables:

```bash
export GKB_URL=http://localhost:8080/api
export GKB_USER=graphkb_importer
export GKB_PASS=secret

graphkb-loader \
    fda-approvals \
    upload \
    data/fda_approvals.jsonl
```

The module can also be run directly:

```bash
python -m pori_graphkb_loader \
    fda-approvals \
    fetch_data \
    --output data/fda_approvals.jsonl
```

Use `--help` to see available commands and loader-specific options:

```bash
poetry run graphkb-loader --help
```

## Tests

Run the main package tests from `python/`:

```bash
poetry run pytest
```

Individual loaders have their own tests and development dependencies and may also be tested from their project directory.

For example:

```bash
cd src/pori_graphkb_loader/loaders/fda_approvals
poetry run pytest
```

## Adding a loader

Each loader is an independently installable Python package.

Create:

```text
src/pori_graphkb_loader/loaders/<loader>/
├── pyproject.toml
├── <loader>/
│   ├── __init__.py
│   ├── fetch_data.py
│   └── upload.py
└── tests/
    ├── test_fetch_data.py
    └── test_upload.py
```

Use underscores for the Python package name and hyphens for the user-facing loader name.

For example:

```text
CLI/distribution:  fda-approvals
Python package:    fda_approvals
```

The CLI converts hyphens to underscores before importing the loader package.

### `fetch_data.py`

Each loader exposes:

```python
from pathlib import Path


def fetch_data(
    output: Path,
    *,
    # loader-specific arguments
) -> None:
    ...
```

`fetch_data` retrieves data from the external source and writes it to `output`.

Loader-specific CLI arguments may be defined with:

```python
from argparse import ArgumentParser


def add_arguments(parser: ArgumentParser) -> None:
    parser.add_argument(...)
```

The generic CLI parses these arguments and passes them to `fetch_data()`.

### `upload.py`

Each loader exposes:

```python
from pathlib import Path

from pori_python.graphkb import GraphKBConnection


def upload(
    input_path: Path,
    *,
    conn: GraphKBConnection,
    max_records: int | None = None,
    # loader-specific arguments
) -> None:
    ...
```

`upload` reads previously fetched data from `input_path` and uploads it to GraphKB.

The generic CLI creates the `GraphKBConnection` and supplies it as `conn`.

Loader-specific upload arguments may also be defined using:

```python
def add_arguments(parser: ArgumentParser) -> None:
    parser.add_argument(...)
```

`max_records` applies only to the `upload` action.

## Registering a loader

No loader registry is required.

Loaders are discovered by convention. For example:

```text
graphkb-loader fda-approvals fetch_data
```

imports:

```python
fda_approvals.fetch_data
```

and:

```text
graphkb-loader fda-approvals upload
```

imports:

```python
fda_approvals.upload
```

The corresponding loader package must therefore be installed in the active Python environment.

If the loader has dependencies beyond the shared dependencies, define them in the loader's own `pyproject.toml`.

To make the loader available as an optional dependency of the main package, add it to `python/pyproject.toml` as an optional path dependency and expose it through a loader-specific extra.

For example:

```toml
[tool.poetry.dependencies.fda-approvals]
path = "src/pori_graphkb_loader/loaders/fda_approvals"
optional = true
develop = true
```

and:

```toml
[project.optional-dependencies]
fda-approvals = [
    "fda-approvals>=0.1.0,<0.2.0",
]
```

Users can then install it with:

```bash
poetry install -E fda-approvals
```

or install every Python loader with:

```bash
poetry install --all-extras
```

## Poetry lock file

Update the lock file whenever Python dependencies or loader path dependencies change:

```bash
poetry lock
```
