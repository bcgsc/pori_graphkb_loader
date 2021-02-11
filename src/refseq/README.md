# RefSeq

In general this data will be fetched as-needed by other loaders. However if you would like the
transcripts to be back-filled to support auto-complete by users entering variants through the
GraphKB client, it is sometimes useful to batch load these.

To complete a batch load you will first need to download the data

```bash
wget -O LRG_RefSeqGene.tab ftp://ftp.ncbi.nih.gov/refseq/H_sapiens/RefSeqGene/LRG_RefSeqGene
```

This can then be loaded with the general file loader

```bash
node bin/loadFile.js refseq LRG_RefSeqGene.tab
```
