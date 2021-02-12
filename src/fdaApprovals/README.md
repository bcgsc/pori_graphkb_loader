# FDA Oncology Approval Announcements

Loads Evidence records which are a copy of the content from the
[FDA Oncology Approval Announcements](https://www.fda.gov/drugs/resources-information-approved-drugs/hematologyoncology-cancer-approvals-safety-notifications)
Page. These are loaded so that they can be used as evidence for statements. The web pages are
parsed and the cleaned text is included in an Evidence record for reference

```bash
node bin/load.js api fdaApprovals
```
