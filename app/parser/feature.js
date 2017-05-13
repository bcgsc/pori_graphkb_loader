const nRegex = require("named-js-regexp");
const {ParsingError} = require('./../repo/error');


const parseFeature = (string) => {
    // infer the type unless given?
    let match;
    if (match = /([A-Z]([A-Z0-9-]|orf)*)(\.(\d\d\d\d-\d\d-\d\d))?/.exec(string)) {
        // hugo gene w or w/o version (as datestamp)
        return {
            name: match[1],
            source_version: match[4],
            source: 'hgnc',
            biotype: 'gene'
        };
    } else if (match = /(ENS([TGP])\d+)(\.(\d+))?/.exec(string)) {
        // ensembl features
        const type = {G: 'gene', P: 'protein', T: 'transcript'};

        return {
            name: match[1],
            source_version: match[4],
            source: 'ensembl',
            biotype: type[match[2]]
        };
    } else if (match = /(N([MP])_\d+)(\.(\d+))?/.exec(string)) {
        // refseq features
        const type = {P: 'protein', M: 'transcript'};
        return {
            name: match[1],
            source_version: match[4],
            source: 'refseq',
            biotype: type[match[2]]
        };
    } else {
        throw new ParsingError(`string did not match expected pattern: ${string}`);
    }
};


module.exports = {parseFeature};
