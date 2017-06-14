/*
NONE:   #0000 - 0
CREATE: #0001 - 1
READ:   #0010 - 2
UPDATE: #0100 - 4
DELETE: #1000 - 8
ALL:    #1111 - 15
*/

const admin = {
    base: 15,
    ontology: 15,
    context: 15,
    kbvertex: 15,
    kbedge: 15
    }

const analyst = {
    base: 15,
    ontology: 3,
    context: 3,
    kbvertex: 15,
    kbedge: 15
    } 

const bioinfo = {
    base: 2,
    ontology: 2,
    context: 2,
    kbvertex: 2,
    kbedge: 2
    }

module.exports = {admin, analyst, bioinfo};