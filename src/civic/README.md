# CIViC

> :warning: Since this loader produces statements, ontology and vocabulary data should be loaded first

Loads statements into GraphKB using the [CIViC](https://civicdb.org/) REST API.

```bash
node bin/load.js api civic
```

## About

The `variant.js` module handles all parsing/processing of variant records in CIViC for entry into GraphKB. The corresponding tests are under `test/civic.test.js`.

In general this loader attempts to update existing records based on their CIViC evidence ID, however when the mapping from CIViC evidence record to GraphKB statement is not 1 to 1 then the
statement is sometimes recreated and the old version soft-deleted instead since we cannot resolve tracking between the 2 for these cases.
