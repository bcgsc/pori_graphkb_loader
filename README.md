# Knowledgebase Database and API

![Build Status](https://www.bcgsc.ca/bamboo/plugins/servlet/wittified/build-status/KNOW-KNOW)

The KB is implemented using [orientDB](https://github.com/orientechnologies/orientdb) and [orientjs](https://github.com/orientechnologies/orientjs).
It is a graph database which is used to store variants, ontologies, and the relevance of this terms and variants. The KB uses strict controlled vocabulary to provide a parseable and machine-readable interface for other applications to build on. The API is a REST API built on node/express.

### Table Of Contents

- [Getting Started](#getting-started)
- [About](#about)
    - [Database Schema](#database-schema)
    - [OpenAPI Specification](#openapi-specification)
    - [Authentication](#authentication)
- [Guidelines for Contributors](#guidelines-for-contributors)
- [Install (Developers)](#install-developers)
- [Deploy with PM2](#deploy-with-pm2)
- [Importing External Content](#importing-external-content)

## Getting Started

To start the API server you must first have the database server running. Then starting is as simple as running

```bash
npm install
npm start
```

## About

### Database Schema

The [schema](http://npm.bcgsc.ca:8080/#/detail/@bcgsc/knowledgebase-schema) is defined in a separate NPM package.
In general it consists of four major types of data: ontology terms, variants, evidence, and statements.

### OpenAPI Specification

All KB API routes are documented with openapi specification. The specification is hosted with the api under `/api/spec`

### Authentication

Authentication in the KB uses tokens. KB API tokens can be generated using the token route defined in the API specification.
The first layer of authentication happens when KB uses [CATS](https://www.bcgsc.ca/wiki/display/lims/CATS+Documentation) to authenticate users against the LDAP. A request is sent
to CATS with the users credentials and a token is returned if the user exists and has access to KB.

The next step happens when KB looks up the username in the KB database. Each user in KB belongs to one or more UserGroups. Each of these UserGroups contains table-level permission schemas.

![KB Authentication Process](authentication.svg)

In summary, KB Client will send user credentials and recieve a token which will be used in the header of all subsequent requests.

## Guidelines for Contributors

1. In-code documentation should follow [JSDocs](http://usejsdoc.org) format
2. TDD. New tests should be added for any new functionality. Using mocha (https://mochajs.org/) for testing. As mocha has several
   test styles, please match the existing style in the current tests.
3. API must follow REST guidelines (for example see https://github.com/Microsoft/api-guidelines/blob/vNext/Guidelines.md)
4. JS code should be written with ES6 syntax (where possible) see https://github.com/lukehoban/es6features

## Install (Developers)

Clone the repository

```bash
git clone https://svn.bcgsc.ca/bitbucket/scm/vdb/knowledgebase_api.git
cd knowledgebase_api
git checkout develop
```

Install the dependencies

```bash
npm install
```

To actually use the API, the orientDB instance must already be running. To configure where the tests will point to the user can either modify `config/config.js` or set the [environment variables](env.md) which override this config (default values are shown below, this will change depending on how you db server is configured).

```bash
DBS_PASS=root
DBS_USER=root
DB_HOST='orientdb02.bcgsc.ca'
DB_PORT=2480
KEY_FILE='id_rsa'  # used in generating the tokens
```

After these options are configured, the full set of tests can be run

```bash
npm run test
```

The non-database tests can be run without the above configuration

```bash
npm run unit
```

Import/Migration tests can be run with

```bash
npm run test-import
```

## Deploy with PM2

This example deploys a tag named v1.1.0

Ssh to the host server and clone the repository

```bash
ssh kbapi01
cd /var/www/kb/knowledgebase-api
git clone https://svn.bcgsc.ca/bitbucket/scm/vdb/knowledgebase_api.git v1.1.0
cd v1.1.0
git checkout v1.1.0
```

Install the dependencies

```bash
npm install
```

Create the keyfile

```bash
yes | ssh-keygen -t rsa -b 4096 -f id_rsa -N ''
```

Create the logging directories

```bash
mkdir logs pm2_logs
```

Create an env.sh file to hold the [configurable environment variables](env.md) as well as the PM2 ones

```bash
export PM2_HOME=/var/www/kb/knowledgebase-api/v1.1.0/pmd2_logs
export LOG_DIR=logs
export DB_CREATE=1
```

Set the Database password (It is better not to store this)

```bash
export DBS_PASS=<some password>
```

Now source the file and start your pm2 process

```bash
source env.sh
pm2 start npm --name kbapi-v1.1.0  -- start
```

You should now be able to view the running process with

```bash
pm2 ls
```

## Importing External Content

Automatic Import modules are provided for a variety of input sources. To Start importing external data, first the GraphKB API
must already be running. Then the command line interface can be used for upload. Get the help menu
detailing the commands and required inputs as follows

```bash
npm run import -- --help
```

If loaded in order, some modules will link to one another.
