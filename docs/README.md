# GraphKB Loader Documentation

`pori_graphkb_loader` imports external ontologies and knowledge bases into GraphKB.

The repository currently contains JavaScript loaders and is being incrementally migrated to Python. Both implementations use the same Docker and Snakemake workflows.

## Documentation

- [Installation](installation.md)
- [Command-line interface](cli.md)
- [Docker](docker.md)
- [Snakemake](snakemake.md)
- [Development](development.md)
- [Loaders](loaders/README.md)

## Loader documentation

Each loader has a dedicated page describing:

- source data
- installation requirements
- usage
- GraphKB mappings
- source-specific behavior
- testing

See the [loader catalogue](loaders/README.md).
