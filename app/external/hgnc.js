"use strict";
const request = require('request-promise');
const {FEATURE_SOURCE, FEATURE_BIOTYPE} = require('./../repo/feature');


const convertDateToInt = (date) => {
    return date;
};


const checkForSymbolUpdate = (currentRecord) => {
    // if the input symbol returns a value with prev_symbol then we update (if the dates make sense)

    return new Promise((resolve, reject) => {
        request({uri: `http://rest.genenames.org/prev_symbol/${currentRecord.name}`, headers: {Accept: 'application/json'}})
            .then((resp) => {
                console.log(resp);
                if (resp.docs.length === 0) {
                    return request({uri: `http://rest.genenames.org/symbol/${currentRecord.name}`, headers: {Accept: 'application/json'}})
                } else if (resp.docs.length > 1) {
                    throw new Error(`symbol ${currentRecord.name} is not specific`);
                } else {
                    const rec = resp.docs[0]; 
                    resolve({
                        'source': FEATURE_SOURCE.HGNC,
                        'source_id': rec.hgnc_id,
                        'source_version': convertDateToInt(rec.date_symbol_changed ? rec.date_symbol_changed : rec.date_approved_reserved),
                        'name': rec.symbol,
                        'biotype': FEATURE_BIOTYPE.GENE
                    });
                }
            }).then((resp) => {
                console.log(resp);
                if (resp.docs.length !== 1) {
                    throw new Error(`symbol ${currentRecord.name} not found`);
                } else {
                    const rec = resp.docs[0]; 
                    resolve({
                        'source': FEATURE_SOURCE.HGNC,
                        'source_id': rec.hgnc_id,
                        'source_version': convertDateToInt(rec.date_symbol_changed ? rec.date_symbol_changed : rec.date_approved_reserved),
                        'name': rec.symbol,
                        'biotype': FEATURE_BIOTYPE.GENE
                    });
                }
            }).catch((err) => {
                reject(err);
            });
    });
    
}

const updateAllHugoFeatures = (db) => {

}; 

module.exports = {checkForSymbolUpdate};
