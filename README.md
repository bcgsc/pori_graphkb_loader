# GraphKB Loader

This package is used to import content from a variety of sources into GraphKB using the API.

- [Loaders](#loaders)
  - [Ontologies](#ontologies)
  - [Knowledge Bases](#knowledge-bases)
- [Guidelines for Developers](#guidelines-for-developers)
  - [Getting Started](#getting-started)
  - [Creating a new Loader](#creating-a-new-loader)
    - [API Loaders](#api-loaders)
    - [File Loaders](#file-loaders)

Automatic Import modules are provided for a variety of input sources. To Start importing external data, first the GraphKB API
must already be running. Then the command line interface can be used for upload. Get the help menu
detailing the commands and required inputs as follows on any of the scripts under `bin/`

```bash
node bin/<script>.js -- --help
```

## Loaders

### Ontologies

- [ChEMBL](./src/chembl/README.md)
- [Disease Ontology](./src/diseaseOntology/README.md)
- [DrugBank](./src/drugbank/README.md)
- [Ensembl](./src/ensembl/README.md)
- [Entrez Utilities](./src/entrez/README.md)
- [FDA SRS](./src/fdaSrs/README.md)
- [HGNC](./src/hgnc/README.md)
- [NCIt](./src/ncit/README.md)
- [OncoTree](./src/oncotree/README.md)
- [GraphKB Ontology JSON](./src/ontology/README.md)
- [RefSeq](./src/refseq/README.md)
- [Uberon](./src/uberon/README.md)

### Knowledge Bases

- [Cancer Genome Interpreter](./src/cancergenomeinterpreter/README.md)
- [Cancer Hotspots](./src/cancerhotspots/README.md)
- [CGL](./src/cgl/README.md)
- [CIViC](./src/civic/README.md)
- [ClinicalTrials.gov](./src/clinicaltrialsgov/README.md)
- [COSMIC](./src/cosmic/README.md)
- [DGIdb](./src/dgidb/README.md)
- [DoCM](./src/docm/README.md)
- [OncoKB](./src/oncokb/README.md)
- [tcgaFusions](./src/tcgaFusions/README.md)

## Guidelines for Developers

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

### Creating a new Loader

Loaders should be created with a directory directly under src name after the source of the content
being loaded. The directory should contain a README.md describing the loader and content and how
to obtain the data used by the loader.

There are 2 main patterns used by the loaders

#### API Loaders

These loaders do not require a file input and directly access an API (ex. [CIViC](./src/civic/README.md)).
Their main module will export a function called `upload` which has the following signature

```js
/**
 * @param {object} opt options
 * @param {ApiConnection} opt.conn the api connection object
 */
const upload = async ({conn}) => {
```

`conn` above will be an `ApiConnection` instance that has already been authenticated against the
GraphKB API instance.

#### File Loaders

Other loaders which use a file to load content follow a similar pattern except the function they
export is called `uploadFile` and accepts an additional argument. For example see the [disease ontology](./src/diseaseOntology/README.md) loader.


```js
/**
 * @param {object} opt options
 * @param {string} opt.filename the path to the input JSON file
 * @param {ApiConnection} opt.conn the api connection object
 */
const uploadFile = async ({ filename, conn }) => {
```
