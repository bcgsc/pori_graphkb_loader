# Configurable Environment Variables

## Database settings

| Variable       | Default             | Description                                                                            |
| -------------- | ------------------- | -------------------------------------------------------------------------------------- |
| GKB_DBS_PASS   | root                | Database server password                                                               |
| GKB_DBS_USER   | root                | Database server username                                                               |
| GKB_DB_PORT    | 2426                | Port the DB server is using                                                            |
| GKB_DB_HOST    | orientdb02.bcgsc.ca | Host the DB server is using                                                            |
| GKB_DB_USER    | admin               | Database username                                                                      |
| GKB_DB_PASS    | admin               | Database password                                                                      |
| GKB_DB_NAME    | `kbapi_<VERSION>`   | Database name to use                                                                   |
| GKB_DB_CREATE  | false               | Set this to `1` to create the database if it does not exist                            |
| GKB_DB_MIGRATE | false               | Set this to `1` to attempt to migrate the database if it exists and requires migration |

## API Settings

| Variable          | Default | Description                                                 |
| ----------------- | ------- | ----------------------------------------------------------- |
| GKB_PORT          | 8080    | Port for the API to start on                                |
| GKB_KEY_FILE      | id_rsa  | Path to the private key to use for generating tokens        |
| GKB_LOG_DIR       |         | Write log files to this directory                           |
| GKB_LOG_LEVEL     | info    | The level of information to log to the screen and log files |
| GKB_LOG_MAX_FILES | 14      | The number of days to retain log files for                  |

## Key Cloak Settings

| Variable              | Default                                                                          | Description                                                                                                |
| --------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| GKB_KEYCLOAK_URI      | http://ga4ghdev01.bcgsc.ca:8080/auth/realms/TestKB/protocol/openid-connect/token | defaults to https://sso.bcgsc.ca/auth/realms/GSC/protocol/openid-connect/token for production environments |
| GKB_KEYCLOAK_CLIENTID | GraphKB                                                                          |                                                                                                            |
| GKB_KEYCLOAK_KEYFILE  | keycloak.id_rsa.pub                                                              | path to the public key file used to verify keycloak tokens                                                 |
| GKB_KEYCLOAK_ROLE     | GraphKB                                                                          | The required role to get from the keycloak user registration                                               |
| GKB_DISABLE_AUTH      |                                                                                  | Set to `1` to disable the external (keycloak) authentication (For testing)                                 |

## Logging

By default the API will log at the warning level. This can be configured using the environment
variable `GKB_LOG_LEVEL` which must be one of: info, error, warn, info, verbose, or debug
([corresponding to the npm logging levels](https://www.npmjs.com/package/winston#logging-levels))

```bash
export GKB_LOG_LEVEL=error
```

Additionally logging can be recorded in a file. To do this the `LOG_DIR` environment variable must be set.

```bash
export GKB_LOG_DIR=/path/to/dir
```

This will be used as the directly to write logs to. If the variable is not set, no log files will be written and only console will be logged to.
