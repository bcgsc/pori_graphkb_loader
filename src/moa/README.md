# MOAlmonac

Load variant assestions from the [Molecular Oncology Almonac](https://moalmanac.org)[^1].

```bash
node bin/load.js api moa
```

## Loading Assumptions

- A specific drug ontology is not used/given and therefore drugs are matched by name
- A specific gene ontology is not specified and therefore we default to using Entrez genes as they are popular amongst other knowlege bases
- When given, diseases are preferentially matched to their OncoTree term by both name and code. This falls back to matching by name when the oncotree term/code is not given

### Relevance Mapping

The mapping of relevance terms to their GraphKB equivalent is given below

| MOA field                             | MOA term | GraphKB relevance     |
| ------------------------------------- | -------- | --------------------- |
| `.therapy_resistance`                 | true     | resistance            |
| `.therapy_sensitivity`                | true     | sensitivity           |
| `.therapy_sensitivity`                | false    | no sensitivity        |
| `.favorable_prognosis`                | true     | favorable prognosis   |
| `.favorable_prognosis`                | false    | unfavorable prognosis |
| `.features[].attributes[].pathogenic` | "1.0"    | pathogenic            |

### Evidence Level Mapping

We have linked the `predictive_implication` from MOA to specific evidence levels in GraphKB

| MOA               | AMP               | CIViC | IPR |
| ----------------- | ----------------- | ----- | --- |
| Clinical evidence | Level B (Tier II) | B     | B   |
| Clinical trial    | Level B (Tier II) | B     | B   |
| FDA-Approved      | Level A (Tier I)  | A     | A   |
| Guideline         | Level A (Tier I)  | A     | A   |
| Inferential       |                   | E     | E   |

### Category Variant Mapping

Specific MOA variant types are mapped as category variants in GraphKB:

| MOA feature_type         | MOA field               | MOA field value | GraphKB reference1 class | GraphKB reference1         | GraphKB type      |
| ------------------------ | ----------------------- | --------------- | ------------------------ | -------------------------- | ----------------- |
| microsatellite_stability | status                  | MSI-High        | Signature                | microsatellite instability | high signature    |
| mutational_signature     | cosmic_signature_number | #               | Signature                | SBS#                       | signature present |
| knockdown                | n/a                     | `<gene name>`   | Feature                  | `<gene name>`              | knockdown         |

[^1]: Reardon, B. et al. Integrating molecular profiles into clinical frameworks through the Molecular Oncology Almanac to prospectively guide precision oncology. Nature Cancer 2, 1102–1112 (2021)
