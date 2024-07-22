# General Ontology file (JSON)

Any ontology can be uploaded (for a single record class) as long as the JSON file is
in the expected custom GraphKB JSON format as detailed. There are a number of examples included
by default in this repository

- [GraphKB General Vocabulary](../../data/vocab.json)
- [Molecular Signatures](../../data/signatures.json)
- [Basic Chromosomes](../../data/chromosomes.json)
- [Cross-KB Evidence Levels](../../data/evidenceLevels.json)

The file should have a source definition. This must contain at least a name, but
may optionally include any of the attributes expected for a source definition (ex. description, url, usage).

```json
{
    "sources": {
        "default": {"name": "pubmed"}
    }
}
```

The class of records this ontology belongs to must also be defined.

```json
{
    "sources": {
        "default": {"name": "pubmed"}
    },
    "class": "Publication"
}
```

The last top level attribute is the records. This must be an object. The keys will be used
as the record sourceId if an explicit sourceId is not given.

```json
{
    "sources": {
        "default": {"name": "pubmed"}
    },
    "class": "Publication",
    "records": {
        "<key1>": {},
        "<key1>": {}
    }
}
```

Each record will then define the properties of each ontology term.

```json
{
    "sources": {
        "default": {"name": "pubmed"}
    },
    "class": "Publication",
    "records": {
        "19584866": {
            "name": "a small molecule blocking oncogenic protein ews-fli1 interaction with rna helicase a inhibits growth of ewing's sarcoma.",
            "year": "2009",
            "journalName": "nature medicine"
        }
    }
}
```

Links within the ontology can also be defined. These are given via a property on
the ontology term

```json
{
    "name": "a small molecule blocking oncogenic protein ews-fli1 interaction with rna helicase a inhibits growth of ewing's sarcoma.",
    "links": [
        {"class": "<Relationship type>", "target": "<key of another term>"}
    ]
}
```

Once this file has been built it can be loaded as follows. The script will create records if they do not already exist. Any conflicts will be reported in the logging

```bash
node bin/load.js file ontology </path/to/json/file>
```
