# Cancer Hotspots

> :warning: Since this loader produces statements, ontology and vocabulary data should be loaded first

First fetch the data

```bash
wget http://download.cbioportal.org/cancerhotspots/cancerhotspots.v2.maf.gz
gunzip cancerhotspots.v2.maf.gz
```

Then load with the general file loader

```bash
node bin/loadFile.js cancerhotspots cancerhotspots.v2.maf
```
