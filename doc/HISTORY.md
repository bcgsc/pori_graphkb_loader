# Release History

## v0.0.4

### New Features

- Body of reposnses now wraps the content in an object and stores it as the attribute result. This is so that even queries which return lists are still valid jsons
- Authentication through the CATS server
- Dynamically generates the swagger spec
- Serves the swagger docs with the API
- Serves markdown user manual files as well
- source is now a separate class from ontology

### Bug Fixes
- KBDEV-72: Split contains values on separator characters so that they work with full text indices