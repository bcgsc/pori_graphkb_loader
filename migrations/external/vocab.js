const _ = require('lodash');

const {rid} = require('./util');
const {logger} = require('./logging');

const SOURCE_NAME = 'bcgsc';

const VOCABULARY = [
    {name: 'acquired resistance', subclassof: ['resistance'], oppositeof: ['innate resistance']},
    {name: 'amplification', subclassof: ['copy gain']},
    {
        name: 'any expression', subclassof: ['expression variant'], aliasof: ['expression'], oppositeof: ['no expression']
    },
    {
        name: 'any protein expression', subclassof: ['any expression'], aliasof: ['protein expression'], oppositeof: ['no protein expression']
    },
    {
        name: 'any rna expression', subclassof: ['any expression'], aliasof: ['rna expression'], oppositeof: ['no rna expression']
    },
    {name: 'associated with'},
    {name: 'benign', subclassof: ['biological']},
    {name: 'biological'},
    {name: 'copy gain', subclassof: ['copy variant'], aliasof: ['copy number gain']},
    {name: 'copy loss', subclassof: ['copy variant'], aliasof: ['copy number loss']},
    {name: 'copy variant', subclassof: ['structural variant'], aliasof: ['copy number variant']},
    {name: 'cytoplasmic protein expression', subclassof: ['any protein expression'], aliasof: ['cytoplasmic expression']},
    {
        name: 'decreased dosage', subclassof: ['dosage'], oppositeof: ['increased dosage'], description: 'requires decreased dosage'
    },
    {
        name: 'decreased metabolism', subclassof: ['metabolism'], oppositeof: ['increased metabolism'], description: 'decreased clearance of a drug'
    },
    {name: 'decreased toxicity', subclassof: ['toxicity']},
    {name: 'deletion', subclassof: ['indel', 'copy loss']},
    {name: 'diagnostic indicator', description: 'evidence is diagnostic for a specific disease type, disease subtype or disease state'},
    {name: 'disruptive fusion', description: 'fusion disrupts the wild-type functionality of one or more of its fusion partners'},
    {name: 'dominant gain of function', subclassof: ['gain of function'], description: 'an event whose product adversely affects the normal product resulting in a gain-of-function phenotype'},
    {name: 'dominant negative', subclassof: ['loss of function'], description: 'an event whose product adversely affects the normal product resulting in a loss-of-function phenotype'},
    {name: 'dosage', subclassof: ['therapeutic indicator']},
    {name: 'duplication', subclassof: ['structural variant']},
    {name: 'eligibility'},
    {name: 'epigenetic modification', subclassof: ['biological']},
    {name: 'epigenetic silencing', subclassof: ['epigenetic modification', 'no RNA expression']},
    {name: 'expression variant', subclassof: ['biological']},
    {name: 'extension', subclassof: ['mutation']},
    {name: 'favourable prognosis', subclassof: ['prognostic indicator'], description: 'event imparts a favourable outcome'},
    {name: 'favours diagnosis', subclassof: ['diagnostic indicator']},
    {name: 'focal amplification', subclassof: ['amplification']},
    {name: 'frameshift', subclassof: ['mutation'], aliasof: ['frameshift mutation']},
    {name: 'functional effect', oppositeof: ['no functional effect'], subclassof: ['biological']},
    {name: 'fusion', subclassof: ['structural variant']},
    {
        name: 'gain of function', subclassof: ['increased function'], oppositeof: ['loss of function'], description: 'event imparts an acquired function on the product leading to a specific observable phenotype'
    },
    {name: 'haploinsufficient', subclassof: ['tumour suppressive'], description: 'an event leading to loss of function in a product that is dosage dependant such that the incomplete loss of function leads to an observable phenotype when event is in a heterozygous state'},
    {name: 'high microsatellite instability', subclassof: ['microsatellite instability'], aliasof: ['MSI-high']},
    {name: 'hypermethylation', subclassof: ['methylation variant']},
    {name: 'hypomethylation', subclassof: ['methylation variant']},
    {name: 'in-frame deletion', subclassof: ['deletion']},
    {name: 'in-frame insertion', subclassof: ['insertion']},
    {name: 'increased dosage', subclassof: ['dosage'], description: 'requires increased dosage'},
    {name: 'increased expression', subclassof: ['any expression'], aliasof: ['overexpression', 'up-regulated expression']},
    {
        name: 'increased function', subclassof: ['functional effect'], aliasof: ['activating'], oppositeof: ['reduced function'], description: 'the efficacy or frequency of the existing functionality is increased'
    },
    {name: 'increased metabolism', subclassof: ['metabolism'], description: 'increased clearance of a drug'},
    {name: 'increased metastasis', subclassof: ['unfavourable prognosis']},
    {name: 'increased protein expression', subclassof: ['any protein expression', 'increased expression'], aliasof: ['protein overexpression', 'up-regulated protein expression']},
    {name: 'increased rna expression', subclassof: ['any rna expression', 'increased expression'], aliasof: ['rna overexpression', 'up-regulated rna expression']},
    {name: 'increased survival', subclassof: ['favourable prognosis']},
    {name: 'increased toxicity', subclassof: ['toxicity'], aliasof: ['adverse response']},
    {name: 'indel', subclassof: ['structural variant']},
    {name: 'innate resistance', subclassof: ['resistance']},
    {name: 'insertion', subclassof: ['indel']},
    {name: 'internal tandem duplication (ITD)', subclassof: ['tandem duplication']},
    {name: 'inversion', subclassof: ['structural variant']},
    {name: 'inverted translocation', subclassof: ['translocation']},
    {name: 'is characteristic of', subclassof: ['favours diagnosis'], description: 'a hallmark of this disease type'},
    {name: 'likely benign', subclassof: ['benign']},
    {name: 'likely gain of function', subclassof: ['gain of function'], description: 'gain-of-function is predicted or assumed (by the literature) based on an inference of similar events or data'},
    {name: 'likely loss of function', subclassof: ['loss of function'], description: 'loss-of-function is predicted or assumed (by the literature) based on an inference of similar events or data'},
    {name: 'likely no functional effect', subclassof: ['no functional effect'], aliasof: ['likely neutral']},
    {name: 'likely oncogenic', subclassof: ['oncogenic']},
    {name: 'likely pathogenic', subclassof: ['pathogenic']},
    {name: 'likely predisposing', subclassof: ['predisposing']},
    {name: 'likely resistance', subclassof: ['resistance']},
    {name: 'likely sensitivity', subclassof: ['sensitivity']},
    {name: 'likely switch of function', subclassof: ['switch of function']},
    {name: 'likely tumour suppressive', subclassof: ['tumour suppressive']},
    {
        name: 'loss of function', subclassof: ['reduced function'], aliasof: ['deletrious'], description: 'some normal functionality has been lost'
    },
    {name: 'low microsatellite instability', subclassof: ['microsatellite instability'], aliasof: ['MSI-low']},
    {name: 'metabolism', subclassof: ['therapeutic indicator']},
    {name: 'methylation', subclassof: ['methylation variant']},
    {name: 'methylation variant', subclassof: ['epigenetic modification']},
    {name: 'microsatellite instability', subclassof: ['microsatellite phenotype']},
    {name: 'microsatellite phenotype', subclassof: ['phenotype']},
    {name: 'microsatellite stable', subclassof: ['microsatellite phenotype'], aliasof: ['MSS']},
    {name: 'missense mutation', subclassof: ['substitution'], aliasof: ['missense']},
    {name: 'mutation hotspot', subclassof: ['recurrent'], description: 'the specific residue noted has been observed to be recurrently and commonly mutated at some signifiant frequency above random in numerrous independent observations'},
    {name: 'mutation', subclassof: ['biological'], description: 'generally small mutations or intra-chromosomal rearrangements'},
    {name: 'no expression', subclassof: ['expression variant']},
    {
        name: 'no functional effect', subclassof: ['biological'], aliasof: ['neutral'], description: 'does not result in altered functionality as compared to the wild-type'
    },
    {
        name: 'no gain of function', subclassof: ['no functional effect'], oppositeof: ['gain of function'], description: 'does not result in gain-of-function'
    },
    {
        name: 'no loss of function', subclassof: ['no functional effect'], oppositeof: ['loss of function'], description: 'does not result in loss-of-function'
    },
    {name: 'no protein expression', subclassof: ['protein expression variant', 'no expression']},
    {
        name: 'no resistance', subclassof: ['therapeutic efficacy'], oppositeof: ['resistance'], description: 'does not confer increased resistance as compared to wild-type state'
    },
    {name: 'no response', subclassof: ['no sensitivity'], oppositeof: ['response']},
    {name: 'no rna expression', subclassof: ['rna expression variant', 'no expression']},
    {
        name: 'no sensitivity', subclassof: ['therapeutic efficacy'], oppositeof: ['sensitivity'], description: 'does not confer increased sensitivity as compared to wild-type state'
    },
    {name: 'no switch of function', subclassof: ['no functional effect'], oppositeof: ['switch of function']},
    {name: 'nuclear protein expression', subclassof: ['any protein expression'], aliasof: ['nuclear expression']},
    {name: 'oncogenic fusion', subclassof: ['oncogenic', 'fusion'], description: 'fusion whose product promotes cancer'},
    {name: 'oncogenic mutation', subclassof: ['mutation', 'oncogenic']},
    {name: 'oncogenic', subclassof: ['tumourigenesis'], description: 'having the potential to cause a normal cell to become cancerous'},
    {name: 'opposes diagnosis', subclassof: ['diagnostic indicator']},
    {name: 'pathogenic', subclassof: ['predisposing']},
    {name: 'phenotype', subclassof: ['biological']},
    {name: 'phosphorylation', subclassof: ['post-translational modification']},
    {name: 'polymorphism', subclassof: ['mutation']},
    {name: 'post-translational modification', subclassof: ['biological']},
    {name: 'predisposing', subclassof: ['biological'], aliasof: ['risk factor']},
    {name: 'prognostic indicator'},
    {name: 'protective', subclassof: ['benign'], description: 'protect against some disease or phenotype. Associated with decreased risk of the disease or phenotype'},
    {name: 'protein expression variant', subclassof: ['expression variant']},
    {name: 'promoter hypermethylation', subclassof: ['promoter variant']},
    {name: 'promoter hypomethylation', subclassof: ['promoter variant']},
    {name: 'recurrent', subclassof: ['biological'], description: 'commonly observed'},
    {name: 'reduced expression', subclassof: ['any expression'], aliasof: ['underexpression', 'down-regulated expression']},
    {
        name: 'reduced function', subclassof: ['functional effect'], aliasof: ['inactivating'], description: 'the efficacy or frequency of the existing functionality is reduced'
    },
    {name: 'reduced protein expression', subclassof: ['any protein expression'], aliasof: ['down-regulated protein expression', 'protein underexpression']},
    {name: 'reduced rna expression', subclassof: ['any rna expression'], aliasof: ['down-regulated rna expression', 'rna underexpression']},
    {name: 'reduced sensitivity', subclassof: ['resistance']},
    {name: 'relapse', subclassof: ['unfavourable prognosis']},
    {name: 'resistance', subclassof: ['no response']},
    {name: 'response', subclassof: ['no resistance', 'targetable']},
    {name: 'rna expression variant', subclassof: ['expression variant']},
    {name: 'sensitivity', subclassof: ['response']},
    {name: 'single nucleotide polymorphism', subclassof: ['substitution', 'polymorphism']},
    {name: 'splice-site', subclassof: ['mutation']},
    {name: 'start gain', subclassof: ['extension']},
    {name: 'stop loss', subclassof: ['extension']},
    {name: 'substitution', subclassof: ['mutation']},
    {name: 'structural variant', subclassof: ['mutation'], aliasof: ['rearrangement']},
    {name: 'switch of function', subclassof: ['functional effect'], description: 'some wild-type/normal functionality is lost and some novel functionality is gained'},
    {name: 'tandem duplication', subclassof: ['duplication']},
    {name: 'targetable', subclassof: ['therapeutic efficacy'], description: 'therapy can be used given some event or combination of event'},
    {name: 'therapeutic efficacy', subclassof: ['therapeutic indicator']},
    {name: 'therapeutic indicator', aliasof: ['pharmacogenomic']},
    {name: 'toxicity', subclassof: ['therapeutic indicator']},
    {name: 'translocation', subclassof: ['structural variant']},
    {name: 'truncating', subclassof: ['mutation']},
    {name: 'tumour suppressive', subclassof: ['tumourigenesis'], description: 'suppresses or blocks the development of cancer'},
    {name: 'tumourigenesis', subclassof: ['biological']},
    {name: 'unfavourable prognosis', subclassof: ['prognostic indicator'], description: 'event is associated with a specifed, unfavouable outcome'},
    {name: 'weakly reduced function', subclassof: ['reduced function']},
    {name: 'weakly increased function', subclassof: ['increased function']},
    {name: 'wild type', subclassof: ['no functional effect'], aliasof: ['wildtype']}
];


/**
 * For any term which has an alias, they should also share subclassof relationships
 */
(() => {
    const termsByName = {};
    for (const term of VOCABULARY) {
        termsByName[term.name.toLowerCase()] = term;
    }
    for (const term of Object.values(termsByName)) {
        term.subclassof = term.subclassof || [];

        for (const aliasName of term.aliasof || []) {
            if (termsByName[aliasName.toLowerCase()] === undefined) {
                termsByName[aliasName.toLowerCase()] = {
                    name: aliasName,
                    aliasof: [],
                    subclassof: []
                };
                VOCABULARY.push(termsByName[aliasName.toLowerCase()]);
            }
            const alias = termsByName[aliasName.toLowerCase()];
            alias.subclassof = alias.subclassof || [];

            for (const superClass of alias.subclassof || []) {
                term.subclassof.push(superClass);
            }

            for (const superClass of term.subclassof || []) {
                alias.subclassof.push(superClass);
            }
        }
    }
})();

/**
 * Upload the JSON constant above into GraphKB
 *
 * @param {object} opt options
 * @param {ApiConnection} opt.conn the database connection object for GraphKB
 */
const upload = async (opt) => {
    const {conn} = opt;
    logger.info('Loading custom vocabulary terms');
    const termsByName = {};
    const source = await conn.addRecord({
        endpoint: 'sources',
        content: {name: SOURCE_NAME},
        existsOk: true
    });
    // add the records
    for (const term of VOCABULARY) {
        term.name = term.name.toLowerCase();
        const content = {
            name: term.name,
            sourceId: term.name,
            source: rid(source)
        };
        if (term.description) {
            content.description = term.description;
        }
        const record = await conn.addRecord({
            endpoint: 'vocabulary',
            content,

            existsOk: true,
            fetchConditions: _.omit(content, ['description'])
        });
        termsByName[record.name] = record;
    }
    // now add the edge links
    logger.info('\nRelating custom vocabulary');
    for (const term of VOCABULARY) {
        term.name = term.name.toLowerCase();
        for (const parent of term.subclassof || []) {
            await conn.addRecord({
                endpoint: 'subclassof',
                content: {
                    out: termsByName[term.name]['@rid'],
                    in: termsByName[parent.toLowerCase()]['@rid'],
                    source: rid(source)
                },
                existsOk: true,
                fetchExisting: false
            });
        }
        for (let parent of term.aliasof || []) {
            parent = await conn.addRecord({
                endpoint: 'vocabulary',
                content: {
                    name: parent,
                    sourceId: parent,
                    source: rid(source)
                },
                existsOk: true
            });
            await conn.addRecord({
                endpoint: 'aliasof',
                content: {
                    out: termsByName[term.name]['@rid'],
                    in: rid(parent),
                    source: rid(source)
                },
                existsOk: true,
                fetchExisting: false
            });
        }
        for (const parent of term.oppositeof || []) {
            await conn.addRecord({
                endpoint: 'oppositeof',
                content: {
                    out: termsByName[term.name]['@rid'],
                    in: termsByName[parent.toLowerCase()]['@rid'],
                    source: rid(source)
                },
                existsOk: true,
                fetchExisting: false
            });
        }
    }
    console.log();
    return termsByName;
};

module.exports = {VOCABULARY, upload, SOURCE_NAME};
