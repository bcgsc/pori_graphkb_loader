# Cancer Genome Interpreter (CGI)

> :warning: Since this loader produces statements, ontology and vocabulary data should be loaded first

Loads Statements from [Cancer Genome Intepreter](https://www.cancergenomeinterpreter.org/biomarkers)
files.

First, download the data

```bash
wget https://www.cancergenomeinterpreter.org/data/biomarkers/cgi_biomarkers_latest.tsv
```

Then load into graphkb

```bash
node bin/load.js file cgi cgi_biomarkers_latest.tsv
```
