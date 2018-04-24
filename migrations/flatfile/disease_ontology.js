const doid = require('./../../doid');
const _ = require('lodash');
const request = require('request-promise');


const uploadDiseaseOntology = async () => {
    const parseDoid = (ident) => {
        return `DOID:${ident.match(/\/DOID_\d+$/)[0].split('_')[1]}`;
    }
    
    const parseDoVersion = (version) => {
        // ex. 'http://purl.obolibrary.org/obo/doid/releases/2018-03-02/doid.owl'
        m = /releases\/(\d\d\d\d-\d\d-\d\d)\//.exec(version);
        return m[1];
    }
    
    // build the disease ontology first
    const diseases = {};  // store by name
    const aliasOf = [];
    const deprecatedBy = [];
    
    const doVersion = parseDoVersion(doid.graphs[0].meta.version);
    
    for (let node of doid.graphs[0].nodes) {
        try {
            node.id = parseDoid(node.id);
            diseases[node.lbl] = {
                source: 'disease ontology',
                sourceId: node.id,
                name: node.lbl,
                sourceVersion: doVersion,
                deprecated: node.meta.deprecated,
                aliases: []
            };
        } catch (err) {
            continue;
        }
        if (node.meta && node.meta.synonyms) {
            for (let alias of node.meta.synonyms) {
                if (! _.includes(diseases[node.lbl].aliases, alias.val)) {
                    aliasOf.push({src: node.lbl, tgt: alias.val});
                    diseases[node.lbl].aliases.push(alias.val);
                }
            }
        }
    }
    
    for (let name of Object.keys(diseases)) {
        const node = diseases[name];
        
        // add the record to the kb
        let opt = {
            method: 'POST',
            uri: 'http://localhost:8080/api/diseases',
            body: {
                name: node.name,
                sourceVersion: node.sourceVersion,
                source: node.source
            },
            headers: {
                Authorization: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjp7Im5hbWUiOiJhZG1pbiIsIkByaWQiOiIjNDE6MCJ9LCJpYXQiOjE1MjQxODIwMTcsImV4cCI6MTUyNDE4NTYxN30.lJrmBnmpTwbFg675r6lRBUiBZmJh8zuS-NHItS5JHtk'
            },
            json: true
        };
        try {
            const newRecord = await request(opt);
        } catch (err) {
            if (! err.error.message.startsWith('Cannot index')) {
                console.log(err.error);
                console.log(opt);
                opt.method = 'GET'
                opt.qs = opt.body;
                delete opt.body
                const result = await(request(opt));
            }
        }
        
        if (node.deprecated) {
            let curr = [];
            for (let other of node.aliases) {
                if (! diseases[other]) {
                    continue;
                }
                if (! diseases[other].deprecated) {
                    curr.push(diseases[other]);
                }
            }
            if (curr.length == 0) {
                // ignore deprecated without a current node
                delete diseases[name];
                //console.log('error no current', node);
            } else if (curr.length > 1) {
                console.log('error, multiple current', node, curr);
            } else {
                deprecatedBy.push({src: node.name, tgt: curr[0].name});
            }
        }
        for (let alias of node.aliases) {
            if (! diseases[alias]) {
                continue;
            }
            opt = {
                method: 'POST',
                uri: 'http://localhost:8080/api/isAliasOf',
                body: {
                    name: node.name,
                    sourceVersion: node.sourceVersion,
                    source: node.source
                },
                headers: {
                    Authorization: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjp7Im5hbWUiOiJhZG1pbiIsIkByaWQiOiIjNDE6MCJ9LCJpYXQiOjE1MjQxODIwMTcsImV4cCI6MTUyNDE4NTYxN30.lJrmBnmpTwbFg675r6lRBUiBZmJh8zuS-NHItS5JHtk'
                },
                json: true
            };
        }
    }
    // now add these to the kb
    
}

module.exports = {uploadDiseaseOntology};
