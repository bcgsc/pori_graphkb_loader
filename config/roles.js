/*
NONE:   #0000 - 0
CREATE: #0001 - 1
READ:   #0010 - 2
UPDATE: #0100 - 4
DELETE: #1000 - 8
ALL:    #1111 - 15
*/
const {PERMISSIONS} = require('./../app/repo/constants');
const ALL = PERMISSIONS.READ | PERMISSIONS.CREATE | PERMISSIONS.UPDATE | PERMISSIONS.DELETE;

const admin = {
    base: ALL,
    ontology: ALL,
    context: ALL,
    kbvertex: ALL,
    kbedge: ALL
    }

const analyst = {
    base: ALL,
    ontology: PERMISSIONS.CREATE | PERMISSIONS.READ,
    context: PERMISSIONS.CREATE | PERMISSIONS.READ,
    kbvertex: ALL,
    kbedge: ALL
    } 

const bioinfo = {
    base: PERMISSIONS.READ,
    ontology: PERMISSIONS.READ,
    context: PERMISSIONS.READ,
    kbvertex: PERMISSIONS.READ,
    kbedge: PERMISSIONS.READ
    }

module.exports = {admin, analyst, bioinfo};
