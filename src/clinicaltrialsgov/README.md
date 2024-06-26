# ClinicalTrials.gov

This module loads clinical trials data into GraphKB from [https://www.clinicaltrials.gov](https://www.clinicaltrials.gov/).

> :warning: Since this loader produces statements, ontology and vocabulary data should be loaded first


Uses REST API to load clinical trials data.
```bash
node bin/load.js clinicaltrialsgov
```

By default this loader loads all studies that related to cancer, which will be a huge number of records.
Using `--days` can load the new and existing studies added or modified (last update posted) in the last # of days.
```bash
node bin/load.js clinicaltrialsgov --days 7
```
Loading the studies added or modified in the last week.
