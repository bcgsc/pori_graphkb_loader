# NCI Thesuarus

First download the latest version of the plain text tab delimited files. This should include both
the main thesaurus file

```bash
wget https://evs.nci.nih.gov/ftp1/NCI_Thesaurus/archive/
LATEST=$(cat index.html | grep '"[0-9][0-9]*\.[0-9][0-9][a-z]*_Release' -o | grep -o '[0-9][0-9]*\.[0-9][0-9][a-z]*' | tail -n 1)
rm index.html
echo "Latest Release: $LATEST"

NAME=Thesaurus_$LATEST
wget https://evs.nci.nih.gov/ftp1/NCI_Thesaurus/archive/${LATEST}_Release/Thesaurus_${LATEST}.FLAT.zip

unzip ${NAME}.FLAT.zip
rm ${NAME}.FLAT.zip
mv Thesaurus.txt Thesaurus_v${LATEST}.txt
rm -rf __MACOSX
```

As well as the FDA cross-mapping reference file

```bash
wget https://evs.nci.nih.gov/ftp1/FDA/UNII/Archive/
LATEST=$(cat index.html | grep -P  'href="[^"]+txt"' -o | cut -f 2 -d\" | sort | tail -n 1)
rm index.html
echo "Latest Release: $LATEST"
wget https://evs.nci.nih.gov/ftp1/FDA/UNII/Archive/$LATEST
```

Next use the general file loader to load the NCIt terms

```bash
node bin/loadFile ncit Thesaurus_v*.txt
```

Then, after you have loaded the [FDA-SRS](../fdaSrs/README.md) data (if you are planning to load it)
load the cross-reference mapping data

```bash
node bin/loadFile ncitFdaXref FDA-UNII_NCIt_Subsets_*.txt
```
