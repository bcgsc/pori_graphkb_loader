# KB API User Manual

The KB is implemented using orientDB and orientjs. It is a graph database which is used to store variants, ontologies, and the relevance of this terms and variants. The KB uses strict controlled vocbulary to provide a parseable and machine-readable interface for other applications to build on. The API is a REST API built on node/express.

### Table Of Contents

- [Database Schema](#database-schema)
- [OpenAPI Specification](/api/docs/spec)
- [Authentication](#authentication)


## Database Schema

The schema for the database consist of four major types of data: ontology terms, variants, literature/evidence, and statements.

![schema](schema.svg)

## Authentication

Authentication in the KB uses tokens. KB API tokens can be generated using the [/token route](/api/docs/spec/#/Authentication).
The first layer of authentication happens when KB uses [CATS](https://www.bcgsc.ca/wiki/display/lims/CATS+Documentation) to authenticate users against the LDAP. A request is sent
to CATS with the users credentials and a token is returned if the user exists and has access to KB.

The next step happens when KB looks up the username in the KB database. Each user in KB belongs to one or more UserGroups. Each of these UserGroups contains table-level permission schemas.

![KB Authentication Process](authentication.svg)

In summary, KB Client will send user credentials and recieve a token which will be used in the header of all subsequent requests.