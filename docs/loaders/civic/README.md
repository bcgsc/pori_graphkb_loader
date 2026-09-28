# CIViC

> :warning: Since this loader produces statements, ontology and vocabulary data should be loaded first

Loads statements into GraphKB using the [CIViC](https://civicdb.org/) GraphQL API.

```bash
node bin/load.js civic
```

## About

The `variant.js` module handles all parsing/processing of variant records in CIViC for entry into GraphKB. The corresponding tests are under `test/civic.variant.test.js`.

In general this loader attempts to update existing records based on their CIViC evidence ID, however when the mapping from CIViC evidence record to GraphKB statement is not 1 to 1 then the statement is sometimes recreated and the old version soft-deleted instead since we cannot resolve tracking between the 2 for these cases.

### Trusted Curators

By default this loader only loads accepted (reviewed and approved) evidence items from CIViC. However, sometimes items can take a while to be reviewed. To mitigate this problem we allow a list of "trusted curators" for which we can load statements in the submitted state. These will be loaded with a GraphKB status of "pending". The IDs that should be passed are the CIViC user IDs. For example

```bash
node bin/load.js civic --trustedCurators 123 124
```

## Mapping Objects from CIViC to GraphKB

In general CIViC (v2.2) and GraphKB have a lot in common so this mapping can be fairly straightforward. In CIViC Evidence Items are similar to GraphKB statements. However, there are a couple of key differences

- In CIViC a list of therapies (formely drugs) can be given as "substitutes", in GraphKB these are separate statements
- In CIViC, while evidence items are assigned a unique molecular profile, each profile can be associated with any number of variants using conditional expression with AND/OR/NOT operators. In GraphKB, statements are associated with any number of variants as implicit necessary conditions (AND operator). Alternative conditions (OR operator) are supported by creating separate statements like with therapy substitutes. Negative conditions (NOT operator) are yet to be supported
- GraphKB has a separate field for "appliesTo", this is the target of the statement
- Each Evidence Item in CIViC is associated with 1 PubMed article. In GraphKB a statement may have 1-n associated articles.

A mapping between CIViC and GraphKB for Evidence Item vs Statement fields is given below

| GraphKB Field | CIViC Field           |
| ------------- | --------------------- |
| conditions    | disease               |
| conditions    | variant               |
| conditions    | therapy               |
| relevance     | evidence type         |
| relevance     | evidence direction    |
| relevance     | significance          |
| evidence      | source                |

The current implementation of the relevance mapping from CIViC to GraphKB is summarized below

| CIViC Evidence Type | CIViC Evidence Direction | CIViC Significance          | GraphKB Relevance      |
| ------------------- | ------------------------ | --------------------------- | ---------------------- |
| Diagnostic          | Supports                 | Negative                    | opposes diagnosis      |
| Diagnostic          | Supports                 | Positive                    | favours diagnosis      |
| Functional          | Supports                 | Dominant Negative           | dominant negative      |
| Functional          | Does Not Support         | Dominant Negative           | no dominant negative   |
| Functional          | Supports                 | Gain of Function            | gain of function       |
| Functional          | Does Not Support         | Gain of Function            | no gain of function    |
| Functional          | Supports                 | Loss of Function            | loss of function       |
| Functional          | Supports                 | Neomorphic                  | neomorphic             |
| Functional          | Does Not Support         | Neomorphic                  | no neomorphic          |
| Functional          | Supports                 | Unaltered function          | Unaltered function     |
| Oncogenic           | Supports                 | Oncogenicity                | likely oncogenic       |
| Oncogenic           | Does Not Support         | Oncogenicity                | likely benign          |
| Predictive          | Supports                 | Adverse Response            | adverse response       |
| Predictive          | Supports                 | Reduced Sensitivity         | reduced Sensitivity    |
| Predictive          | Supports                 | Resistance                  | resistance             |
| Predictive          | Does Not Support         | Resistance                  | no resistance          |
| Predictive          | Supports                 | Sensitivity/Response        | sensitivity            |
| Predictive          | Does Not Support         | Sensitivity/Response        | no response            |
| Predisposing        | Supports                 | Predisposition              | likely predisposing    |
| Predisposing        | Supports                 | Protectiveness              | likely protective      |
| Prognostic          | Supports                 | Better Outcome              | favourable prognosis   |
| Prognostic          | Supports                 | Poor Outcome                | unfavourable prognosis |

Deprecated CIViC terms still supported for relevance mapping are summarized below

| CIViC Evidence Type | CIViC Evidence Direction | CIViC Significance          | GraphKB Relevance      |
| ------------------- | ------------------------ | --------------------------- | ---------------------- |
| Predisposing        | Supports                 | Likely Pathogenic           | likely pathogenic      |
| Predisposing        | Supports                 | Pathogenic                  | pathogenic             |
| Predisposing        | Supports                 | Positive                    | Predisposing           |
| Predisposing        | Supports                 | Uncertain Significance      | likely predisposing    |