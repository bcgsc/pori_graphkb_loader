# DrugBank

Download the complete latest [DrugBank](https://go.drugbank.com/) Data as XML. You will need an account

```bash
wget https://www.drugbank.ca/releases
latest=$(grep 'href="/releases/[^"]*"' -o releases | cut -f 3 -d/ | sed 's/"//' | sort -V | tail -n 2 | head -n 1)
echo "newest version: $latest"
rm releases
filename="drugbank_all_full_database_v$latest".xml
echo $filename

curl -Lfv -o ${filename}.zip -u $DRUGBANK_EMAIL:$DRUGBANK_PASSWORD https://go.drugbank.com/releases/5-1-8/downloads/all-full-database
unzip ${filename}.zip
mv full\ database.xml $filename
```

Then use the general file loader to load this into GraphKB

```bash
node bin/load.js file drugbank full_database.xml
```

> :warning: Since this contains cross-mappings to [FDA-SRS](../fdaSrs) UNII identifiers it is useful to load that file
first
