/*
NONE:   #0000 - 0
CREATE: #0001 - 1
READ:   #0010 - 2
UPDATE: #0100 - 4
DELETE: #1000 - 8
ALL:    #1111 - 15
*/
const {PERMISSIONS} = require('./../app/repo/constants');


const admin = {
    base: PERMISSIONS.ALL,
    ontology: PERMISSIONS.ALL,
    context: PERMISSIONS.ALL,
    disease: PERMISSIONS.ALL,
    kbvertex: PERMISSIONS.ALL,
    kbedge: PERMISSIONS.ALL
    }

const analyst = {
    base: PERMISSIONS.ALL,
    ontology: PERMISSIONS.CREATE | PERMISSIONS.READ,
    context: PERMISSIONS.CREATE | PERMISSIONS.READ,
    kbvertex: PERMISSIONS.ALL,
    kbedge: PERMISSIONS.ALL
    } 

const bioinfo = {
    base: PERMISSIONS.READ,
    ontology: PERMISSIONS.READ,
    context: PERMISSIONS.READ,
    kbvertex: PERMISSIONS.READ,
    kbedge: PERMISSIONS.READ
    }

module.exports = {admin, analyst, bioinfo};
