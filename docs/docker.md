# Docker

During the migration from JavaScript to Python, GraphKB loaders are provided in two separate Docker images:

- `bcgsc/pori-graphkb-loader:latest` — existing JavaScript loaders
- `bcgsc/pori-graphkb-loader-python:latest` — Python loaders

Keeping the runtimes separate avoids adding Python, Poetry, Playwright, and other Python-specific dependencies to the existing Node.js image.

## JavaScript loaders

Existing JavaScript loaders continue to use the current image and command-line interface.

For example:

```bash
docker run --rm \
    -e GKB_URL="http://localhost:8080/api" \
    -e GKB_USER="graphkb_importer" \
    -e GKB_PASS="secret" \
    bcgsc/pori-graphkb-loader:latest \
    api oncotree
```

File-based JavaScript loaders can mount source data into the container:

```bash
docker run --rm \
    -e GKB_URL="http://localhost:8080/api" \
    -e GKB_USER="graphkb_importer" \
    -e GKB_PASS="secret" \
    -v "$PWD/data:/data:ro" \
    bcgsc/pori-graphkb-loader:latest \
    file ncit /data/Thesaurus.owl
```

## Python loaders

Python loaders use the Python image:

```text
bcgsc/pori-graphkb-loader-python:latest
```

The image entrypoint is `graphkb-loader`.

Python loaders follow a common interface:

```text
graphkb-loader <loader> fetch_data
graphkb-loader <loader> upload <input>
```

Loader names use hyphens on the command line and are converted internally to Python module names using underscores. For example:

```text
fda-approvals -> fda_approvals
```

### Fetch source data

`fetch_data` retrieves data from the external source and writes it to the filesystem.

For example:

```bash
docker run --rm \
    -v "$PWD/data:/data" \
    bcgsc/pori-graphkb-loader-python:latest \
    fda-approvals fetch_data \
    --output /data/fda_approvals.json
```

Loader-specific fetch options may also be provided where supported.

### Upload data to GraphKB

`upload` reads previously fetched source data and loads it into GraphKB.

For example:

```bash
docker run --rm \
    -e GKB_URL="http://localhost:8080/api" \
    -e GKB_USER="graphkb_importer" \
    -e GKB_PASS="secret" \
    -v "$PWD/data:/data:ro" \
    bcgsc/pori-graphkb-loader-python:latest \
    fda-approvals upload \
    /data/fda_approvals.json
```

The upload command also accepts GraphKB connection options directly where required.

## Python dependencies

Python dependencies are defined independently from the JavaScript project by:

```text
python/pyproject.toml
python/poetry.lock
```

Loader-specific dependencies are installed through Poetry extras. This allows large dependencies such as Playwright to remain optional for users who do not require those loaders.

For example, the FDA approvals loader is installed through the `fda-approvals` extra.

The Python Docker image installs all Python loader extras required by the image. Browser binaries and system dependencies required by Playwright-based loaders are installed during the Docker build.

## JavaScript dependencies

JavaScript dependencies continue to be defined independently by:

```text
package.json
package-lock.json
```

The JavaScript Docker image does not need to contain the Python runtime or Python loader dependencies.

## Snakemake

Snakemake selects the appropriate image for each loader.

For example:

```python
JS_CONTAINER = "docker://bcgsc/pori-graphkb-loader:latest"
PYTHON_CONTAINER = "docker://bcgsc/pori-graphkb-loader-python:latest"
```

Existing JavaScript rules use `JS_CONTAINER`, while ported Python loaders use `PYTHON_CONTAINER`.

This allows loaders to be migrated individually without requiring both runtimes in the same Docker image.

## Migration

During the migration:

- unported loaders continue to run from the JavaScript image;
- ported loaders run from the Python image;
- each Python loader exposes `fetch_data` and `upload` operations;
- source acquisition and GraphKB upload are separate workflow steps.

Once all loaders have been migrated to Python, the JavaScript image can be retired and the Python image can become the primary `pori-graphkb-loader` image.
