import os

CONTAINER = 'bcgsc/pori-graphkb-loader'
DATA_DIR = 'snakemake_data'
LOGS_DIR = 'snakemake_logs'

if not os.path.exists(DATA_DIR):
    os.mkdir(DATA_DIR)

if not os.path.exists(LOGS_DIR):
    os.mkdir(LOGS_DIR)

def build_docker_image(tag):
    docker_image_name = f"pori-graphkb-loader:{tag}"
    shell(f"docker build -t {docker_image_name} .")
    return docker_image_name

if config.get('build_docker'):
    containerchoice = build_docker_image('test')
else:
    containerchoice = CONTAINER


LOADER_COMMAND = 'node bin/load.js ' + ' '.join([f'--{k} {v}' for k, v in {
    'username': config.get('gkb_user') or os.environ.get('GKB_USER'),
    'password': config.get('gkb_pass') or os.environ.get('GKB_PASS'),
    'graphkb': config.get('gkb_url') or os.environ.get('GKB_URL')
}.items() if v])


DRUGBANK_EMAIL = config.get('drugbank_email')
DRUGBANK_PASSWORD = config.get('drugbank_password')
USE_DRUGBANK = DRUGBANK_EMAIL or DRUGBANK_PASSWORD
COSMIC_EMAIL = config.get('cosmic_email')
COSMIC_PASSWORD = config.get('cosmic_password')
USE_COSMIC = COSMIC_EMAIL or COSMIC_PASSWORD
BACKFILL_TRIALS = config.get('trials')
GITHUB_DATA = 'https://raw.githubusercontent.com/bcgsc/pori_graphkb_loader/develop/data'


rule all:
    input: f'{DATA_DIR}/civic.COMPLETE',
        f'{DATA_DIR}/cgi.COMPLETE',
        f'{DATA_DIR}/docm.COMPLETE',
        #f'{DATA_DIR}/dgidb.COMPLETE',
        f'{DATA_DIR}/PMC4468049.COMPLETE',
        f'{DATA_DIR}/PMC4232638.COMPLETE',
        f'{DATA_DIR}/uberon.COMPLETE',
        f'{DATA_DIR}/fdaApprovals.COMPLETE',
        #f'{DATA_DIR}/cancerhotspots.COMPLETE',
        f'{DATA_DIR}/moa.COMPLETE',
        f'{DATA_DIR}/ncitFdaXref.COMPLETE',
        *([f'{DATA_DIR}/clinicaltrialsgov.COMPLETE'] if BACKFILL_TRIALS else []),
        *([f'{DATA_DIR}/cosmic_resistance.COMPLETE', f'{DATA_DIR}/cosmic_fusions.COMPLETE'] if USE_COSMIC else [])


rule download_ncit:
    output: f'{DATA_DIR}/ncit/Thesaurus.txt',
    shell: f'''
        mkdir -p {DATA_DIR}/ncit
        curl https://evs.nci.nih.gov/ftp1/NCI_Thesaurus/Thesaurus.FLAT.zip | zcat > {DATA_DIR}/ncit/Thesaurus.txt
        rm -rf {DATA_DIR}/ncit/__MACOSX'''


rule download_ncit_fda:
    output: f'{DATA_DIR}/ncit/FDA-UNII_NCIt_Subsets.txt'
    shell: f'''
        cd {DATA_DIR}/ncit
        wget https://evs.nci.nih.gov/ftp1/FDA/UNII/FDA-UNII_NCIt_Subsets.txt'''


rule download_ensembl:
    output: f'{DATA_DIR}/ensembl/biomart_export.tsv'
    shell: f'''
        cd {DATA_DIR}/ensembl
        query_string='<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE Query><Query  virtualSchemaName = "default" formatter = "TSV" header = "1" uniqueRows = "0" count = "" datasetConfigVersion = "0.6" ><Dataset name = "hsapiens_gene_ensembl" interface = "default" ><Filter name = "transcript_biotype" value = "protein_coding"/><Attribute name = "ensembl_gene_id" /><Attribute name = "ensembl_gene_id_version" /><Attribute name = "ensembl_transcript_id" /><Attribute name = "ensembl_transcript_id_version" /><Attribute name = "ensembl_peptide_id" /><Attribute name = "ensembl_peptide_id_version" /><Attribute name = "hgnc_id" /><Attribute name = "refseq_mrna" /><Attribute name = "description" /><Attribute name = "external_gene_name" /><Attribute name = "external_gene_source" /></Dataset></Query>'
        wget -O biomart_export.tsv "http://www.ensembl.org/biomart/martservice?query=$query_string"
        '''


rule download_fda_srs:
    output: f'{DATA_DIR}/fda/UNII_Records.txt'
    shell: f'''
        curl -L --create-dirs -o {DATA_DIR}/fda/UNII_Data.zip https://precision.fda.gov/uniisearch/archive/latest/UNII_Data.zip
        unzip -o -d {DATA_DIR}/fda {DATA_DIR}/fda/UNII_Data.zip
        rm {DATA_DIR}/fda/UNII_Data.zip
        mv {DATA_DIR}/fda/UNII*.txt {DATA_DIR}/fda/UNII_Records.txt
        '''


rule download_refseq:
    output: f'{DATA_DIR}/refseq/LRG_RefSeqGene.tab'
    shell: f'''
        cd {DATA_DIR}/refseq
        wget -O LRG_RefSeqGene.tab ftp://ftp.ncbi.nih.gov/refseq/H_sapiens/RefSeqGene/LRG_RefSeqGene
        '''


rule download_uberon:
    output: f'{DATA_DIR}/uberon/uberon.owl'
    shell: f'''
        curl -L --create-dirs -o {DATA_DIR}/uberon/uberon.owl https://github.com/obophenotype/uberon/releases/latest/download/uberon.owl
        '''


rule download_do:
    output: f'{DATA_DIR}/do/doid.json'
    shell: f'''
        curl --create-dirs -o {DATA_DIR}/do/doid.json https://raw.githubusercontent.com/DiseaseOntology/HumanDiseaseOntology/refs/heads/main/src/ontology/doid.json
        '''



rule download_drugbank:
    output: f'{DATA_DIR}/drugbank/full_database.xml'
    shell: f'''
        cd {DATA_DIR}/drugbank
        wget https://www.drugbank.ca/releases
        latest=$(grep 'href="/releases/[^"]*"' -o releases | cut -f 3 -d/ | sed 's/"//' | sort -V | tail -n 2 | head -n 1)
        rm releases
        filename="drugbank_all_full_database_v$latest".xml

        curl -Lfv -o ${{filename}}.zip -u {DRUGBANK_EMAIL}:{DRUGBANK_PASSWORD} https://go.drugbank.com/releases/5-1-8/downloads/all-full-database
        unzip ${{filename}}.zip
        mv full\ database.xml full_database.xml'''

rule download_PMC4468049:
    output: f'{DATA_DIR}/PMC4468049/NIHMS632238-supplement-2.xlsx'
    shell: f''' curl --create-dirs -o {DATA_DIR}/PMC4468049/NIHMS632238-supplement-2.xlsx https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4468049/bin/NIHMS632238-supplement-2.xlsx'''


rule download_PMC4232638:
    output: f'{DATA_DIR}/PMC4232638/13059_2014_484_MOESM2_ESM.xlsx'
    shell: f''' curl --create-dirs -o {DATA_DIR}/PMC4232638/13059_2014_484_MOESM2_ESM.xlsx https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4232638/bin/13059_2014_484_MOESM2_ESM.xlsx'''

rule download_cgi:
    output: f'{DATA_DIR}/cgi/cgi_biomarkers_per_variant.tsv'
    shell: f'''
        curl --create-dirs -o {DATA_DIR}/cgi/cgi_biomarkers.zip https://www.cancergenomeinterpreter.org/data/biomarkers/cgi_biomarkers_20180117.zip
        unzip -d {DATA_DIR}/cgi {DATA_DIR}/cgi/cgi_biomarkers.zip
        '''


rule download_local_data:
    output: f'{DATA_DIR}/local/{{local}}.json'
    shell: f'''
        cd {DATA_DIR}/local
        wget {GITHUB_DATA}/{{wildcards.local}}.json
        '''


rule download_cancerhotspots:
    output: f'{DATA_DIR}/cancerhotspots/cancerhotspots.v2.maf'
    shell: f'''
        mkdir -p {DATA_DIR}/cancerhotspots
        cd {DATA_DIR}/cancerhotspots
        wget https://cbioportal-download.s3.amazonaws.com/cancerhotspots.v2.maf.gz
        gunzip cancerhotspots.v2.maf.gz
        '''



rule download_cosmic_resistance:
    output: f'{DATA_DIR}/cosmic/CosmicResistanceMutations.tsv'
    shell: f'''
        cd {DATA_DIR}/cosmic
        AUTH=$( echo "{COSMIC_EMAIL}:{COSMIC_PASSWORD}" | base64 )
        resp=$( curl -H "Authorization: Basic $AUTH" https://cancer.sanger.ac.uk/cosmic/file_download/GRCh38/cosmic/v92/CosmicResistanceMutations.tsv.gz );
        url=$( node  -e "var resp = $resp; console.log(resp.url);" );
        curl "$url" -o CosmicResistanceMutations.tsv.gz
        gunzip CosmicResistanceMutations.tsv.gz
        '''


rule download_cosmic_diseases:
    output: f'{DATA_DIR}/cosmic/classification.csv'
    shell: f'''
        cd {DATA_DIR}/cosmic
        AUTH=$( echo "{COSMIC_EMAIL}:{COSMIC_PASSWORD}" | base64 )
        resp=$( curl -H "Authorization: Basic $AUTH" https://cancer.sanger.ac.uk/cosmic/file_download/GRCh38/cosmic/v92/classification.csv );
        url=$( node  -e "var resp = $resp; console.log(resp.url);" );
        curl "$url" -o classification.csv
        '''


rule download_cosmic_fusions:
    output: f'{DATA_DIR}/cosmic/CosmicFusionExport.tsv'
    shell: f'''
        cd {DATA_DIR}/cosmic
        AUTH=$( echo "{COSMIC_EMAIL}:{COSMIC_PASSWORD}" | base64 )
        resp=$( curl -H "Authorization: Basic $AUTH" https://cancer.sanger.ac.uk/cosmic/file_download/GRCh38/cosmic/v92/CosmicFusionExport.tsv.gz );
        url=$( node  -e "var resp = $resp; console.log(resp.url);" );
        curl "$url" -o CosmicFusionExport.tsv.gz
        gunzip CosmicFusionExport.tsv.gz
        '''


rule load_local:
    input: f'{DATA_DIR}/local/{{local}}.json'
    containerized: containerchoice
    log: f'{LOGS_DIR}/local-{{local}}.logs.txt'
    output: f'{DATA_DIR}/local-{{local}}.COMPLETE'
    shell: LOADER_COMMAND + ' file ontology {input} &> {log}; cp {log} {output}'


rule load_ncit:
    input: expand(rules.load_local.output, local=['vocab']),
        data=rules.download_ncit.output
    containerized: containerchoice
    log: f'{LOGS_DIR}/ncit.logs.txt'
    output: f'{DATA_DIR}/ncit.COMPLETE'
    shell: LOADER_COMMAND + ' file ncit {input.data} &> {log}; cp {log} {output}'


rule load_fda_srs:
    input: expand(rules.load_local.output, local=['vocab']),
        f'{DATA_DIR}/ncit.COMPLETE',
        data=f'{DATA_DIR}/fda/UNII_Records.txt'
    containerized: containerchoice
    log: f'{LOGS_DIR}/fdaSrs.logs.txt'
    output: f'{DATA_DIR}/fdaSrs.COMPLETE'
    shell: LOADER_COMMAND + ' file fdaSrs {input.data} &> {log}; cp {log} {output}'


rule load_ncit_fda:
    input: rules.load_ncit.output,
        rules.load_fda_srs.output,
        data=rules.download_ncit_fda.output
    containerized: containerchoice
    log: f'{LOGS_DIR}/ncitFdaXref.logs.txt'
    output: f'{DATA_DIR}/ncitFdaXref.COMPLETE'
    shell: LOADER_COMMAND + ' file ncitFdaXref {input.data} &> {log}; cp {log} {output}'


rule load_refseq:
    input: expand(rules.load_local.output, local=['vocab']),
        data=rules.download_refseq.output
    containerized: containerchoice
    log: f'{LOGS_DIR}/refseq.logs.txt'
    output: f'{DATA_DIR}/refseq.COMPLETE'
    shell: LOADER_COMMAND + ' file refseq {input.data} &> {log}; cp {log} {output}'


rule load_ensembl:
    input: rules.load_refseq.output,
        data=rules.download_ensembl.output
    containerized: containerchoice
    log: f'{LOGS_DIR}/ensembl.logs.txt'
    output: f'{DATA_DIR}/ensembl.COMPLETE'
    shell: LOADER_COMMAND + ' file ensembl {input.data} &> {log}; cp {log} {output}'


rule load_do:
    input: rules.load_ncit.output,
        data=rules.download_do.output
    containerized: containerchoice
    log: f'{LOGS_DIR}/do.logs.txt'
    output: f'{DATA_DIR}/do.COMPLETE'
    shell: LOADER_COMMAND + ' file diseaseOntology {input.data} &> {log}; cp {log} {output}'


rule load_uberon:
    input: rules.load_ncit.output,
        data=rules.download_uberon.output
    containerized: containerchoice
    log: f'{LOGS_DIR}/uberon.logs.txt'
    output: f'{DATA_DIR}/uberon.COMPLETE'
    shell: LOADER_COMMAND + ' file uberon {input.data} &> {log}; cp {log} {output}'


rule load_drugbank:
    input: rules.load_fda_srs.output,
        data=rules.download_drugbank.output
    containerized: containerchoice
    log: f'{LOGS_DIR}/drugbank.logs.txt'
    output: f'{DATA_DIR}/drugbank.COMPLETE'
    shell: LOADER_COMMAND + ' file drugbank {input.data} &> {log}; cp {log} {output}'


rule load_oncotree:
    input: rules.load_ncit.output
    containerized: containerchoice
    log: f'{LOGS_DIR}/oncotree.logs.txt'
    output: f'{DATA_DIR}/oncotree.COMPLETE'
    shell: LOADER_COMMAND + ' api oncotree &> {log}; cp {log} {output}'


def get_drug_inputs(wildcards):
    inputs = [*rules.load_ncit.output]
    inputs.extend(rules.load_fda_srs.output)
    containerized: containerchoice
    if USE_DRUGBANK:
        inputs.append(*rules.load_drugbank.output)
    return inputs


rule all_drugs:
    input: lambda wildcards: get_drug_inputs(wildcards)
    containerized: containerchoice
    output: f'{DATA_DIR}/all_drugs.COMPLETE'
    shell: 'touch {output}'


rule all_diseases:
    input: rules.load_do.output,
        rules.load_ncit.output,
        rules.load_oncotree.output
    containerized: containerchoice
    output: f'{DATA_DIR}/all_diseases.COMPLETE'
    shell: 'touch {output}'


rule all_local:
    input: expand(rules.load_local.output, local=['vocab', 'signatures', 'chromosomes', 'evidenceLevels', 'aacr', 'asco']),
    containerized: containerchoice
    log: f'{LOGS_DIR}/all_local.logs.txt'
    output: f'{DATA_DIR}/all_local.COMPLETE'
    shell: 'touch {output}'


rule load_dgidb:
    input: rules.all_local.output
    containerized: containerchoice
    log: f'{LOGS_DIR}/dgidb.logs.txt'
    output: f'{DATA_DIR}/dgidb.COMPLETE'
    shell: LOADER_COMMAND + ' api dgidb &> {log}; cp {log} {output}'


rule load_cancerhotspots:
    input: expand(rules.load_local.output, local=['vocab', 'signatures', 'chromosomes']),
        rules.load_oncotree.output,
        rules.load_ensembl.output,
        data=rules.download_cancerhotspots.output
    containerized: containerchoice
    log: f'{LOGS_DIR}/cancerhotspots.logs.txt'
    output: f'{DATA_DIR}/cancerhotspots.COMPLETE'
    shell: LOADER_COMMAND + ' file cancerhotspots {input.data} &> {log}; cp {log} {output}'


rule load_PMC4232638:
    input: expand(rules.load_local.output, local=['vocab', 'signatures', 'chromosomes']),
        data=rules.download_PMC4232638.output
    containerized: containerchoice
    log: f'{LOGS_DIR}/PMC4232638.logs.txt'
    output: f'{DATA_DIR}/PMC4232638.COMPLETE'
    shell: LOADER_COMMAND + ' file PMC4232638 {input.data} &> {log}; cp {log} {output}'


rule load_PMC4468049:
    input: expand(rules.load_local.output, local=['vocab', 'signatures', 'chromosomes']),
        rules.all_diseases.output,
        data=rules.download_PMC4468049.output
    containerized: containerchoice
    log: f'{LOGS_DIR}/PMC4468049.logs.txt'
    output: f'{DATA_DIR}/PMC4468049.COMPLETE'
    shell: LOADER_COMMAND + ' file PMC4468049 {input.data} &> {log}; cp {log} {output}'


rule load_civic:
    input: expand(rules.load_local.output, local=['vocab', 'signatures', 'chromosomes', 'evidenceLevels', 'aacr', 'asco']),
        rules.load_ncit.output,
        rules.load_do.output
    containerized: containerchoice
    log: f'{LOGS_DIR}/civic.logs.txt'
    output: f'{DATA_DIR}/civic.COMPLETE'
    shell: LOADER_COMMAND + ' civic &> {log}; cp {log} {output}'


rule load_cgi:
    input: expand(rules.load_local.output, local=['vocab', 'signatures', 'chromosomes', 'evidenceLevels']),
        rules.all_diseases.output,
        rules.all_drugs.output,
        data=rules.download_cgi.output
    containerized: containerchoice
    log: f'{LOGS_DIR}/cgi.logs.txt'
    output: f'{DATA_DIR}/cgi.COMPLETE'
    shell: LOADER_COMMAND + ' file cgi {input.data} &> {log}; cp {log} {output}'


rule load_docm:
    input: expand(rules.load_local.output, local=['vocab', 'signatures', 'chromosomes']),
        rules.load_ncit.output,
        rules.load_do.output
    containerized: containerchoice
    log: f'{LOGS_DIR}/docm.logs.txt'
    output: f'{DATA_DIR}/docm.COMPLETE'
    shell: LOADER_COMMAND + ' api docm &> {log}; cp {log} {output}'


rule load_approvals:
    input:
    containerized: containerchoice
    log: f'{LOGS_DIR}/fdaApprovals.logs.txt'
    output: f'{DATA_DIR}/fdaApprovals.COMPLETE'
    shell: LOADER_COMMAND + ' api fdaApprovals &> {log}; cp {log} {output}'


rule load_clinicaltrialsgov:
    input: expand(rules.load_local.output, local=['vocab']),
        rules.all_diseases.output,
        rules.all_drugs.output
    containerized: containerchoice
    log: f'{LOGS_DIR}/clinicaltrialsgov.logs.txt'
    output: f'{DATA_DIR}/clinicaltrialsgov.COMPLETE'
    shell: LOADER_COMMAND + ' clinicaltrialsgov &> {log}; cp {log} {output}'


rule load_cosmic_resistance:
    input: expand(rules.load_local.output, local=['vocab', 'chromosomes']),
        rules.all_diseases.output,
        rules.all_drugs.output,
        main=rules.download_cosmic_resistance.output,
        supp=rules.download_cosmic_diseases.output
    containerized: containerchoice
    log: f'{LOGS_DIR}/cosmic_resistance.logs.txt'
    output: f'{DATA_DIR}/cosmic_resistance.COMPLETE'
    shell: LOADER_COMMAND + ' cosmic resistance {input.main} {input.supp} &> {log}; cp {log} {output}'


rule load_cosmic_fusions:
    input: rules.all_diseases.output,
        main=rules.download_cosmic_fusions.output,
        supp=rules.download_cosmic_diseases.output
    containerized: containerchoice
    log: f'{LOGS_DIR}/cosmic_fusions.logs.txt'
    output: f'{DATA_DIR}/cosmic_fusions.COMPLETE'
    shell: LOADER_COMMAND + ' cosmic fusions {input.main} {input.supp} &> {log}; cp {log} {output}'


rule load_moa:
    input: rules.load_oncotree.output,
        expand(rules.load_local.output, local=['vocab', 'signatures', 'chromosomes', 'evidenceLevels', 'aacr', 'asco'])
    containerized: containerchoice
    log: f'{LOGS_DIR}/load_moa.logs.txt'
    output: f'{DATA_DIR}/moa.COMPLETE'
    shell: LOADER_COMMAND + ' api moa  &> {log}; cp {log} {output}'


# input isn't actually needed but it is a file-type loader, so a dummy file must be supplied
rule download_sources:
    output: f'{DATA_DIR}/local/sources.json'
    shell: f'''
        cd {DATA_DIR}/local
        touch sources.json
        '''

rule load_sources:
    input: f'{DATA_DIR}/local/sources.json'
    containerized: containerchoice
    log: f'{LOGS_DIR}/sources.logs.txt'
    output: f'{DATA_DIR}/sources.COMPLETE'
    shell: LOADER_COMMAND + ' file sources {input} &> {log}; cp {log} {output}'


rule all_ontologies:
    input: expand(rules.load_local.output, local=['vocab', 'signatures', 'chromosomes', 'evidenceLevels', 'aacr', 'asco']),
        rules.load_oncotree.output,
        rules.load_ensembl.output,
        rules.all_drugs.output,
        rules.all_diseases.output,
        rules.load_uberon.output,
        rules.load_approvals.output,
        rules.load_ncit.output,
        rules.load_sources.output,
        rules.load_fda_srs.output,
        rules.load_ncit_fda.output,
        #rules.load_dgidb.output
    containerized: containerchoice
    output: f'{DATA_DIR}/all_ontologies.COMPLETE'
    shell: 'touch {output}'
