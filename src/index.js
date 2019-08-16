/**
 * Migrates the data from the flatfiles to the graph database
 * @module importer
 * @ignore
 */

const {fileExists, createOptionsMenu} = require('./cli');

const {ApiConnection} = require('./util');
const {DEFAULT_QS} = require('./entrez/util');
const {logger, getFilename} = require('./logging');

const IMPORT_MODULES = {};
IMPORT_MODULES.cancerhotspots = require('./cancerhotspots');
IMPORT_MODULES.cgi = require('./cancergenomeinterpreter');
IMPORT_MODULES.civic = require('./civic');
IMPORT_MODULES.cosmic = require('./cosmic');
IMPORT_MODULES.cosf = require('./cosmic_fusions');
IMPORT_MODULES.ctg = require('./clinicaltrialsgov');
IMPORT_MODULES.dgidb = require('./dgidb');
IMPORT_MODULES.diseaseOntology = require('./disease_ontology');
IMPORT_MODULES.docm = require('./docm');
IMPORT_MODULES.drugbank = require('./drugbank');
IMPORT_MODULES.drugOntology = require('./drug_ontology');
IMPORT_MODULES.ensembl = require('./ensembl');
IMPORT_MODULES.fdaSrs = require('./fda_srs');
IMPORT_MODULES.hgnc = require('./hgnc');
IMPORT_MODULES.iprkb = require('./ipr');
IMPORT_MODULES.ncit = require('./ncit');
IMPORT_MODULES.oncokb = require('./oncokb');
IMPORT_MODULES.oncotree = require('./oncotree');
IMPORT_MODULES.ontology = require('./ontology');
IMPORT_MODULES.refseq = require('./refseq');
IMPORT_MODULES.sequenceOntology = require('./sequence_ontology');
IMPORT_MODULES.tcgaFusions = require('./tcga_fusions');
IMPORT_MODULES.uberon = require('./uberon');
IMPORT_MODULES.vario = require('./vario');


const optionDefinitions = [
    {
        name: 'help',
        alias: 'h',
        description: 'Print this help menu'
    },
    {
        name: 'hgnc',
        description: 'path to the file containting the HGNC hugo gene definitions. Expected format is JSON',
        type: fileExists
    },
    {
        name: 'diseaseOntology',
        type: fileExists,
        description: 'path to the disease ontology release file. Expected format is JSON'
    },
    {
        name: 'graphkb',
        default: `${process.env.GKB_URL || 'https://graphkb-api.bcgsc.ca/api'}`,
        description: 'URL for the KB API',
        env: 'GKB_URL'
    },
    {
        name: 'username',
        default: process.env.USER,
        required: true,
        description: 'ldap username required for access to the kb (USER|GKB_USER)',
        env: 'GKB_USER'
    },
    {
        name: 'password',
        required: true,
        env: 'GKB_PASS',
        description: 'the password for access to the kb api (GKB_PASS)'
    },
    {
        name: 'pubmed',
        env: 'PUBMED_API_KEY',
        description: 'The pubmed API key to use for pubmed requests'
    },
    {
        name: 'uberon',
        description: 'path to the uberon file to upload. Expected format is OWL',
        type: fileExists
    },
    {
        name: 'ncit',
        description: 'path to the NCIT file to upload. Expected format is tab delimited',
        type: fileExists
    },
    {
        name: 'oncotree',
        description: 'flag to indicate upload of oncotree latest stable release from their web API'
    },
    {
        name: 'drugbank',
        description: 'path to the drugbank file.. Expected format is XML',
        type: fileExists
    },
    {
        name: 'refseq',
        description: 'path to the tab delmited refseq file',
        type: fileExists
    },
    {
        name: 'oncokb',
        description: 'path to the actionable variants JSON from oncokb'
    },
    {
        name: 'cgi',
        description: 'load the biomarkers flatfile export from cancergenomeinterpreter.org',
        type: fileExists
    },
    {
        name: 'fdaSrs',
        description: 'path to the FDA UNII list with NCIT linking metadata',
        type: fileExists
    },
    {
        name: 'ensembl',
        description: 'path to the ensembl biomart export tab delimited file',
        type: fileExists
    },
    {
        name: 'civic',
        description: 'upload civic using their api'
    },
    {
        name: 'cosf',
        description: 'upload cosmic fusions export file'
    },
    {
        name: 'cosmic',
        description: 'load the resistance mutations from cosmic (ex. CosmicResitanceMutations.tsv)',
        type: fileExists
    },
    {
        name: 'ctg',
        description: 'load trials information from an XML export of a search result downloaded fomr clinicaltrials.gov',
        type: fileExists
    },
    {
        name: 'docm',
        description: 'load mutations from DOCM database api'
    },
    {
        name: 'vario',
        description: 'load the variation ontology file (OWL format)',
        type: fileExists
    },
    {
        name: 'sequenceOntology',
        description: 'path the sequence ontology owl file',
        type: fileExists
    },
    {
        name: 'iprkb',
        description: 'path to the IPR CSV export file',
        type: fileExists
    },
    {
        name: 'ontology',
        description: 'path to the custom ontology JSON file',
        type: fileExists
    },
    {
        name: 'dgidb',
        description: 'Load drug/gene interactions from DGIdb'
    },
    {
        name: 'drugOntology',
        description: 'path to the gsc drug ontology tab delimited file',
        type: fileExists
    },
    {
        name: 'errorLogPrefix',
        description: 'prefix to use for any module specific log files that are written',
        default: `${process.cwd()}/errorLog-${new Date().valueOf()}`
    },
    {
        name: 'tcgaFusions',
        description: 'Load fusions from the supplementary excel file',
        type: fileExists
    },
    {
        name: 'cancerhotspots',
        description: 'path to the cancer hotspots maf file',
        type: fileExists
    }
];
const options = createOptionsMenu(optionDefinitions,
    {
        title: 'GraphKB ETL Importer',
        description: 'Migrates data from dumps of (or using direct API connection to) other databases/resources into GraphKB'
    });


const apiConnection = new ApiConnection(options.graphkb);

if (options.pubmed) {
    DEFAULT_QS.api_key = options.pubmed;
}

const compareLoadModules = (name1, name2) => {
    const module1 = IMPORT_MODULES[name1];
    const module2 = IMPORT_MODULES[name2];

    // knowledgebases should always be loaded last
    if (module1.kb !== module2.kb) {
        if (module1.kb) {
            return 1;
        } if (module2.kb) {
            return -1;
        }
    }
    if (module1.dependencies && module1.dependencies.includes(IMPORT_MODULES[name2].SOURCE_DEFN.name)) {
        return 1;
    } if (module2.dependencies && module2.dependencies.includes(IMPORT_MODULES[name1].SOURCE_DEFN.name)) {
        return -1;
    }
    return 0;
};

/**
 * Decide which module goes first (maximize cross-reference links)
 */
const sortLoadModules = (modules) => {
    // initialize the graph
    const ranks = {};
    for (const modName of modules) {
        ranks[modName] = 0;
    }
    // use the compare function to assign relative ranks
    for (let i = 0; i < modules.length; i++) {
        for (let j = 0; j < modules.length; j++) {
            const name1 = modules[i];
            const name2 = modules[j];
            const cmp = compareLoadModules(name1, name2);
            if (cmp > 0) {
                ranks[name1] = Math.max(ranks[name1], ranks[name2]) + 1;
            } else if (cmp < 0) {
                ranks[name2] = Math.max(ranks[name1], ranks[name2]) + 1;
            }
        }
    }
    modules.sort((n1, n2) => ranks[n1] - ranks[n2]);
    for (const name of modules) {
        const deps = IMPORT_MODULES[name].dependencies && IMPORT_MODULES[name].dependencies.length > 0
            ? `(depends on: ${IMPORT_MODULES[name].dependencies.join(', ')})`
            : '';
        logger.info(`rank ${ranks[name]}: ${name} ${deps}`);
    }
    return modules;
};

const upload = async () => {
    await apiConnection.setAuth(options);
    logger.info('Login Succeeded');
    logger.info('priority loading order');
    const moduleOrder = sortLoadModules(Object.keys(options).filter(name => IMPORT_MODULES[name]));

    for (const moduleName of moduleOrder) {
        if (options[moduleName] !== undefined) {
            const currModule = IMPORT_MODULES[moduleName];
            if (currModule.uploadFile !== undefined) {
                await currModule.uploadFile({
                    conn: apiConnection,
                    filename: options[moduleName],
                    errorLogPrefix: options.errorLogPrefix
                });
            } else {
                await currModule.upload({
                    conn: apiConnection,
                    errorLogPrefix: options.errorLogPrefix
                });
            }
        }
    }
    if (getFilename()) {
        logger.info(`logs written to ${getFilename()}`);
    }
    logger.info('upload complete');
};

upload();
