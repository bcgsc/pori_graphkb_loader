# Functional Impact Statements

This loader loads and processes fusion data from the supplementary files of the following
[publication](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4232638).

> :warning: Since this creates statements, ontology and vocabulary loaders should be run first so that it
has content to match.

First download the data

```bash
wget https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4232638/bin/13059_2014_484_MOESM2_ESM.xlsx
```

Next use the file loader to load it

```bash
node bin/load.js file PMC4232638 13059_2014_484_MOESM2_ESM.xlsx
```
