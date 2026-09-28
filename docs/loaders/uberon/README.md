# Uberon

Loads the [Uberon](https://uberon.github.io/) anantomy ontology. First download the data

```bash
# get the list of releases as index.html
wget http://purl.obolibrary.org/obo/uberon/releases/

# figure out which is the latest release
RELEASE=$(grep li index.html | tail -n 1 | grep -P '\d+-\d\d-\d\d' -o | head -n 1)

# clean up the index.html file
rm index.html

# Fetch the latest release
wget http://purl.obolibrary.org/obo/uberon/releases/$RELEASE/uberon.owl
mv uberon.owl uberon_v${RELEASE}.owl
```

Then load the terms into GraphKB

> :warning: This resource contains cross-reference mappings to [NCIt](../ncit) so it preferred to load after loading NCIt

```bash
node bin/load.js file uberon uberon_v*.owl
```
