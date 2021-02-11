# COSMiC

This loads fusion and drug resistance data from [COSMiC](https://cancer.sanger.ac.uk/cosmic).

> :warning: Since this loader produces statements, ontology and vocabulary data should be loaded first

First the data must be downloaded. This requires an account

```bash
AUTH=$( echo "$COSMIC_EMAIL:$COSMIC_PASSWORD" | base64 )

# Download resistance mutations
resp=$( curl -H "Authorization: Basic $AUTH" https://cancer.sanger.ac.uk/cosmic/file_download/GRCh38/cosmic/v92/CosmicResistanceMutations.tsv.gz );
echo $resp
url=$( node  -e "var resp = $resp; console.log(resp.url);" );
curl "$url" -o CosmicResistanceMutations.tsv.gz
gunzip CosmicResistanceMutations.tsv.gz

# Download disease mappings
resp=$( curl -H "Authorization: Basic $AUTH" https://cancer.sanger.ac.uk/cosmic/file_download/GRCh38/cosmic/v92/classification.csv );
echo $resp
url=$( node  -e "var resp = $resp; console.log(resp.url);" );
curl "$url" -o classification.csv

# Download fusion files
resp=$( curl -H "Authorization: Basic $AUTH" https://cancer.sanger.ac.uk/cosmic/file_download/GRCh38/cosmic/v92/CosmicFusionExport.tsv.gz );
echo $resp
url=$( node  -e "var resp = $resp; console.log(resp.url);" );
curl "$url" -o CosmicFusionExport.tsv.gz
gunzip CosmicFusionExport.tsv.gz
```

Since this loader requires 2 files, it is separate from the other more general loaders

```bash
node bin/cosmic.js resistance CosmicResistanceMutations.tsv classification.csv
```

And then to load the fusions (Will create recurrency statements)

```bash
node bin/cosmic.js fusions CosmicFusionExport.tsv classification.csv
```
