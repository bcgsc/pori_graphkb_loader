# OncoKB


### API Token
An API Token must first be obtained from OncoKB. Save it as **ONCOKB_TOKEN** environment variable.

### Downloading files
Relevant OncoKB files can be downloaded using the provided script. A release version can be passed as 1st argument. Creates a subdirectory per version.

```Bash
chmod +x src/oncokb/fetch.sh

# latest data release
./src/oncokb/fetch.sh

# specific release (e.g. v7.2)
./src/oncokb/fetch.sh v7.2
```

### Running the loader

```Bash
# Usage
node bin/load.js file oncokb <dirpath>

# Complete example
node bin/load.js \
    -g $GRAPHKB_API_URL \
    -u $USER \
    -p $PASSWORD \
    file oncokb src/oncokb/v7.2
```
