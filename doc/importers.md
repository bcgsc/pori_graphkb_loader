# Importing External Content

GraphKB has a number of modules to map exernal database dumps and files to their equivalent format
in GraphKB. This allows simple import.

```bash
npm run import -- --help
```

A link to the terms of usage for each data source is included (where found) in the source record.

- [Ontologies](#ontologies)
  - [clinicaltrials.gov](#clinicaltrialsgov)
  - [Disease Ontology](#disease-ontology)

## Ontologies

### [clinicaltrials.gov](https://clinicaltrials.gov)

|                 |                                                                |
| --------------- | -------------------------------------------------------------- |
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
npm run import -- --clinicaltrialsgov download.xml
```


---

### [Disease Ontology](http://disease-ontology.org/about/)

|                 |                                                                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Usage           |                                                                                                                               |
| Example         | https://raw.githubusercontent.com/DiseaseOntology/HumanDiseaseOntology/v2018-07/05/src/ontology/releases/2018-07-05/doid.json |
| Format          | JSON                                                                                                                          |
| CrossReferences | [NCIT](#ncit)                                                                                                                 |

The disease ontology releases their data dumps as both XML and JSON from thei github page. We expect the JSON format

For example https://raw.githubusercontent.com/DiseaseOntology/HumanDiseaseOntology/v2018-07/05/src/ontology/releases/2018-07-05/doid.json

Once downloaded the JSON file can be loaded as follows

```bash
npm run import -- --diseaseOntology doid.json
``


---

### [DrugBank](https://www.drugbank.ca/about)

|                 |                                                                    |
| --------------- | ------------------------------------------------------------------ |
| Usage           | https://www.drugbank.ca/legal/terms_of_use                         |
| Example         | https://www.drugbank.ca/releases/5-1-1/downloads/all-full-database |
| Format          | XML                                                                |
| CrossReferences | [FDA](#fda)                                                        |

```bash
npm run import -- --drugbank data.xml
```


---

### [Ensembl](https://uswest.ensembl.org)

|                 |                                                             |
| --------------- | ----------------------------------------------------------- |
| Usage           | https://uswest.ensembl.org/info/about/legal/disclaimer.html |
| Example         |                                                             |
| Format          | Tab delimited                                               |
| CrossReferences | [RefSeq](#refseq), [HGNC](#hgnc)                            |

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
npm run import -- --ensembl ensembl_mart_export.tab
```


---

### [FDA](https://www.fda.gov/ForIndustry/DataStandards/SubstanceRegistrationSystem-UniqueIngredientIdentifierUNII/default.htm)

|                 |                                                           |
| --------------- | --------------------------------------------------------- |
| Usage           |                                                           |
| Example         | https://fdasis.nlm.nih.gov/srs/download/srs/UNII_Data.zip |
| Format          | Tab delimited                                             |
| CrossReferences | [NCIT](#ncit)                                             |

```bash
npm run import -- --fda UNII_Records_25Oct2018.txt
```


---

### [HGNC](https://www.genenames.org/about/overview)

|                 |                                                                                                 |
| --------------- | ----------------------------------------------------------------------------------------------- |
| Usage           | https://www.ebi.ac.uk/about/terms-of-use                                                        |
| Example         | ftp://ftp.ebi.ac.uk/pub/databases/genenames/new/json/locus_types/gene_with_protein_product.json |
| Format          | JSON                                                                                            |
| CrossReferences | [Ensembl](#ensembl)                                                                             |

```bash
npm run import -- --hgnc hgnc_complete_set.json
```


---

### [NCIT]( https://cbiit.cancer.gov/about/about-cbiit)

|                 |                                                                    |
| --------------- | ------------------------------------------------------------------ |
| Usage           | https://creativecommons.org/licenses/by/4.0                        |
| Example         | http://evs.nci.nih.gov/ftp1/NCI_Thesaurus/Thesaurus_18.06d.OWL.zip |
| Format          | OWL                                                                |
| CrossReferences | [FDA](#fda)                                                        |

```bash
npm run import -- --ncit Thesaurus_18.06d.OWL
```


---

### [Oncotree](http://oncotree.mskcc.org/#/home)

|                 |                               |
| --------------- | ----------------------------- |
| Usage           |                               |
| Example         | http://oncotree.mskcc.org/api |
| Format          | REST (JSON)                   |
| CrossReferences | [NCIT](#ncit)                 |

This importer pulls all versions of Oncotree directly from the Oncotree API and links them together

```bash
npm run import -- --oncotree
```


---

### [Refseq](https://www.ncbi.nlm.nih.gov/refseq)

|                 |                                                                   |
| --------------- | ----------------------------------------------------------------- |
| Usage           | https://www.ncbi.nlm.nih.gov/home/about/policies                  |
| Example         | ftp://ftp.ncbi.nih.gov/refseq/H_sapiens/RefSeqGene/LRG_RefSeqGene |
| Format          | Tab delimited                                                     |
| CrossReferences | [HGNC](#hgnc)                                                     |


```bash
npm run import -- --refseq LRG_RefSeqGene.tab
```


---

### [Sequence Ontology](http://www.sequenceontology.org)

|                 |                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------ |
| Usage           | http://www.sequenceontology.org/?page_id=269                                               |
| Example         | https://raw.githubusercontent.com/The-Sequence-Ontology/SO-Ontologies/master/so-simple.owl |
| Format          | OWL                                                                                        |
| CrossReferences |                                                                                            |

```bash
npm run import -- --sequenceOntology so-simple.owl
```


---

### [Uberon](http://uberon.github.io/about.html)

|                 |                                                                      |
| --------------- | -------------------------------------------------------------------- |
| Usage           | http://obofoundry.github.io/principles/fp-001-open.html              |
| Example         | http://purl.obolibrary.org/obo/uberon/releases/2018-02-28/uberon.owl |
| Format          | OWL                                                                  |
| CrossReferences | [NCIT](#ncit)                                                        |

```bash
npm run import -- --uberon uberon.owl
```


---

### [VariO](http://variationontology.org)

|                 |                                                           |
| --------------- | --------------------------------------------------------- |
| Usage           | http://variationontology.org/citing.shtml                 |
| Example         | http://www.variationontology.org/vario_download/vario.owl |
| Format          | OWL                                                       |
| CrossReferences |                                                           |

```bash
npm run import -- --vario vario.owl
```



## Knowledgebases

Knowledgebase imports rely on the Ontology and vocabulary terms having already been loaded. They will use these to build statements as they import

### [CIViC](https://civicdb.org/about)

Import the Clinical Evidence summaries from the public Civic database

|         |                                                   |
| ------- | ------------------------------------------------- |
| Usage   | https://creativecommons.org/publicdomain/zero/1.0 |
| Example |                                                   |
| Format  | REST (JSON)                                       |

```bash
npm run import -- --civic
```


---

### [COSMIC](https://cancer.sanger.ac.uk/cosmic/about)


|         |                                                                                |
| ------- | ------------------------------------------------------------------------------ |
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
npm run import -- --cosmic CosmicResistanceMutations.tsv
```


---

### [DoCM](http://www.docm.info/about)

|         |                            |
| ------- | -------------------------- |
| Usage   | http://www.docm.info/terms |
| Example |                            |
| Format  | REST (JSON)                |

```bash
npm run import -- --docm
```


---

### [OncoKB](http://oncokb.org/#/about)

This module pulls directly from the OncoKB API to import statements from OncoKB into GraphKB

|         |                           |
| ------- | ------------------------- |
| Usage   | http://oncokb.org/#/terms |
| Example |                           |
| Format  | REST (JSON)               |


```bash
npm run import -- --oncokb
```
