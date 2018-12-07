# Configurable Environment Variables

## Database settings

|Variable | Default | Description |
|---|---|---|
| DBS_PASS | root | Database server password |
| DBS_USER | root | Database server username |
| DB_PORT | 2426 | Port the DB server is using |
| DB_HOST | orientdb02.bcgsc.ca | Host the DB server is using |
| DB_USER | admin | Database username |
| DB_PASS | admin | Database password |
| DB_NAME | `kbapi_<VERSION>` | Database name to use |
| DB_CREATE | false | Set this to `1` to create the database if it does not exist |

## API Settings

| Variable |Default | Description |
|----------|---------|------------|
| PORT | 8080 | Port for the API to start on |
| KEY_FILE | id_rsa | Path to the private key to use for generating tokens |
| DISABLE_AUTH | | Set to `1` to disable CATS/KeyCloak Authentication (For testing) |
| LOG_DIR | | Write log files to this directory |
| LOG_LEVEL | info | The level of information to log to the screen and log files |

## Logging

By default the API will log at the warning level. This can be configured using the environment
variable `LOG_LEVEL` which must be one of: info, error, warn, info, verbose, or debug
([corresponding to the npm logging levels](https://www.npmjs.com/package/winston#logging-levels))

```bash
export LOG_LEVEL=error
```

Additionally logging can be recorded in a file. To do this the `LOG_DIR` environment variable must be set.

```bash
export LOG_DIR=/path/to/dir
```

This will be used as the directly to write logs to. If the variable is not set, no log files will be written and only console will be logged to.