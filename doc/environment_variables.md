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