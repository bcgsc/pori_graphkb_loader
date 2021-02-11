# ClinicalTrials.gov

This module loads clinical trials data into GraphKB from [https://www.clinicaltrials.gov](https://www.clinicaltrials.gov/).

> :warning: Since this loader produces statements, ontology and vocabulary data should be loaded first

## Multiple XML Files

Loads Trial records from XML files. See: [https://clinicaltrials.gov/ct2/resources/download#DownloadMultipleRecords](https://clinicaltrials.gov/ct2/resources/download#DownloadMultipleRecords)

```bash
wget https://clinicaltrials.gov/AllPublicXML.zip
unzip AllPublicXML.zip
```

Then you can load these by pointing directly to the sub-folders

```bash
for folder in AllPublicXML/*;
do
    echo "Loading folder: $folder"
    node bin/clinicaltrialsgov.js --dir $folder
done
```
