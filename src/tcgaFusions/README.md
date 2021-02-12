# TCGA Fusions

This loader loads and processes fusion data from the supplementary files of one of the
[publications](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4468049) that was associated with TCGA.

> :warning: Since this creates statements, ontology and vocabulary loaders should be run first so that it
has content to match.

First download the data

```bash
wget https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4468049/bin/NIHMS632238-supplement-2.xlsx
```

Next use the file loader to load it

```bash
node bin/load.js file tcgaFusions NIHMS632238-supplement-2.xlsx
```
