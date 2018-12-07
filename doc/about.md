# GraphKB API

Knowlegebase is a curated database of variants in cancer and their therapeutic, biological, diagnostic, and prognostic implications according to literature.
The main use of Knowlegebase is to act as the link between the known and published variant information and the expermientally collected data.
It is used in generation of reports as well as building target sequences for the targeted alignment pipeline.

## Authentication

Authentication is managed via tokens. See the authenication related routes for more information.

```text
POST /api/token
```

## Routing Patterns

All classes in the knowledgebase follow a similar pattern where there are the following main types of requests

<table>
    <tr>
        <th>HTTP Operator</th>
        <th>URL Pattern</th>
        <th>Description</th>
    </tr>
    <tr>
        <td>GET</td>
        <td> <code>/api/CLASSNAME</code> </td>
        <td> Get multiple records. Can be filtered using query parameters </td>
    </tr>
    <tr>
        <td> GET </td>
        <td> <code>/api/CLASSNAME/{id}</code> </td>
        <td> Get a particular record by its database ID </td>
    </tr>
    <tr>
        <td> POST </td>
        <td> <code>/api/CLASSNAME/search</code> </td>
        <td> Search a class of records. Can create complex queries using the body </td>
    </tr>
    <tr>
        <td> POST </td>
        <td> <code>/api/CLASSNAME</code> </td>
        <td> Create a new record of this class type </td>
    </tr>
    <tr>
        <td> PATCH </td>
        <td> <code>/api/CLASSNAME/{id}</code> </td>
        <td> Update an existing record by ID </td>
    </tr>
    <tr>
        <td> DELETE </td>
        <td> <code>/api/CLASSNAME/{id}</code> </td>
        <td> Delete an existing record by ID </td>
    </tr>
</table>

<p style="page-break-after: always;">&nbsp;</p>