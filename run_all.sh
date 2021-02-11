#!/bin/bash
set -e
CWD=$PWD
BASE_DIR=$PWD/tmp
mkdir -p $BASE_DIR/data
DATA_DIR=$BASE_DIR/data
# download data where possible

download_latest_ncit(){

    mkdir -p $DATA_DIR/NCIT
    cd $DATA_DIR/NCIT

    if ls Thesaurus_v*.txt 1> /dev/null 2>&1;
    then
        echo "EXISTS: Thesaurus_v*.txt"
    else
        wget https://evs.nci.nih.gov/ftp1/NCI_Thesaurus/archive/
        LATEST=$(cat index.html | grep '"[0-9][0-9]*\.[0-9][0-9][a-z]*_Release' -o | grep -o '[0-9][0-9]*\.[0-9][0-9][a-z]*' | tail -n 1)
        rm index.html
        echo "Latest Release: $LATEST"

        NAME=Thesaurus_$LATEST
        wget https://evs.nci.nih.gov/ftp1/NCI_Thesaurus/archive/${LATEST}_Release/Thesaurus_${LATEST}.FLAT.zip

        unzip ${NAME}.FLAT.zip
        rm ${NAME}.FLAT.zip
        mv Thesaurus.txt Thesaurus_v${LATEST}.txt
        rm -rf __MACOSX
    fi

    if ls FDA-UNII_NCIt_Subsets_*.txt 1> /dev/null 2>&1;
    then
        echo "EXISTS: $LATEST"
    else
        wget https://evs.nci.nih.gov/ftp1/FDA/UNII/Archive/
        LATEST=$(cat index.html | grep -P  'href="[^"]+txt"' -o | cut -f 2 -d\" | sort | tail -n 1)
        rm index.html
        echo "Latest Release: $LATEST"
        wget https://evs.nci.nih.gov/ftp1/FDA/UNII/Archive/$LATEST
    fi
}

download_ensembl_genes() {
    mkdir -p $DATA_DIR/ensembl
    cd $DATA_DIR/ensembl

    if [ ! -f biomart_export.tsv ]; then
        query_string='<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE Query><Query  virtualSchemaName = "default" formatter = "TSV" header = "1" uniqueRows = "0" count = "" datasetConfigVersion = "0.6" ><Dataset name = "hsapiens_gene_ensembl" interface = "default" ><Filter name = "transcript_biotype" value = "protein_coding"/><Attribute name = "ensembl_gene_id" /><Attribute name = "ensembl_gene_id_version" /><Attribute name = "ensembl_transcript_id" /><Attribute name = "ensembl_transcript_id_version" /><Attribute name = "hgnc_id" /><Attribute name = "refseq_mrna" /><Attribute name = "description" /><Attribute name = "external_gene_name" /><Attribute name = "external_gene_source" /></Dataset></Query>'
        wget -O biomart_export.tsv "http://www.ensembl.org/biomart/martservice?query=$query_string"
    else
        echo "EXISTS: biomart_export.tsv"
    fi
}

download_fda_srs() {
    mkdir -p $DATA_DIR/fda
    cd $DATA_DIR/fda

    if ls UNII*txt 1> /dev/null 2>&1;
    then
        echo "EXISTS: UNII*.txt"
    else
        wget https://fdasis.nlm.nih.gov/srs/download/srs/UNII_Data.zip
        unzip UNII_Data.zip
        rm UNII_Data.zip

        rm "READ ME UNII Lists.txt"

        for filename in UNII*txt
        do
            echo $filename
            mv "$filename" "${filename// /_}";
        done
    fi
}

download_refseq_genes() {
    mkdir -p $DATA_DIR/refseq
    cd $DATA_DIR/refseq
    if [ ! -f LRG_RefSeqGene.tab ]; then
        wget -O LRG_RefSeqGene.tab ftp://ftp.ncbi.nih.gov/refseq/H_sapiens/RefSeqGene/LRG_RefSeqGene
    else
        echo "EXISTS: LRG_RefSeqGene.tab"
    fi
}

download_uberon() {
    mkdir -p $DATA_DIR/uberon
    cd $DATA_DIR/uberon
    if ls uberon_v*.owl 1> /dev/null 2>&1;
    then
        echo "EXISTS: uberon_v*.owl"
    else
        # get the list of releases as index.html
        wget http://purl.obolibrary.org/obo/uberon/releases/

        # figure out which is the latest release
        RELEASE=$(grep li index.html | tail -n 1 | grep -P '\d+-\d\d-\d\d' -o | head -n 1)

        # clean up the index.html file
        rm index.html

        # Fetch the latest release
        wget http://purl.obolibrary.org/obo/uberon/releases/$RELEASE/uberon.owl
        mv uberon.owl uberon_v${RELEASE}.owl
    fi
}

download_disease_ontology() {
    mkdir -p $DATA_DIR/disease_ontology
    cd $DATA_DIR/disease_ontology

    if ls doid_*.json 1> /dev/null 2>&1;
    then
        echo "EXISTS: doid_*.json"
    else
        REPO=https://github.com/DiseaseOntology/HumanDiseaseOntology.git
        LATEST=$(git ls-remote $REPO --tags v\* | cut -f 2 | sed 's/refs\/tags\///' | grep '\bv[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]\b' | sort -d | tail -n 1)
        echo "latest version: $LATEST"

        wget https://github.com/DiseaseOntology/HumanDiseaseOntology/raw/$LATEST/src/ontology/doid.json

        mv doid.json doid_${LATEST}.json
    fi
}

download_drugbank() {
    mkdir -p $DATA_DIR/drugbank
    cd $DATA_DIR/drugbank

    if ls drugbank_all_full_database_v*.xml 1> /dev/null 2>&1;
    then
        echo "EXISTS: drugbank_all_full_database_v*.xml"
    else
        wget https://www.drugbank.ca/releases
        latest=$(grep 'href="/releases/[^"]*"' -o releases | cut -f 3 -d/ | sed 's/"//' | sort -V | tail -n 2 | head -n 1)
        echo "newest version: $latest"
        rm releases
        filename="drugbank_all_full_database_v$latest".xml
        echo $filename

        curl -Lfv -o ${filename}.zip -u $DRUGBANK_EMAIL:$DRUGBANK_PASSWORD https://go.drugbank.com/releases/5-1-8/downloads/all-full-database
        unzip ${filename}.zip
        mv full\ database.xml $filename
    fi
}

download_tcga_fusions() {
    mkdir -p $DATA_DIR/tcgaFusions
    cd $DATA_DIR/tcgaFusions

    if [ -f NIHMS632238-supplement-2.xlsx ]; then
        echo "EXISTS: NIHMS632238-supplement-2.xlsx"
    else
        wget https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4468049/bin/NIHMS632238-supplement-2.xlsx
    fi
}

download_cosmic() {
    mkdir -p $DATA_DIR/cosmic
    cd $DATA_DIR/cosmic

    if [ -f CosmicResistanceMutations.tsv ]; then
        echo "EXISTS: CosmicResistanceMutations.tsv"
    else
        AUTH=$( echo "$COSMIC_EMAIL:$COSMIC_PASSWORD" | base64 )
        resp=$( curl -H "Authorization: Basic $AUTH" https://cancer.sanger.ac.uk/cosmic/file_download/GRCh38/cosmic/v92/CosmicResistanceMutations.tsv.gz );
        echo $resp
        url=$( node  -e "var resp = $resp; console.log(resp.url);" );
        curl "$url" -o CosmicResistanceMutations.tsv.gz
        gunzip CosmicResistanceMutations.tsv.gz
    fi

    if [ -f classification.csv ]; then
        echo "EXISTS: classification.csv"
    else
        AUTH=$( echo "$COSMIC_EMAIL:$COSMIC_PASSWORD" | base64 )
        resp=$( curl -H "Authorization: Basic $AUTH" https://cancer.sanger.ac.uk/cosmic/file_download/GRCh38/cosmic/v92/classification.csv );
        echo $resp
        url=$( node  -e "var resp = $resp; console.log(resp.url);" );
        curl "$url" -o classification.csv
    fi

    if [ -f CosmicFusionExport.tsv ]; then
        echo "EXISTS: CosmicFusionExport.tsv"
    else
        AUTH=$( echo "$COSMIC_EMAIL:$COSMIC_PASSWORD" | base64 )
        resp=$( curl -H "Authorization: Basic $AUTH" https://cancer.sanger.ac.uk/cosmic/file_download/GRCh38/cosmic/v92/CosmicFusionExport.tsv.gz );
        echo $resp
        url=$( node  -e "var resp = $resp; console.log(resp.url);" );
        curl "$url" -o CosmicFusionExport.tsv.gz
        gunzip CosmicFusionExport.tsv.gz
    fi
}

download_cgi() {
    mkdir -p $DATA_DIR/cgi
    cd $DATA_DIR/cgi

    if [ -f cgi_biomarkers_per_variant.tsv ];
    then
        echo "EXISTS: cgi_biomarkers_per_variant.tsv"
    else
        wget https://www.cancergenomeinterpreter.org/data/cgi_biomarkers_latest.zip
        unzip cgi_biomarkers_latest.zip
    fi
}

download_latest_ncit;
download_fda_srs;
download_ensembl_genes;
download_refseq_genes;
download_disease_ontology;
download_uberon;
## download_drugbank;
download_tcga_fusions;
## download_cosmic;
download_cgi;

cd $CWD

export GKB_URL=https://pori-demo.bcgsc.ca/graphkb-api/api
export GKB_USER=graphkb_importer
export GKB_PASS=graphkb_importer

echo "load base vocabulary"
node bin/loadFile.js ontology data/vocab.json
echo "load signatures"
node bin/loadFile.js ontology data/signatures.json
echo "load non-specific human chromosome names"
node bin/loadFile.js ontology data/chromosomes.json
echo "load cross-kb evidence levels"
node bin/loadFile.js ontology data/evidenceLevels.json

echo "Loading NCIT terms"
node bin/loadFile.js ncit $DATA_DIR/NCIT/Thesaurus_v*.txt
echo "loading FDA SRS terms"
node bin/loadFile.js fdaSrs $DATA_DIR/fda/UNII_Records_*.txt
echo "loading the cross mapping from NCIT to FDA"
node bin/loadFile.js ncitFdaXref $DATA_DIR/NCIT/FDA-UNII_NCIt_*.txt
echo "loading refseq data"
node bin/loadFile.js refseq $DATA_DIR/refseq/LRG_RefSeqGene.tab
echo "loading disease ontology data"
node bin/loadFile.js diseaseOntology $DATA_DIR/disease_ontology/doid_v*json
echo "loading uberon data"
node bin/loadFile.js uberon $DATA_DIR/uberon/uberon_v*.owl
## echo "loading drugbank data"
## node bin/loadFile.js drugbank $DATA_DIR/drugbank/drugbank*.xml
echo "loading oncotree data"
node bin/load.js oncotree
## echo "loading dgidb data"
## node bin/load.js dgidb

echo "loading TCGA fusions from supplement"
node bin/loadFile.js tcgaFusions $DATA_DIR/tcgaFusions/NIHMS632238-supplement-2.xlsx
echo "loading CIViC"
node bin/load.js civic
## echo "loading COSMIC Resistance Mutations"
## node bin/cosmic.js resistance $DATA_DIR/cosmic/CosmicResistanceMutations.tsv $DATA_DIR/cosmic/classification.csv
## echo "loading COSMIC Fusions Data"
## node bin/cosmic.js fusions $DATA_DIR/cosmic/CosmicFusionExport.tsv $DATA_DIR/cosmic/classification.csv
echo "loading Cancer Genome Intepreter"
node bin/loadFile.js cgi $DATA_DIR/cgi/cgi_biomarkers_per_variant.tsv
echo "loading Database of Curated Mutations Data"
node bin/load.js docm
