const nRegex = require("named-js-regexp");
const {ParsingError} = require('./../repo/error');
const {FEATURE_SOURCE, FEATURE_BIOTYPE} = require('./../repo/feature');


const parseFeature = (string) => {
    // infer the type unless given?
    let match;
    if (match = /^(ENS([TGPE])\d\d\d+)(.+)?$/.exec(string)) {
        // ensembl features: http://www.ensembl.org/info/genome/stable_ids/index.html
        const type = {G: FEATURE_BIOTYPE.GENE, P: FEATURE_BIOTYPE.PROTEIN, T: FEATURE_BIOTYPE.TRANSCRIPT, E: FEATURE_BIOTYPE.EXON};
        let version = null;
        if (match[3] !== undefined) {
            if (match[3][0] != '.') {
                throw new ParsingError(`expected '.' delimiter for version but found '${match[3][0]}'`);
            }
            version = match[3].slice(1);
            if (/^\d+$/.exec(version) === null) {
                throw new ParsingError(`expected version number to be an integer. Found ${version}`);
            }
            version = parseInt(version);
        }
        return {
            name: match[1],
            source_version: version,
            source: FEATURE_SOURCE.ENSEMBL,
            biotype: type[match[2]]
        };
    } else if (match = /^(N([MPGC])_\d\d\d+)(.+)?$/.exec(string)) {
        // refseq features
        const type = {G: FEATURE_BIOTYPE.GENE, P: FEATURE_BIOTYPE.PROTEIN, M: FEATURE_BIOTYPE.TRANSCRIPT, C: FEATURE_BIOTYPE.TEMPLATE};
        let version = null;
        if (match[3] !== undefined) {
            if (match[3][0] != '.') {
                throw new ParsingError(`expected '.' delimiter for version but found '${match[3][0]}'`);
            }
            version = match[3].slice(1);
            if (/^\d+$/.exec(version) === null) {
                throw new ParsingError(`expected version number to be an integer. Found '${version}'`);
            }
            version = parseInt(version);
        } 
        return {
            name: match[1],
            source_version: version,
            source: FEATURE_SOURCE.REFSEQ,
            biotype: type[match[2]]
        };
    } else if (match = /^LRG_\d+(.+)?$/.exec(string)) {
        // refseq features
        let version = null;
        const result = {
            name: string,
            source_version: null,
            source: FEATURE_SOURCE.LRG
        };
        if (match[1] === undefined) {
            result.biotype = FEATURE_BIOTYPE.GENE;
        } else if (/^t\d+$/.exec(match[1]) !== null) {
            result.biotype = FEATURE_BIOTYPE.TRANSCRIPT;
        } else if (/^p\d+$/.exec(match[1]) !== null) {
            result.biotype = FEATURE_BIOTYPE.PROTEIN;
        } else {
            throw new ParsingError(`protein/transcript specification did not fit the expected pattern /[pt]\\d+/ found: '${match[2]}'`);
        }
        return result;
    } else if (match = /^((chr)?(1[0-9]|2[0-2]|[1-9]|[XY]|MT)(_[gG][lL]\d+_random)?)(.+)?$/.exec(string)) {
        let version = null;
        if (match[5] !== undefined) {
            if (match[5][0] != '.') {
                throw new ParsingError(`expected '.' delimiter for version but found '${match[5][0]}'`);
            }
            version = match[5].slice(1);
            if (/^\d+$/.exec(version) === null) {
                throw new ParsingError(`expected version number to be an integer. Found '${version}'`);
            }
            version = parseInt(version);
        } 
        return {
            name: match[1],
            source: FEATURE_SOURCE.GRC,
            biotype: FEATURE_BIOTYPE.TEMPLATE,
            source_version: version
        };
    } else if (string.startsWith('chr')) {
        throw new ParsingError(`could not resolve chromosome name for '${string}'`);
    } else if (match = /^[gG][lL]\d\d\d+(.+)?$/.exec(string)) {
        throw new ParsingError('ensembl alt chromosome notation is prohibited. Please use the full name GL### -> chr#_GL#_random');
    } else if (match = /^([A-Z]([A-Z0-9-]|orf)*)(.+)?$/.exec(string)) {
        // hugo gene w or w/o version (as datestamp)
        const datePattern = /^(2\d\d\d(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01]))$/;
        let version = null;
        if (match[3] !== undefined) {
            if (match[3][0] != '.') {
                throw new ParsingError(`expected '.' delimiter for version but found '${match[3][0]}'`);
            }
            version = match[3].slice(1);
            if (datePattern.exec(version) === null) {
                throw new ParsingError(`expected version number to be an integer in the form YYYYMMDD. Found '${version}'`);
            }
            version = parseInt(version);
        } 
        return {
            name: match[1],
            source_version: version,
            source: FEATURE_SOURCE.HGNC,
            biotype: FEATURE_BIOTYPE.GENE
        };
    } else {
        throw new ParsingError(`string did not match expected pattern: ${string}`);
    }
};


module.exports = {parseFeature};
