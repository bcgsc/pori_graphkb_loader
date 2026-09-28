# Command-line Interface

The loader provides a common command-line interface for importing external data into GraphKB.

During the Python migration, the top-level `graphkb-loader` command dispatches each loader to either its Python implementation or the existing JavaScript implementation.

Snakemake and Docker therefore do not need to know which language implements an individual loader.

## Usage

```bash
graphkb-loader [options] <command>
```

Examples:

```bash
graphkb-loader api oncotree
```

```bash
graphkb-loader file ncit Thesaurus.owl
```

## GraphKB options

| Option | Environment variable | Description |
| --- | --- | --- |
| `--graphkb`, `-g` | `GKB_URL` | GraphKB API URL |
| `--username`, `-u` | `GKB_USER` | GraphKB username |
| `--password`, `-p` | `GKB_PASS` | GraphKB password |
| `--maxRecords` | `GKB_MAX_RECORDS` | Maximum number of records to process |
| `--pubmed` | `PUBMED_API_KEY` | PubMed API key |
| `--errorLogPrefix` | — | Prefix used for loader error logs |

Environment variables are recommended for credentials:

```bash
export GKB_URL="http://localhost:8080/api"
export GKB_USER="graphkb_importer"
export GKB_PASS="secret"

graphkb-loader api oncotree
```

## API loaders

API loaders retrieve their source data directly from an external service.

```bash
graphkb-loader api <loader>
```

Example:

```bash
graphkb-loader api oncotree
```

## File loaders

File loaders operate on one or more downloaded source files.

```bash
graphkb-loader file <loader> <input>
```

Example:

```bash
graphkb-loader file ncit Thesaurus.owl
```

Loader-specific file formats and arguments are documented on the corresponding page under [`loaders/`](loaders/README.md).

## Python CLI

During migration the Python loader implementation can also be called directly:

```bash
cd python
poetry run graphkb-loader-python api oncotree
```

or, after installing the Python package:

```bash
graphkb-loader-python api oncotree
```

This command is primarily useful for development and testing.

Normal workflows should use:

```bash
graphkb-loader
```

so that the implementation language remains transparent.

## JavaScript CLI

The existing JavaScript CLI remains available during migration:

```bash
node bin/load.js --help
```

It should normally be invoked through the common dispatcher rather than called directly.
