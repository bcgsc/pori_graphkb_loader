# NCI Thesaurus

First download the latest version of the plain text tab delimited files. This should include both
the main thesaurus file and the cross mapping file

- [NCI Thesaurus](#nci-thesaurus)
  - [Load the Main Flat File](#load-the-main-flat-file)
  - [FDA Cross Mapping File](#fda-cross-mapping-file)

## Load the Main Flat File

Download the file

```bash
wget https://evs.nci.nih.gov/ftp1/NCI_Thesaurus/Thesaurus.FLAT.zip
unzip Thesaurus.FLAT.zip
rm Thesaurus.FLAT.zip
```

This is a headerless tab delimited file with the following
[format](https://evs.nci.nih.gov/ftp1/NCI_Thesaurus/ReadMe.txt)

- code
- concept IRI
- parents
- synonyms
- definition
- display name
- concept status
- semantic type
- concept in subset

Next use the general file loader to load the NCIt terms

```bash
node bin/load.js file ncit Thesaurus.txt
```

## FDA Cross Mapping File

Now download the FDA cross-mapping reference file

```bash
wget https://evs.nci.nih.gov/ftp1/FDA/UNII/FDA-UNII_NCIt_Subsets.txt
```

Then, after you have loaded the [FDA-SRS](../fdaSrs) data (if you are planning to load it)
load the cross-reference mapping data

```bash
node bin/load.js file ncitFdaXref FDA-UNII_NCIt_Subsets.txt
```
