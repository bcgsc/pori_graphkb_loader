# FDA Approvals

Loads Evidence records which are a copy of the content from the FDA Oncology Approvals. These
are loaded so that they can be used as evidence for statements. The web pages are parsed and
the cleaned text is included in an Evidence record for reference

```bash
node bin/load.js api fdaApprovals
```
