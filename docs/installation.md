# Installation

The repository contains both JavaScript and Python loaders during the Python migration.

JavaScript dependencies are managed with npm.

Python dependencies are managed independently with Poetry under `python/`.

## Requirements

Development requires:

- Node.js
- Python 3.11 or later
- Poetry
- access to a running GraphKB API
- credentials with permission to import data into GraphKB

Docker can be used instead of installing loader dependencies locally.

## Clone the repository

```bash
git clone https://github.com/bcgsc/pori_graphkb_loader.git
cd pori_graphkb_loader
```

## JavaScript dependencies

Install the existing JavaScript loaders from the repository root:

```bash
npm install
```

Run the JavaScript tests with:

```bash
npm test
```

## Python dependencies

Python code is maintained as a separate Poetry project:

```bash
cd python
poetry install
```

### Install a specific loader

Loader-specific third-party dependencies are exposed as Python extras.

For example:

```bash
poetry install -E oncotree
```

Multiple extras can be installed together:

```bash
poetry install -E oncotree -E ncit
```

Install dependencies for all available Python loaders:

```bash
poetry install --all-extras
```

### Install without Poetry

The Python project builds as a standard Python package and may also be installed with `pip`:

```bash
pip install "pori-graphkb-loader[oncotree]"
```

Poetry is required for development and dependency locking, but is not required by users installing a built package.

## GraphKB connection

Loaders require access to a running GraphKB API.

The following environment variables may be used:

```bash
export GKB_URL="http://localhost:8080/api"
export GKB_USER="graphkb_importer"
export GKB_PASS="secret"
```

Command-line arguments may also be used. See the [CLI documentation](cli.md).

## Docker

For a self-contained installation containing all supported loaders, see [Docker](docker.md).

## Snakemake

To initialize a GraphKB instance using the complete loader workflow, see [Snakemake](snakemake.md).
