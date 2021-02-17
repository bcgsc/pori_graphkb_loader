# GraphKB Loader

![build](https://github.com/bcgsc/pori_graphkb_loader/workflows/build/badge.svg?branch=master) ![Docker Image Version (latest semver)](https://img.shields.io/docker/v/bcgsc/pori-graphkb-loader?label=docker%20image)

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
detailing the commands and required inputs as follows

```bash
node bin/load.js -- --help
```

or using docker

```bash
docker run bcgsc/pori-graphkb-loader --help
```

## Loaders

### Ontologies

- [ChEMBL](./src/chembl)
- [Disease Ontology](./src/diseaseOntology)
- [DrugBank](./src/drugbank)
- [Ensembl](./src/ensembl)
- [Entrez Utilities](./src/entrez)
- [FDA SRS](./src/fdaSrs)
- [FDA Approval Announcements](./src/fdaApprovals)
- [HGNC](./src/hgnc)
- [NCIt](./src/ncit)
- [OncoTree](./src/oncotree)
- [GraphKB Ontology JSON](./src/ontology)
- [RefSeq](./src/refseq)
- [Uberon](./src/uberon)

### Knowledge Bases

- [Cancer Genome Interpreter](./src/cancergenomeinterpreter)
- [Cancer Hotspots](./src/cancerhotspots)
- [CGL](./src/cgl)
- [CIViC](./src/civic)
- [ClinicalTrials.gov](./src/clinicaltrialsgov)
- [COSMIC](./src/cosmic)
- [DGIdb](./src/dgidb)
- [DoCM](./src/docm)
- [OncoKB](./src/oncokb)
- [tcgaFusions](./src/tcgaFusions)

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

These loaders do not require a file input and directly access an API (ex. [CIViC](./src/civic)).
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
export is called `uploadFile` and accepts an additional argument. For example see the [disease ontology](./src/diseaseOntology) loader.

```js
/**
 * @param {object} opt options
 * @param {string} opt.filename the path to the input JSON file
 * @param {ApiConnection} opt.conn the api connection object
 */
const uploadFile = async ({ filename, conn }) => {
```
