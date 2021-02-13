---
name: Release
about: Release PR format
title: ''
labels: pori, release
assignees: ''

---

Release Notes are given below in the PR description and should be reviewed as part of the PR
to ensure they are complete, accurate, and relevant tickets have been updated/closed/linked.

## Release Notes

### Breaking Changes

- closes #.

### New Features

- closes #.

### Bug Fixes

- closes #.

### Improvements

- closes #.

## QMS Checks

- [ ] Tests have been added to accompany the new feature where possible
- [ ] The user documentation been updated to reflect the changes? (openapi spec, user manuals, etc)
- [ ] The version number follows semantic versioning guidelines and is appropriate to the changes
- [ ] The release notes correct
- [ ] There are no features missing that should be included with the current set (dependent features)
- [ ] Dependent applications been informed and tested
- [ ] If the changes affect security, the changes are covered by automated tests or have been manually tested and the manual tests documented
- [ ] (For node applications) all major security vulnerabilities been addressed
