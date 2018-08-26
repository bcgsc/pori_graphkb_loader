# Knowledgebase Database and API

![Build Status](https://www.bcgsc.ca/bamboo/plugins/servlet/wittified/build-status/KNOW-KNOW)

The KB is implemented using [orientDB](https://github.com/orientechnologies/orientdb) and [orientjs](https://github.com/orientechnologies/orientjs).
It is a graph database which is used to store variants, ontologies, and the relevance of this terms and variants. The KB uses strict controlled vocbulary to provide a parseable and machine-readable interface for other applications to build on. The API is a REST API built on node/express.


### Table Of Contents

- [Getting Started](#getting-started)
- [Database Schema](#database-schema)
- [OpenAPI Specification](#openapi-specification)
- [Authentication](#authentication)
- [Guidelines for Contributors](#guidelines-for-contributors)
- [Running the Tests](#running-the-tests)
- [Logging](#logging)


## Getting Started

To start the API server you must first have the database server running. Then starting is as simple as running

```
npm install
npm start
```


## Database Schema

The schema for the database consist of four major types of data: ontology terms, variants, literature/evidence, and statements.

![schema](schema.svg)

## OpenAPI Specification

All KB API routes are documented with openapi specification. The specification is hosted with the api under `/api/<version>/spec`

## Authentication

Authentication in the KB uses tokens. KB API tokens can be generated using the token route defined in the API specification.
The first layer of authentication happens when KB uses [CATS](https://www.bcgsc.ca/wiki/display/lims/CATS+Documentation) to authenticate users against the LDAP. A request is sent
to CATS with the users credentials and a token is returned if the user exists and has access to KB.

The next step happens when KB looks up the username in the KB database. Each user in KB belongs to one or more UserGroups. Each of these UserGroups contains table-level permission schemas.

![KB Authentication Process](authentication.svg)

In summary, KB Client will send user credentials and recieve a token which will be used in the header of all subsequent requests.

## Guidelines for Contributors

1. In-code documentation should follow JSDocs format see http://usejsdoc.org
2. TDD. New tests should be added for any new functionality. Using mocha (https://mochajs.org/) for testing. As mocha has several
   test styles, please match the existing style in the current tests.
3. API must follow REST guidelines (for example see https://github.com/Microsoft/api-guidelines/blob/vNext/Guidelines.md)
4. JS code should be written with ES6 syntax (where possible) see https://github.com/lukehoban/es6features

## Running the Tests

The orientDB instance must already be running. To configure where the tests will point to the user can either modify `test/config/empty.js` or set the environment variables which override this config (default values are shown below, this will change depending on how you db server is configured).

```
DATABASE_SERVER_PASS=root
DATABASE_SERVER_USER=root
DATABASE_HOST='orientdb02.bcgsc.ca'
DATABASE_PORT=2480
KEY_FILE='id_rsa'  // used in generating the tokens
```

After these options are configured, the full set of tests can be run

```
npm run test
```

The non-database tests can be run without the above configuration

```
npm run unit
```


## Logging

By default the API will log at the warning level. This can be configured using the environment
variable `LOG_LEVEL` which must be one of: info, error, warn, info, verbose, or debug
([corresponding to the npm logging levels](https://www.npmjs.com/package/winston#logging-levels))

```
export LOG_LEVEL=error
```

Additionally logging can be recorded in a file. To do this the `LOG_DIR` environment variable must be set.
```
export LOG_DIR=/path/to/dir
```

This will be used as the directly to write logs to. If the variable is not set, no log files will be written and only console will be logged to.

