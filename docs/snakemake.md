# `docs/snakemake.md`

# Snakemake

A Snakemake workflow is provided to initialize GraphKB by running loaders in the required order.

Dependency relationships between loaders belong in the Snakemake workflow rather than in the Python or JavaScript package dependency graphs.

## Installation

Install Snakemake in an environment appropriate for your system.

For example:

```bash
python3 -m venv .venv
source .venv/bin/activate

pip install --upgrade pip
pip install snakemake
```

## Running the workflow

Run the workflow using a single job:

```bash
snakemake -j 1
```

GraphKB credentials can be supplied through the workflow configuration:

```bash
snakemake -j 1 \
    --config \
    gkb_user="graphkb_importer" \
    gkb_pass="secret" \
    gkb_url="http://localhost:8080/api"
```

Environment variables may also be used where supported:

```bash
export GKB_USER="graphkb_importer"
export GKB_PASS="secret"
export GKB_URL="http://localhost:8080/api"

snakemake -j 1
```

## Loader command

Workflow rules should invoke the common loader command:

```text
graphkb-loader
```

Rules should not directly invoke:

```text
node ...
python ...
poetry run ...
```

This keeps Snakemake independent of each loader's implementation language.

For example:

```python
rule load_oncotree:
    input:
        rules.load_ncit.output

    output:
        "data/oncotree.COMPLETE"

    log:
        "logs/oncotree.logs.txt"

    container:
        CONTAINER

    shell:
        """
        graphkb-loader api oncotree &> {log}
        cp {log} {output}
        """
```

A loader can therefore be migrated from JavaScript to Python without changing its workflow rule.

## Containers

Individual rules may run using the GraphKB Loader container.

The container reference should be configurable rather than hard-coded where possible.

For example:

```python
CONTAINER = (
    config.get("loader_container")
    or os.environ.get("GKB_LOADER_CONTAINER")
    or "docker://bcgsc/pori-graphkb-loader:latest"
)
```

Then:

```bash
snakemake \
    --config loader_container="docker://bcgsc/pori-graphkb-loader:<version>"
```

## Licensed sources

Some data sources require credentials or licenses and may be excluded from the default workflow.

Loader-specific requirements are documented under [`loaders/`](loaders/README.md).
