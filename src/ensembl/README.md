# Ensembl

This loader loads both a BioMart export TSV file or individual records by ID. It is not required
to batch load Ensembl data but you can do so if you would like it to appear for users who
will use the auto-complete adding variants through GraphKB client

First download the batch export from BioMart

```bash
query_string='<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE Query><Query  virtualSchemaName = "default" formatter = "TSV" header = "1" uniqueRows = "0" count = "" datasetConfigVersion = "0.6" ><Dataset name = "hsapiens_gene_ensembl" interface = "default" ><Filter name = "transcript_biotype" value = "protein_coding"/><Attribute name = "ensembl_gene_id" /><Attribute name = "ensembl_gene_id_version" /><Attribute name = "ensembl_transcript_id" /><Attribute name = "ensembl_transcript_id_version" /><Attribute name = "hgnc_id" /><Attribute name = "refseq_mrna" /><Attribute name = "description" /><Attribute name = "external_gene_name" /><Attribute name = "external_gene_source" /></Dataset></Query>'
wget -O biomart_export.tsv "http://www.ensembl.org/biomart/martservice?query=$query_string"
```

Next use the general file loader

```bash
node bin/loadFile.js ensembl biomart_export.tsv
```
