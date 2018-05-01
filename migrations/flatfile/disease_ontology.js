const doid = require('./../../doid');
const _ = require('lodash');
const request = require('request-promise');


const getDiseaseBy = async (where, token) => {
    newRecord = await request({
        method: 'GET',
        uri: 'http://localhost:8080/api/diseases',
        headers: {Authorization: token},
        json: true,
        qs: where
    });
    if (newRecord.length > 1) {
        throw new Error('expected a single record');
    } else if (newRecord.length == 0) {
        throw new Error('missing record');
    }
    newRecord = newRecord[0];
    return newRecord;
};

const addDisease = async (where, token, exists_ok=false) => {
    let opt = {
        method: 'POST',
        uri: 'http://localhost:8080/api/diseases',
        body: where,
        headers: {
            Authorization: token
        },
        json: true
    };
    try {
        const newRecord = await request(opt);
        process.stdout.write('.');
        return newRecord;
    } catch (err) {
        if (exists_ok && err.error && err.error.message && err.error.message.startsWith('Cannot index')) {
            process.stdout.write('*');
            return await getDiseaseBy(where, token);
        }
        throw err;
    }
};


const uploadDiseaseOntology = async (PERM_TOKEN) => {
    const parseDoid = (ident) => {
        return `DOID:${ident.match(/\/DOID_\d+$/)[0].split('_')[1]}`;
    }
    
    const parseDoVersion = (version) => {
        // ex. 'http://purl.obolibrary.org/obo/doid/releases/2018-03-02/doid.owl'
        m = /releases\/(\d\d\d\d-\d\d-\d\d)\//.exec(version);
        return m[1];
    }
    
    // build the disease ontology first
    const nodesByName = {};  // store by name
    const deprecatedNodes = {};
    const synonymsByName = {};
    
    const doVersion = parseDoVersion(doid.graphs[0].meta.version);
    console.log('\nAdding/getting the disease nodes')
    for (let node of doid.graphs[0].nodes) {
        if (node.id === undefined || node.lbl === undefined) {
            continue;
        }
        try {
            node.id = parseDoid(node.id);
        } catch (err) {
            continue;
        }
        node.lbl = node.lbl.toLowerCase();
        nodesByName[node.lbl] = {
            source: 'disease ontology',
            sourceId: node.id,
            name: node.lbl,
            sourceVersion: doVersion
        };
        synonymsByName[node.lbl] = [];
        if (node.meta === undefined) {
            continue;
        }
        deprecatedNodes[node.lbl] = node.meta.deprecated;
        if (node.meta && node.meta.synonyms) {
            for (let {val: alias} of node.meta.synonyms) {
                alias = alias.toLowerCase();
                if (alias !== node.lbl) {
                    synonymsByName[node.lbl].push(alias.toLowerCase());
                }
            }
        }
    }
    
    const diseaseRecords = {};
    for (let name of Object.keys(nodesByName)) {
        const node = nodesByName[name];
        let newRecord = await addDisease(node, PERM_TOKEN, true);

        if (diseaseRecords[newRecord.sourceId] !== undefined) {
            console.log(newRecord);
            console.log(diseaseRecords[newRecord.sourceId]);
            console.log(Object.keys(diseaseRecords));
            throw new Error('expected source id to be unique for this load', newRecord.sourceId);
        }
        diseaseRecords[newRecord.sourceId] = newRecord;
    }
    console.log('\nAdding the aliasof and deprecatedby links');

    for (let record of _.values(diseaseRecords)) {
        for (let synonym of synonymsByName[record.name]) {
            // get the synonym record
            try {
                synonym = await getDiseaseBy({name: synonym, deletedAt: "null"}, PERM_TOKEN);
            } catch (err) {
                synonym = await addDisease({
                    name: synonym, 
                    sourceId: record.sourceId, 
                    source: record.source,
                    sourceVersion: doVersion
                }, PERM_TOKEN); 
                process.stdout.write('.');
            }
            try {
                await request({
                    method: 'POST',
                    uri: 'http://localhost:8080/api/aliasof',
                    body: {out: synonym['@rid'], in: record['@rid']},
                    headers: {Authorization: PERM_TOKEN},
                    json: true
                });
                process.stdout.write('.');
            } catch (err) {
                if (! err.error || ! err.error.message || ! err.error.message.startsWith('Cannot index')) {
                    console.log({out: synonym['@rid'], in: record['@rid']});
                    console.log(err.error);
                } else {
                    process.stdout.write('*');
                }
            }
        }
    }

    /* now add the edges to the kb
    {
      "sub" : "http://purl.obolibrary.org/obo/DOID_5039",
      "pred" : "is_a",
      "obj" : "http://purl.obolibrary.org/obo/DOID_461"
    }
    */
    const relationshipTypes = {}
    console.log('\nAdding the subclass relationships');
    for (let edge of doid.graphs[0].edges) {
        const {sub, pred, obj} = edge;
        if (pred === "is_a") {  // currently only loading this class type
            let src, tgt;
            try {
                src = parseDoid(sub).toLowerCase();
                tgt = parseDoid(obj).toLowerCase();
            } catch (err) {
                continue;
            }
            if (! diseaseRecords[src] || ! diseaseRecords[tgt]) {
                console.log(`missing entries for ${src} ==is_a=> ${tgt}`);
            } else {
                try {
                    newRecord = await request({
                        method: 'POST',
                        uri: 'http://localhost:8080/api/subclassof',
                        body: {out: diseaseRecords[src]['@rid'], in: diseaseRecords[tgt]['@rid']},
                        headers: {Authorization: PERM_TOKEN},
                        json: true
                    });
                    process.stdout.write('.');
                } catch (err) {
                    if (! err.error || ! err.error.message || ! err.error.message.startsWith('Cannot index')) {
                        console.log({out: diseaseRecords[src]['@rid'], in: diseaseRecords[tgt]['@rid']});
                        console.log(err.error);
                    } else {
                        process.stdout.write('*');
                    }
                }
            }
        } else {
            relationshipTypes[pred] = null;
        }
    }
    console.log('relationshipTypes', Object.keys(relationshipTypes));
}

module.exports = {uploadDiseaseOntology};
