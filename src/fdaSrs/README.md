# FDA Substance Registration System

These are drug names and identifiers used by the [FDA SRS](https://fdasis.nlm.nih.gov/srs/).

First download the data which should be in a TEXT format

```bash
wget https://fdasis.nlm.nih.gov/srs/download/srs/UNII_Data.zip
unzip UNII_Data.zip
rm UNII_Data.zip

rm "README UNII_Lists.txt"

for filename in UNII*txt
do
    echo $filename
    mv "$filename" "${filename// /_}";
done
```

Now use the general file loader to load this into GraphKB

```bash
node bin/loadFile.js fdaSrs UNII*.txt
```

> :warning: Since this file contains cross-reference mappings to [NCIt](../ncit/README.md), it is useful to load NCIt first.
