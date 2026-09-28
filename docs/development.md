# Development

The repository contains JavaScript and Python implementations during the migration to Python.

The two language environments are intentionally managed independently.

```text
package.json
package-lock.json
    JavaScript dependencies

python/pyproject.toml
python/poetry.lock
    Python dependencies
```

## JavaScript development

Install dependencies:

```bash
npm install
```

Run tests:

```bash
npm test
```

Existing JavaScript loaders remain supported until their Python replacements have been validated.

## Python development

Enter the Python project:

```bash
cd python
```

Install development dependencies:

```bash
poetry install
```

Install a loader-specific extra:

```bash
poetry install -E oncotree
```

Install all loader extras:

```bash
poetry install --all-extras
```

Run tests:

```bash
poetry run pytest
```

Run linting:

```bash
poetry run ruff check .
```

Run formatting:

```bash
poetry run ruff format .
```

Run type checking:

```bash
poetry run mypy src
```

## Python loader structure

Each Python loader is located under:

```text
python/src/pori_graphkb_loader/loaders/<loader>/
```

A simple loader generally contains:

```text
<loader>/
├── __init__.py
└── loader.py
```

More complex loaders may be divided into:

```text
<loader>/
├── __init__.py
├── loader.py
├── client.py
├── models.py
├── transform.py
└── constants.py
```

Suggested responsibilities:

| Module | Responsibility |
| --- | --- |
| `loader.py` | Orchestrates the import |
| `client.py` | Communicates with the external data source |
| `models.py` | Represents source-specific data |
| `transform.py` | Converts source data to GraphKB representations |
| `constants.py` | Source-specific constants |

Do not create modules merely to satisfy this layout. Simple loaders should remain simple.

## GraphKB access

Python loaders use `GraphKBConnection` from [`pori_python`](https://github.com/bcgsc/pori_python).

Do not implement separate GraphKB HTTP, authentication, retry, or query clients in this repository unless functionality is genuinely loader-specific.

A loader receives an authenticated connection through its loader options.

For example:

```python
def upload(*, options: LoaderOptions) -> None:
    conn = options.conn

    records = conn.query(...)
```

## API loaders

API loaders expose:

```python
def upload(*, options: LoaderOptions) -> None:
    ...
```

## File loaders

File loaders expose:

```python
def upload_file(
    *,
    filename: Path,
    options: LoaderOptions,
) -> None:
    ...
```

## Adding a Python loader

1. Create the loader package under `python/src/pori_graphkb_loader/loaders/`.
2. Add the loader to `registry.py`.
3. Add any loader-specific dependencies as optional dependencies in `python/pyproject.toml`.
4. Add a corresponding Python extra.
5. Add tests under `python/tests/loaders/`.
6. Add or update `docs/loaders/<loader>.md`.
7. Validate the Python output against the existing JavaScript implementation.
8. Update the top-level loader catalogue to mark the implementation as Python.
9. Remove the JavaScript implementation only after equivalence has been established.

## Dependency rules

Shared Python dependencies should be added to the main Poetry dependency set only when they are required by most or all Python loaders.

Loader-specific dependencies should remain optional extras.

For example:

```toml
[tool.poetry.dependencies]
pori-python = "^1.5"

rdflib = { version = "^7.0", optional = true }

[tool.poetry.extras]
ncit = ["rdflib"]
```

Loader packages should not depend on other loader packages.

If one source must be loaded before another, that ordering belongs in Snakemake.

## Documentation

Each loader has one canonical user-facing document:

```text
docs/loaders/<loader>.md
```

Source-directory documentation should contain implementation notes only and should not duplicate user documentation.
