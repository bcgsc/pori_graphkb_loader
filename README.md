# GraphKB Importer

This package is used to import content from a variety of sources into GraphKB using the API.

Automatic Import modules are provided for a variety of input sources. To Start importing external data, first the GraphKB API
must already be running. Then the command line interface can be used for upload. Get the help menu
detailing the commands and required inputs as follows on any of the scripts under `bin/`

```bash
node bin/<script>.js -- --help
```


### Table Of Contents

- [Guidelines for Developers](#guidelines-for-developers)
  - [Style](#style)
  - [Getting Started](#getting-started)
- [Expected File Formats](#expected-file-formats)
  - [General Ontology file (JSON)](#general-ontology-file-json)
  - [clinicaltrials.gov (XML)](#clinicaltrialsgov-xml)
  - [Disease Ontology (JSON)](#disease-ontology-json)
  - [DrugBank (XML)](#drugbank-xml)
  - [Ensembl (TAB)](#ensembl-tab)
  - [FDA (TAB)](#fda-tab)
  - [GSC Therapeutic Ontology (TAB)](#gsc-therapeutic-ontology-tab)
  - [HGNC (JSON)](#hgnc-json)
  - [NCIT (TAB)](#ncit-tab)
  - [Refseq (TAB)](#refseq-tab)
  - [Sequence Ontology (OWL)](#sequence-ontology-owl)
  - [Uberon (OWL)](#uberon-owl)
  - [VariO (OWL)](#vario-owl)
  - [CGI (TAB)](#cgi-tab)
  - [COSMIC (TAB)](#cosmic-tab)
  - [IPRKb (TAB)](#iprkb-tab)


## Guidelines for Developers

### Style

1. In-code documentation should follow [JSDocs](http://usejsdoc.org) format
2. TDD. New tests should be added for any new functionality. Using jestfor testing
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

## Expected File Formats

### General Ontology file (JSON)

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
node bin/ontology.js --filename /path/to/json/file
```



### clinicaltrials.gov (XML)

Loads an XML file. The XML file is expected to be exported from the clinicaltrials.gov website. To retrieve
the expected file, follow the steps below

 * Perform a search on their site, for example https://clinicaltrials.gov/ct2/results?recrs=ab&cond=Cancer&term=&cntry=CA&state=&city=&dist=
 * Click their Download link/Button
 * Adjust the settings in the Pop up dialog (Include all studies, all columns, and export as XML)
 * Download and save the file
 * Upload the file to GraphKB using this module

```bash
node bin/clinicaltrialsgov.js --filename download.xml
```

Note: This may also load trials directly from the API (ot through the CLI)

### Disease Ontology (JSON)

Examples
- https://raw.githubusercontent.com/DiseaseOntology/HumanDiseaseOntology/v2018-07/05/src/ontology/releases/2018-07-05/doid.json
- /projects/vardb/downloads/disease_ontology/doid_v2019-05-13.json

The disease ontology releases their data dumps as both XML and JSON from thei github page. We expect the JSON format

Once downloaded the JSON file can be loaded as follows

```bash
node bin/diseaseOntology.js --filename doid.json
```

### DrugBank (XML)

Examples
- https://www.drugbank.ca/releases/5-1-1/downloads/all-full-database
- /projects/vardb/downloads/drugbank/drugbank_all_full_database_v5.1.4.xml

```bash
node bin/drugbank.js --filename drugbank_all_full_database_v5.1.4.xml
```

### Ensembl (TAB)

Example
- /projects/vardb/downloads/ensembl/ensembl_20181102_mart_export.tab

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


### FDA (TAB)

Example
- https://fdasis.nlm.nih.gov/srs/download/srs/UNII_Data.zip
- /projects/vardb/downloads/fda/UNII_Records_7Mar2019.txt


### GSC Therapeutic Ontology (TAB)

Example
- https://www.bcgsc.ca/jira/secure/attachment/168215/Drug_ontology_drugbank_IDs_draft_190507.txt
- /projects/vardb/downloads/gsc_therapeutic_ontology/gsc_therapeutic_ontology_2019-07-16.tab

```bash
node bin/gscTherapeuticOntology.js --filename gsc_therapeutic_ontology_2019-07-16.tab
```


### HGNC (JSON)

Example
- ftp://ftp.ebi.ac.uk/pub/databases/genenames/new/json/locus_types/gene_with_protein_product.json
- /projects/vardb/downloads/hgnc/hgnc_complete_set_d1541207688.json


### NCIT (TAB)

Example
- https://evs.nci.nih.gov/ftp1/NCI_Thesaurus/Thesaurus_19.05d.FLAT.zip
- /projects/vardb/downloads/ncit/Thesaurus_v19.05d.flat.txt


### Refseq (TAB)

Example
- ftp://ftp.ncbi.nih.gov/refseq/H_sapiens/RefSeqGene/LRG_RefSeqGene
- /projects/vardb/downloads/refseq/LRG_RefSeqGene_d1564008211.tab


### Sequence Ontology (OWL)

Example
- https://raw.githubusercontent.com/The-Sequence-Ontology/SO-Ontologies/master/so-simple.owl

|                 |                                              |
| --------------- | -------------------------------------------- |
| About           | http://www.sequenceontology.org              |
| Usage           | http://www.sequenceontology.org/?page_id=269 |
| Example         |                                              |
| Format          | OWL                                          |
| CrossReferences |                                              |


### Uberon (OWL)

Example
- http://purl.obolibrary.org/obo/uberon/releases/2018-02-28/uberon.owl
- /projects/vardb/downloads/uberon/uberon_v2018-10-14.owl

### VariO (OWL)

Example
- http://www.variationontology.org/vario_download/vario.owl
- /projects/vardb/downloads/variationontology/vario_v2018-04-27.owl


### CGI (TAB)

Example
- https://www.cancergenomeinterpreter.org/data/cgi_biomarkers_latest.zip (cgi_biomarkers_per_variant.tsv)
- /projects/vardb/downloads/cancergenomeinterpreter/v1558729096/cgi_biomarkers_per_variant.tsv

### COSMIC (TAB)

Example
- https://cancer.sanger.ac.uk/cosmic/download (CosmicResistanceMutations.tsv.gz)
- /projects/vardb/downloads/cosmic/CosmicResistanceMutations_d20180821.tsv

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


### IPRKb (TAB)

The flatfile dump of the IPR KB (Predecessor to GraphKB)

Example
- /projects/vardb/downloads/ipr/select_kb_references_ident_as_kb_reference_uuid_kb_references_cr_201905281636.tsv


```bash
node/iprkb.js --filename iprkb_export.tab
```
