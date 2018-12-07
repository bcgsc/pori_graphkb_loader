# Complex Queries

- [Examples](#examples)
    - [Query by related vertices](#query-by-related-vertices)
    - [Query by link in neighborhood](#query-by-link-in-neighborhood)
    - [Tree Queries: Query Ancestors or Descendants](#tree-queries--query-ancestors-or-descendants)

For simple queries, the GET routes and builtin query parameters should suffice. However, for more
complex queries the user may want to use the search endpoints instead. All exposed models will
have a search endpoint (POST) which follows the pattern

```text
/api/<CLASSNAME>/search
```

The body contains the query specification.

## Examples

### Query by related vertices

Find all statements which are implied by a variant on the gene KRAS

```json
POST /api/statements/search
{
    "where": [
        {
            "attr": "inE(implies).vertex.reference1.name",
            "value": "KRAS"
        }
    ]
}
```

This becomes the query

```SQL
SELECT * FROM Statement WHERE inE('Implies').outV().reference1.name = "KRAS"
```

The above example is fairly simple. Where the search endpoint showcases its utitlity is in the pre-boxed queries.

### Query by link in neighborhood

Here we are trying to find all statements that are implied by a variant on KRAS or any of the KRAS aliases, previous terms etc.
To do this we can use a neighborhood subquery as follows

```json
POST /api/statements/search
{
    "where": {
        "attr": "inE(implies).vertex",
        "value": {
            "type": "neighborhood",
            "where": [{"attr": "name", "value": "KRAS"}],
            "class": "Feature",
            "depth": 3
        }
    }
}
```

This becomes

```SQL
SELECT * FROM (MATCH
    {class: Disease, WHERE: (sourceId = 'cancer' AND deletedAt IS NULL)}
        .both('AliasOf', 'GeneralizationOf', 'DeprecatedBy', 'CrossReferenceOf', 'ElementOf'){WHILE: ($depth < 3)}
RETURN $pathElements)
```

Note that the class must be given for subqueries or it will be assumed to be the same as the starting
endpoint (in this case Statement).

### Tree Queries: Query Ancestors or Descendants

Ancestors and descendants are also builtin queries. In the following example we are trying
to find a disease named 'ER-positive breast cancer' and retrieve it and all of the superclasses of it.

To do this we will be following the `SubClassOf` edges. This is the default edge type for
tree queries but can also be given explicitly

```json
POST /api/diseases/search
{
    "where": {"attr": "name", "value": "ER-positive breast cancer"},
    "type": "ancestors"
}
```

<p style="page-break-after: always;">&nbsp;</p>
