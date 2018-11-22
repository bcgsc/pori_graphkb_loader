Knowlegebase is a curated database of variants in cancer and their therapeutic, biological, diagnostic, and prognostic implications according to literature.
The main use of Knowlegebase is to act as the link between the known and published variant information and the expermientally collected data.
It is used in generation of reports as well as building target sequences for the targeted alignment pipeline.

## Authentication

Authentication is managed via tokens. See the [authentication](.#/Authentication) related routes for more information.

## Dynamic Queries

### Comparison Operators

GET requests on the API support regular query paramters as well as using special query operator syntax. These allow the user to
specify operators beyond `=` such as `!` (not), `~` (substring), and `|` (OR).
Note that all the urls shown below have not been escaped.

#### Using the NOT Operator

Query all diseases where the name does not equal *'cancer'*

```text
/api/diseases?name=!cancer
```

#### Using the Contains Operator

When applied to a string value this will look for a substring, specifically prefixes or full words. This will not apply to suffixes.

Query all diseases where the name contains *'pancreatic'*

```text
/api/diseases?name=~pancreatic
```

It is worth noting that when the contains operator is applied to fields using a full text index (i.e. ontology names) that the
query will check for starting prefixes and may not find substrings which are in the middle of a word.

#### Combining the Contains and NOT Operators

Query all diseases where the name does not contain *'breast'*

```text
/api/diseases?name=!~breast
```

#### Using the OR operator

Query all diseases where the name is *'breast cancer'* or *'breast carcinoma'*

```text
/api/diseases?name=breast cancer|breast carcinoma
```

#### Combining the OR Operator with the NOT Operator

Query all diseases where the name is *'breast cancer'* or is not *'pancreatic cancer'*

```text
/api/diseases?name=breast cancer|!pancreatic cancer
```

### Using Subqueries

Since the KB is a graph database, queries can include conditions on related elements with minimal penalty (does not require a join).
As such KB will support querying on related objects using the following syntax

Query all diseases created by the user with the username *'blargh'*

```text
/api/diseases?createdBy[name]=blargh
```

### Query Using Special Query Parameters

#### Neighbors

The `neighbors` query parameter can be used to retrieve related records after a selection statement.
For example if you wish to expand all links on a given record, this can be done as below

```text
/api/diseases?neighbors=1
```

#### OR properties

The `or` query parameter can be used to set a top-level OR. For example, querying diseases by sourceId
OR by name could be done in a single query using this query parameter

```text
/api/diseases?sourceId=blargh&name=blargh&or=sourceId,name
```