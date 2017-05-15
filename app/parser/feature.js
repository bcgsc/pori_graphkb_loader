const nRegex = require("named-js-regexp");
const {ParsingError} = require('./../repo/error');
const {SOURCE, BIOTYPE} = require('./../repo/feature');


const parseFeature = (string) => {
    // infer the type unless given?
    let match;
    if (match = /^(ENS([TGPE])\d\d\d+)(\.(\d+))?$/.exec(string)) {
        // ensembl features: http://www.ensembl.org/info/genome/stable_ids/index.html
        const type = {G: BIOTYPE.GENE, P: BIOTYPE.PROTEIN, T: BIOTYPE.TRANSCRIPT, E: BIOTYPE.EXON};

        return {
            name: match[1],
            source_version: match[4] == undefined ? null : parseInt(match[4]),
            source: SOURCE.ENSEMBL,
            biotype: type[match[2]]
        };
    } else if (match = /^(N([MPG])_\d\d\d+)(\.(\d+))?$/.exec(string)) {
        // refseq features
        const type = {G: BIOTYPE.GENE, P: BIOTYPE.PROTEIN, M: BIOTYPE.TRANSCRIPT};
        return {
            name: match[1],
            source_version: match[4] == undefined ? null : parseInt(match[4]),
            source: SOURCE.REFSEQ,
            biotype: type[match[2]]
        };
    } else if (match = /^([A-Z]([A-Z0-9-]|orf)*)(\.(2\d\d\d(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])))?$/.exec(string)) {
        // hugo gene w or w/o version (as datestamp)
        return {
            name: match[1],
            source_version: match[4] == undefined ? null : parseInt(match[4]),
            source: SOURCE.HGNC,
            biotype: BIOTYPE.GENE
        };
    } else {
        throw new ParsingError(`string did not match expected pattern: ${string}`);
    }
};


module.exports = {parseFeature};
