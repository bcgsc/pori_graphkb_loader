# GraphKB Importer

This package is used to import content from a variety of sources into GraphKB using the API.

Automatic Import modules are provided for a variety of input sources. To Start importing external data, first the GraphKB API
must already be running. Then the command line interface can be used for upload. Get the help menu
detailing the commands and required inputs as follows

```bash
npm start -- --help
```

If loaded in order, some modules will link to one another.

### Table Of Contents

- [Guidelines for Developers](#guidelines-for-developers)
  - [Style](#style)
  - [Getting Started](#getting-started)
- [Ontology Import Modules](#ontology-import-modules)
  - [General Ontology JSON file](#general-ontology-json-file)
  - [clinicaltrials.gov](#clinicaltrialsgov)
  - [Disease Ontology](#disease-ontology)
  - [DrugBank](#drugbank)
  - [Ensembl](#ensembl)
  - [FDA](#fda)
  - [GSC Therapeutic Ontology](#gsc-therapeutic-ontology)
  - [HGNC](#hgnc)
  - [NCIT](#ncit)
  - [Oncotree](#oncotree)
  - [Refseq](#refseq)
  - [Sequence Ontology](#sequence-ontology)
  - [Uberon](#uberon)
  - [VariO](#vario)
- [Knowledgebase Import Modules](#knowledgebase-import-modules)
  - [CIViC](#civic)
  - [COSMIC](#cosmic)
  - [DoCM](#docm)
  - [OncoKB](#oncokb)

## Guidelines for Developers

### Style

1. In-code documentation should follow [JSDocs](http://usejsdoc.org) format
2. TDD. New tests should be added for any new functionality. Using mocha (https://mochajs.org/) for testing. As mocha has several
   test styles, please match the existing style in the current tests.
3. API must follow REST guidelines (for example see https://github.com/Microsoft/api-guidelines/blob/vNext/Guidelines.md)
4. JS code should be written with ES6 syntax (where possible) see https://github.com/lukehoban/es6features

### Getting Started

Clone the repository

```bash
git clone https://svn.bcgsc.ca/bitbucket/scm/dat/knowledgebase_importer.git
cd knowledgebase_importer
git checkout develop
```

Install the dependencies

```bash
npm install
```

run the tests

```bash
npm run test
```

## Ontology Import Modules

### General Ontology JSON file

Any ontology can be uploaded (without cross reference links) as long as the JSON file is in the expected format.

The file should have a source definition. This must contain at least a name, but
may optionally include any of the attributes expected for a source definition (ex. description, url, usage).

```json
{
    "source": {
        "name": "pubmed"
    }
}
```

The class of records this ontology belongs to must also be defined.

```json
{
    "source": {
        "name": "pubmed"
    },
    "class": "Publication"
}
```

The last top level attribute is the records. This must be an object where the
sourceId of each record is its key

```json
{
    "source": {
        "name": "pubmed"
    },
    "class": "Publication",
    "records": {
        "<sourceId1>": {},
        "<sourceId2>": {}
    }
}
```

Each record will then define the properties of each ontology term.

```json
{
    "source": {
        "name": "pubmed"
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
        {"class": "<Relationship type>", "target": "<sourceId of another term>"}
    ]
}
```

Once this file has been built it can be loaded as follows. The script will create records if they do not already exist. Any conflicts will be reported in the logging

```bash
npm start -- --ontology /path/to/json/file
```


---



### clinicaltrials.gov

|                 |                                                                |
| --------------- | -------------------------------------------------------------- |
| About           | https://clinicaltrials.gov                                     |
| Usage           | https://clinicaltrials.gov/ct2/about-site/terms-conditions#Use |
| Example         |                                                                |
| Format          | XML                                                            |
| CrossReferences | Loaded Drug/Disease Ontologies                                 |

Loads an XML file. The XML file is expected to be exported from the clinicaltrials.gov website. To retrieve
the expected file, follow the steps below

 * Perform a search on their site, for example https://clinicaltrials.gov/ct2/results?recrs=ab&cond=Cancer&term=&cntry=CA&state=&city=&dist=
 * Click their Download link/Button
 * Adjust the settings in the Pop up dialog (Include all studies, all columns, and export as XML)
 * Download and save the file
 * Upload the file to GraphKB using this module

```bash
npm start -- --clinicaltrialsgov download.xml
```


---

### Disease Ontology

|                 |                                                                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| About           | http://disease-ontology.org/about/                                                                                            |
| Usage           |                                                                                                                               |
| Example         | https://raw.githubusercontent.com/DiseaseOntology/HumanDiseaseOntology/v2018-07/05/src/ontology/releases/2018-07-05/doid.json |
| Format          | JSON                                                                                                                          |
| CrossReferences | [NCIT](#ncit)                                                                                                                 |

The disease ontology releases their data dumps as both XML and JSON from thei github page. We expect the JSON format

Once downloaded the JSON file can be loaded as follows

```bash
npm start -- --diseaseOntology doid.json
```


---

### DrugBank

|                 |                                                                    |
| --------------- | ------------------------------------------------------------------ |
| About           | https://www.drugbank.ca/about                                      |
| Usage           | https://www.drugbank.ca/legal/terms_of_use                         |
| Example         | https://www.drugbank.ca/releases/5-1-1/downloads/all-full-database |
| Format          | XML                                                                |
| CrossReferences | [FDA](#fda); `CHEMBL (API)`; [HGNC (API)](#hgnc)                   |

```bash
npm start -- --drugbank data.xml
```


---

### Ensembl

|                 |                                                             |
| --------------- | ----------------------------------------------------------- |
| About           | https://uswest.ensembl.org                                  |
| Usage           | https://uswest.ensembl.org/info/about/legal/disclaimer.html |
| Example         |                                                             |
| Format          | Tab delimited                                               |
| CrossReferences | [RefSeq](#refseq), [HGNC (API)](#hgnc)                      |

This requires a BioMart Export with the minimum following columns included

- Gene stable ID
- Version (gene)
- Transcript stable ID
- Version (transcript)
- Chromosome/scaffold name
- HGNC ID
- HGNC symbol
- RefSeq mRNA ID
- LRG display in Ensembl gene ID
- Protein stable ID
- Protein stable ID version
- Gene name
- Source of gene name

```bash
npm start -- --ensembl ensembl_mart_export.tab
```


---

### FDA

|                 |                                                                                                                      |
| --------------- | -------------------------------------------------------------------------------------------------------------------- |
| About           | https://www.fda.gov/ForIndustry/DataStandards/SubstanceRegistrationSystem-UniqueIngredientIdentifierUNII/default.htm |
| Usage           |                                                                                                                      |
| Example         | https://fdasis.nlm.nih.gov/srs/download/srs/UNII_Data.zip                                                            |
| Format          | Tab delimited                                                                                                        |
| CrossReferences | [NCIT](#ncit)                                                                                                        |

```bash
npm start -- --fda UNII_Records_25Oct2018.txt
```


---

### GSC Therapeutic Ontology

|                 |                                                                                                |
| --------------- | ---------------------------------------------------------------------------------------------- |
| About           | https://www.bcgsc.ca/jira/browse/KBDEV-496                                                     |
| Usage           |                                                                                                |
| Example         | https://www.bcgsc.ca/jira/secure/attachment/168215/Drug_ontology_drugbank_IDs_draft_190507.txt |
| Format          | Tab delimited                                                                                  |
| CrossReferences | [Drugbank](#drugbank)                                                                          |

```bash
npm start -- --drugOntology drug_ontology.txt
```


---


### HGNC

|                 |                                                                                                 |
| --------------- | ----------------------------------------------------------------------------------------------- |
| About           | https://www.genenames.org/about/overview                                                        |
| Usage           | https://www.ebi.ac.uk/about/terms-of-use                                                        |
| Example         | ftp://ftp.ebi.ac.uk/pub/databases/genenames/new/json/locus_types/gene_with_protein_product.json |
| Format          | JSON                                                                                            |
| CrossReferences | [Ensembl](#ensembl);  `Entrez Gene (API)`                                                       |

```bash
npm start -- --hgnc hgnc_complete_set.json
```


---

### NCIT

|                 |                                                                      |
| --------------- | -------------------------------------------------------------------- |
| About           | https://cbiit.cancer.gov/about/about-cbiit                           |
| Usage           | https://creativecommons.org/licenses/by/4.0                          |
| Example         | https://evs.nci.nih.gov/ftp1/NCI_Thesaurus/Thesaurus_19.05d.FLAT.zip |
| Format          | tab-delimited                                                        |
| CrossReferences |                                                                      |

```bash
npm start -- --ncit Thesaurus_18.06d.txt
```


---

### Oncotree

|                 |                                  |
| --------------- | -------------------------------- |
| About           | http://oncotree.mskcc.org/#/home |
| Usage           |                                  |
| Example         | http://oncotree.mskcc.org/api    |
| Format          | REST (JSON)                      |
| CrossReferences | [NCIT](#ncit)                    |

This importer pulls all versions of Oncotree directly from the Oncotree API and links them together

```bash
npm start -- --oncotree
```


---

### Refseq

|                 |                                                                   |
| --------------- | ----------------------------------------------------------------- |
| About           | https://www.ncbi.nlm.nih.gov/refseq                               |
| Usage           | https://www.ncbi.nlm.nih.gov/home/about/policies                  |
| Example         | ftp://ftp.ncbi.nih.gov/refseq/H_sapiens/RefSeqGene/LRG_RefSeqGene |
| Format          | Tab delimited                                                     |
| CrossReferences | [HGNC (API)](#hgnc)                                               |


```bash
npm start -- --refseq LRG_RefSeqGene.tab
```


---

### Sequence Ontology

|                 |                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------ |
| About           | http://www.sequenceontology.org                                                            |
| Usage           | http://www.sequenceontology.org/?page_id=269                                               |
| Example         | https://raw.githubusercontent.com/The-Sequence-Ontology/SO-Ontologies/master/so-simple.owl |
| Format          | OWL                                                                                        |
| CrossReferences |                                                                                            |

```bash
npm start -- --sequenceOntology so-simple.owl
```


---


### Uberon

|                 |                                                                      |
| --------------- | -------------------------------------------------------------------- |
| About           | http://uberon.github.io/about.html                                   |
| Usage           | http://obofoundry.github.io/principles/fp-001-open.html              |
| Example         | http://purl.obolibrary.org/obo/uberon/releases/2018-02-28/uberon.owl |
| Format          | OWL                                                                  |
| CrossReferences | [NCIT](#ncit)                                                        |

```bash
npm start -- --uberon uberon.owl
```


---

### VariO

|                 |                                                           |
| --------------- | --------------------------------------------------------- |
| About           | http://variationontology.org                              |
| Usage           | http://variationontology.org/citing.shtml                 |
| Example         | http://www.variationontology.org/vario_download/vario.owl |
| Format          | OWL                                                       |
| CrossReferences |                                                           |

```bash
npm start -- --vario vario.owl
```



## Knowledgebase Import Modules

Knowledgebase imports rely on the Ontology and vocabulary terms having already been loaded. They will use these to build statements as they import

### CIViC

Import the Clinical Evidence summaries from the public Civic database

|         |                                                   |
| ------- | ------------------------------------------------- |
| About   | https://civicdb.org/about                         |
| Usage   | https://creativecommons.org/publicdomain/zero/1.0 |
| Example |                                                   |
| Format  | REST (JSON)                                       |

```bash
npm start -- --civic
```


---

### COSMIC


|         |                                                                                |
| ------- | ------------------------------------------------------------------------------ |
| About   | https://cancer.sanger.ac.uk/cosmic/about                                       |
| Usage   | https://creativecommons.org/publicdomain/zero/1.0                              |
| Example | https://cancer.sanger.ac.uk/cosmic/download (CosmicResistanceMutations.tsv.gz) |
| Format  | Tab Delimited                                                                  |

Expects column names like
- Gene Name
- Transcript
- Census Gene
- Drug Name
- ID Mutation
- AA Mutation
- CDS Mutation
- Primary Tissue
- Tissue Subtype 1
- Tissue Subtype 2
- Histology
- Histology Subtype 1
- Histology Subtype 2
- Pubmed Id
- CGP Study
- Somatic Status
- Sample Type
- Zygosity
- Genome Coordinates (GRCh38)
- Tier


```bash
npm start -- --cosmic CosmicResistanceMutations.tsv
```


---

### DoCM

|         |                            |
| ------- | -------------------------- |
| About   | http://www.docm.info/about |
| Usage   | http://www.docm.info/terms |
| Example |                            |
| Format  | REST (JSON)                |

```bash
npm start -- --docm
```


---

### OncoKB

This module pulls directly from the OncoKB API to import statements from OncoKB into GraphKB

|         |                           |
| ------- | ------------------------- |
| About   | http://oncokb.org/#/about |
| Usage   | http://oncokb.org/#/terms |
| Example |                           |
| Format  | REST (JSON)               |


```bash
npm start -- --oncokb
```
