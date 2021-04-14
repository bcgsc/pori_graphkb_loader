# Variant Loader

This loads a list of variants into GraphKB based on an input string representation of the variant
which should use the standard syntax implemented by GraphKB (extended HGVS).

This is a convenience loader and is therefore a simplified version. All features are assumed to
be Entrez gene names and all variants are assumed to follow standard GraphKB syntax. All variants
must be positional variants. The input is a headerless plain text file where each line is a variant
representation.

For example

```text
KRAS:p.G12D
KRAS:p.G12C
KRAS:p.G12_G13insK
KRAS:p.G13delG
```

Would be the input to load the 4 KRAS variants above into GraphKB as positional variant records.

The above file would be loaded by the following command

```bash
node bin/load.js file variant input.txt
```
