# CIViC

> :warning: Since this loader produces statements, ontology and vocabulary data should be loaded first

Loads statements into GraphKB using the [CIViC](https://civicdb.org/) REST API.

```bash
node bin/load.js civic
```

## About

The `variant.js` module handles all parsing/processing of variant records in CIViC for entry into GraphKB. The corresponding tests are under `test/civic.test.js`.

In general this loader attempts to update existing records based on their CIViC evidence ID, however when the mapping from CIViC evidence record to GraphKB statement is not 1 to 1 then the statement is sometimes recreated and the old version soft-deleted instead since we cannot resolve tracking between the 2 for these cases.

### Trusted Curators

By default this loader only loads accepted (reviewed and approved) evidence items from CIViC. However, sometimes items can take a while to be reviewed. To mitigate this problem we allow a list of "trusted curators" for which we can load statements in the submitted state. These will be loaded with a GraphKB status of "pending". The IDs that should be passed are the CIViC user IDs. For example

```bash
node bin/load.js civic --trustedCurators 123 124
```

## Mapping Objects from CIViC to GraphKB

In general CIViC (v1) and GraphKB have a lot in common so this mapping can be fairly straightforward. In CIViC Evidence Items are similar to GraphKB statements. However there are couple of key differences

- In CIViC a list of drugs can be given as "substitutes", in GraphKB these are separate statements
- In CIViC, generally, there is a 1 to 1 relationship with variants and evidence items, in GraphKB any number of variants can be associated with a statement
- GraphKB has a separate field for "appliesTo", this is the target of the statement
- Each Evidence Item in CIViC is associated with 1 PubMed article. In GraphKB a statement may have 1-n associated articles.

A mapping between CIViC and GraphKB for EvidenceItem vs Statement fields is given below

| GraphKB Field | CIViC Field           |
| ------------- | --------------------- |
| conditions    | disease               |
| conditions    | variant               |
| conditions    | drug                  |
| relevance     | evidence type         |
| relevance     | clinical significance |
| relevance     | evidence direction    |
| evidence      | source                |

The currently implementation of the relevance mapping from CIViC to GraphKB is summarized below

| CIViC Evidence Type | CIViC Evidence Direction | CIViC Clinical Significance | GraphKB Relevance      |
| ------------------- | ------------------------ | --------------------------- | ---------------------- |
| Diagnostic          | Supports                 | Negative                    | opposes diagnosis      |
| Diagnostic          | Supports                 | Positive                    | fevours diagnosis      |
| Functional          | Supports                 | Dominant Negative           | dominant negative      |
| Functional          | Supports                 | Gain of Function            | gain of function       |
| Functional          | Supports                 | Loss of Function            | loss of function       |
| Functional          | Supports                 | Neomorphic                  | neomorphic             |
| Predictive          | Does Not Support         | Sensitivity                 | no response            |
| Predictive          | Does Not Support         | Sensitivity/Response        | no response            |
| Predictive          | Supports                 | Adverse Response            | adverse response       |
| Predictive          | Supports                 | Resistance                  | resistance             |
| Predictive          | Supports                 | Sensitivity                 | sensitivity            |
| Predictive          | Supports                 | Sensitivity/Response        | sensitivity            |
| Predisposing        | Supports                 | Likely Pathogenic           | likely pathogenic      |
| Predisposing        | Supports                 | Pathogenic                  | pathogenic             |
| Predisposing        | Supports                 | Uncertain Significance      | likely predisposing    |
| Prognostic          | Supports                 | Better Outcome              | favourable prognosis   |
| Prognostic          | Supports                 | Negative                    | unfavourable prognosis |
| Prognostic          | Supports                 | Poor Outcome                | unfavourable prognosis |
| Prognostic          | Supports                 | Positive                    | favourable prognosis   |
