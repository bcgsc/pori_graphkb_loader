# COSMiC

This loads fusion and drug resistance data from [COSMiC](https://cancer.sanger.ac.uk/cosmic).

> :warning: Since this loader produces statements, ontology and vocabulary data should be loaded first

First the data must be downloaded. This requires an account

```bash
AUTH=$( echo "$COSMIC_EMAIL:$COSMIC_PASSWORD" | base64 )

# Download resistance mutations
resp=$( curl -H "Authorization: Basic $AUTH" "https://cancer.sanger.ac.uk/api/mono/products/v1/downloads/scripted?path=grch38/cosmic/v103/Cosmic_ResistanceMutations_Tsv_v103_GRCh38.tar&bucket=downloads" );
echo $resp
url=$( node  -e "var resp = $resp; console.log(resp.url);" );
curl "$url" -o Cosmic_ResistanceMutations_Tsv_v103_GRCh38.tar
tar -xf Cosmic_ResistanceMutations_Tsv_v103_GRCh38.tar
gunzip Cosmic_ResistanceMutations_v103_GRCh38.tsv.gz

# Download disease mappings
resp=$( curl -H "Authorization: Basic $AUTH" "https://cancer.sanger.ac.uk/api/mono/products/v1/downloads/scripted?path=grch38/cosmic/v103/Cosmic_Classification_Tsv_v103_GRCh38.tar&bucket=downloads" );
echo $resp
url=$( node  -e "var resp = $resp; console.log(resp.url);" );
curl "$url" -o Cosmic_Classification_Tsv_v103_GRCh38.tar
tar -xf Cosmic_Classification_Tsv_v103_GRCh38.tar
gunzip Cosmic_Classification_v103_GRCh38.tsv.gz

# Download fusion files
resp=$( curl -H "Authorization: Basic $AUTH" "https://cancer.sanger.ac.uk/api/mono/products/v1/downloads/scripted?path=grch38/cosmic/v103/Cosmic_Fusion_Tsv_v103_GRCh38.tar&bucket=downloads" );
echo $resp
url=$( node  -e "var resp = $resp; console.log(resp.url);" );
curl "$url" -o Cosmic_Fusion_Tsv_v103_GRCh38.tar
tar -xf Cosmic_Fusion_Tsv_v103_GRCh38.tar
gunzip Cosmic_Fusion_v103_GRCh38.tsv.gz
```

Since this loader requires 2 files, it is separate from the other more general loaders

```bash
node bin/load.js cosmic resistance Cosmic_ResistanceMutations_v103_GRCh38.tsv Cosmic_Classification_v103_GRCh38.tsv
```

And then to load the fusions (Will create recurrency statements)

```bash
node bin/load.js cosmic fusions Cosmic_Fusion_v103_GRCh38.tsv Cosmic_Classification_v103_GRCh38.tsv
```
