# Disease Ontology

Load data from the disease ontology. First download the latest version of the JSON formatted release

```bash
REPO=https://github.com/DiseaseOntology/HumanDiseaseOntology.git
LATEST=$(git ls-remote $REPO --tags v\* | cut -f 2 | sed 's/refs\/tags\///' | grep '\bv[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]\b' | sort -d | tail -n 1)
echo "latest version: $LATEST"

wget https://github.com/DiseaseOntology/HumanDiseaseOntology/raw/$LATEST/src/ontology/doid.json

mv doid.json doid_${LATEST}.json
```

Then load this through the general loadFile script

```bash
node bin/loadFile.js diseaseOntology doid_${LATEST}.json
```
