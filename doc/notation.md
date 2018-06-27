# Variant Notation

- [Introduction](#introduction)
- [General Notation](#general-notation)
    - [Prefixes](#prefixes)
    - [Variant Types](#variant-types)
    - [Currently Unsupported HGVS Features](#currently-unsupported-hgvs-features)
- [Continuous Notation](#continuous-notation)
    - [Examples](#examples)
        - [Substitution](#substitution)
        - [Indel](#indel)
        - [Insertion](#insertion)
        - [Deletion](#deletion)
        - [Duplication](#duplication)
        - [Frameshift](#frameshifthttp---varnomenhgvsorg-recommendations-protein-variant-frameshift)
- [CytoBand Coordinates](#cytoband-coordinates)
    - [Deletion Example](#deletion-example)
- [Multi-Feature Notation](#multi-feature-notation)
    - [Exon Gene Fusion Example](#exon-gene-fusion-example)
    - [Genomic Translocation Example](#genomic-translocation-example)

## Introduction

The variant notation is a shorthand to make it faster to enter/display variants. It is made up of two forms: continuous, and multi-feature.
Most people will be more familiar with the continuous notation. It is based on [HGVS v15.11](http://varnomen.hgvs.org/) and can be used to describe any variant that has only a single
reference feature (i.e. KRAS). Multi-feature notation is required when one needs to describe any variant involving multiple reference features.
This could be something like a gene fusion where the reference features might be EWSR1, and FLI1.
While this is inspired by the [HGVS v15.11](http://varnomen.hgvs.org/) description of translocations, it has been expanded ad adapted to follow a more similar format to the continuous
notation and provide shorthand for other types of variants.

Note: The examples below do not represent actual mutations. No attempt has been made to check that the sequences given are correct

## General Notation

### Prefixes

Both forms of notation can be described as two breakpoints and an event type. Some may also include reference sequence and untemplated sequence descriptions. Additionally both forms will
use a common prefix notation

|Prefix|Coordinate Type|
|------|---------------|
|g|Genomic|
|c|Coding Sequence (CDS)|
|p|Protein|
|e|Exon|
|y|CytoBand/Cytogenic|

It should be noted that `e` and `y` prefixed notation is an extension on [HGVS v15.11](http://varnomen.hgvs.org/) and not standard

### Variant Types

The expected variant types are given below. Some types are only applicable to certain coordinate systems (i.e. frameshifts are protein only)

| Variant Type | Description | Notes |
|--------------|-------------|-------|
| > | substitutions | Protein notation does not use the >|
| del|deletions||
|delins| indels||
|dup|duplications||
|fs|frameshifts|Applicable to protein variants only|
|ext|extensions|Applicable to protein variants only|
|ins|insertions||
|inv|inversions||
|fusion|gene fusion|this is general notation to be used when the underlying variant type was not specified|
|trans|translocation||
|itrans|inverted translocation||


### Currently Unsupported HGVS Features

There are a few elements of the [HGVS v15.11](http://varnomen.hgvs.org/) notation that are not currently supported. These include:

- [mosacism](http://varnomen.hgvs.org/recommendations/DNA/variant/complex/)
- [chimerism](http://varnomen.hgvs.org/recommendations/DNA/variant/complex/)
- [RNA variants](http://varnomen.hgvs.org/recommendations/RNA/)
- [conversions](http://varnomen.hgvs.org/recommendations/DNA/variant/conversion/)
- [alleles](http://varnomen.hgvs.org/recommendations/DNA/variant/alleles/)


## Continuous Notation

All continuous notation follows a similar pattern that is loosely defined as:

```text
<reference feature>:<prefix>.<range><variant type><untemplated seq>
```

The `reference feature` would be the gene (chromosome, transcript, etc.)  name that the variant
occurs on. The prefix denotes the coordinate type (see [prefixes](#prefixes)). The range is the position or positions of the variant. For a deletion, this is the range that is deleted. For an insertion, this is the two positions the sequence is inserted between. The sequence element will depend on the type of variant being described, but often this is the untemplated/inserted sequence.

The sequence element is often optional. For all notation types there are general and more specific versions of notating the same event. Where possible more specificity is preferred. But it is recognized that notation coming from outside sources may not always provide all information. For each variant, the different equivalent notation options are shown below in order of increasing specificity.

### Examples

#### Substitution

[Genomic/CDS substitution variants](http://varnomen.hgvs.org/recommendations/DNA/variant/substitution/) differ from [protein substitution variants](http://varnomen.hgvs.org/recommendations/protein/variant/substitution/). Therefore examples of both will be given.

A protein missense mutation where G is replaced with D

```text
KRAS:p.G12D
```

A genomic substitution from A to C

```text
chr11:g.1234A>C
```

#### Indel

A [protein deletion](http://varnomen.hgvs.org/recommendations/protein/variant/deletion/) of amino acids GH and insertion of three amino acids TTA

```text
EGFR:p.G512_H513delins
EGFR:p.G512_H513delins3
EGFR:p.G512_H513delGHins
EGFR:p.G512_H513delGHins3
EGFR:p.G512_H513delinsTTA
EGFR:p.G512_H513delGHinsTTA
```

#### Insertion

Insertions must be a range to specify between which two coordinates the insertion occurs. This avoids the problem
when only a single coordinate is given of which side it is inserted on.

An [protein insertion](http://varnomen.hgvs.org/recommendations/protein/variant/insertion/) of four amino acids between G123 and H124. The sequence element here is optional and can also be described as a number if the number of bases inserted is known but the sequence is not given.


```text
EGFR:p.G123_H124ins
EGFR:p.G123_H124ins4
EGFR:p.G123_H124insCCST
```

#### Deletion

The reference sequence is optional when denoting a deletion. For example the same deletion could be notated both
ways as shown below.

```text
EGFR:p.R10_G14del
EGFR:p.R10_G14del5
EGFR:p.R10_G14delRSTGG
```

If the reference sequence is known, it is always better to provide more information than less.


#### Duplication

Four amino acids are duplicated. Once again, the sequence element is optional

```text
EGFR:p.R10_G14dup
EGFR:p.R10_G14dup5
EGFR:p.R10_G14dupRSTGG
```

#### [Frameshift](http://varnomen.hgvs.org/recommendations/protein/variant/frameshift/)

[Frameshifts](http://varnomen.hgvs.org/recommendations/protein/variant/frameshift/) are only applicable to variants denoted with protein coordinates. Frameshift notation follows the pattern below

```text
<reference feature>:p.<position><first alternate AA>fs*<position of next truncating AA>
```

The `first alternate AA`, and `position of next truncating AA` are both optional elements. For example the protein frameshift variant might be noted multiple ways

```text
PTEN:p.G123fs
PTEN:p.G123fs*10
PTEN:p.G123Afs
PTEN:p.G123Afs*10
```

## CytoBand Coordinates

CytoBand coordinates (`y`) are not a feature of HGVS, however variants using this system follow much the same patterns as the other types. Since this coordinate system is not very specific, the types of variants one can describe is more limited. Generally only duplications/gains, deletions/losses, inversions, and translocations can be described. Additionally sequence is never included. Any position in the CytoBand coordinate system is described by the pattern

```text
<arm><majorBand>.<minorBand>
```

The minor band number is optional.

### Deletion Example

A deletion spanniing p11.1 to p12.

```text
chr1:p11.1_p12del
```

## Multi-Feature Notation

Multi-Feature notation will use the same positions and coordinate systems as continuous notation. However parentheses are used to divide features and positions. All multi-feature variants should following the pattern below

```text
(<reference feature 1>,<reference feature 2>):<prefix><variant type>(<range 1>,<range2>)<untemplated seq>
```

Untemplated sequence should only be included for sequence specific coordinate types such as genomic, CDS, and protein. Where possible, continuous notation is preferred to multi-feature.

### Exon Gene Fusion Example

Using exon coordinates we could describe a gene fusion of exon 4 of EWSR1 to exon 7 of FLI1 as follows

```text
(EWSR1,FLI1):e.fusion(4,7)
```

A range can also be used here. When a range of positions is given it indicates uncertainty. Since
the range is already separated by a comma it is not necessary to enclose the uncertainty in parentheses (as you would for continuous notation).

For example, if we wanted to express a fusion of any exon from 4-6 of EWSR1 to any exon from 7-10 of FLI1

```text
(ESWR1,FLI1):e.fusion(4_6,7_10)
```

### Genomic Translocation Example

Multi-feature variants can also be described using the genomic coordinate system (`g`). For example a translocation might be described

```text
(chr8,chr7):g.trans(1234,4567)
(chr8,chr7):g.trans(1234,4567)AAT
```

Above we are describing a translocation from chr8:1234 to chr7:4567 where AAT is the untemplated sequence inserted between the breakpoints.



