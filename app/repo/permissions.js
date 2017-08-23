const {Base, KBVertex, KBEdge, KBUser} = require('./base');
const {Context} = require('./context');
const {Feature, FeatureDeprecatedBy, FeatureAliasOf} = require('./feature');
const {Evidence, Publication, Journal, Study, ClinicalTrial, ExternalSource} = require('./evidence');
const {CategoryEvent, PositionalEvent, Event} = require('./event');
const {Ontology, Disease, Therapy, OntologySubClassOf, OntologyRelatedTo, OntologyAliasOf, OntologyDeprecatedBy} = require('./ontology');
const {Statement, AppliesTo, AsComparedTo, Requires} = require('./statement');
const {Vocab} = require('./vocab');
const {PERMISSIONS} = require('./constants');


const createPermissionsClass = (db) => {
    // extend versioning if not versioning
    return new Promise((resolve, reject) => {
        // preliminary error checking and defaults
        const properties = [
            {min: PERMISSIONS.NONE, max: PERMISSIONS.ALL, type: 'integer', mandatory: false, notNull: true, readOnly: false, name: KBVertex.clsname},
            {min: PERMISSIONS.NONE, max: PERMISSIONS.ALL, type: 'integer', mandatory: false, notNull: true, readOnly: false, name: KBEdge.clsname},
            {min: PERMISSIONS.NONE, max: PERMISSIONS.ALL, type: 'integer', mandatory: false, notNull: true, readOnly: false, name: KBUser.clsname},
            {min: PERMISSIONS.NONE, max: PERMISSIONS.ALL, type: 'integer', mandatory: false, notNull: true, readOnly: false, name: Context.clsname},
            {min: PERMISSIONS.NONE, max: PERMISSIONS.ALL, type: 'integer', mandatory: false, notNull: true, readOnly: false, name: Feature.clsname},
            {min: PERMISSIONS.NONE, max: PERMISSIONS.ALL, type: 'integer', mandatory: false, notNull: true, readOnly: false, name: FeatureAliasOf.clsname},
            {min: PERMISSIONS.NONE, max: PERMISSIONS.ALL, type: 'integer', mandatory: false, notNull: true, readOnly: false, name: FeatureDeprecatedBy.clsname},
            {min: PERMISSIONS.NONE, max: PERMISSIONS.ALL, type: 'integer', mandatory: false, notNull: true, readOnly: false, name: Evidence.clsname},
            {min: PERMISSIONS.NONE, max: PERMISSIONS.ALL, type: 'integer', mandatory: false, notNull: true, readOnly: false, name: Publication.clsname},
            {min: PERMISSIONS.NONE, max: PERMISSIONS.ALL, type: 'integer', mandatory: false, notNull: true, readOnly: false, name: Journal.clsname},
            {min: PERMISSIONS.NONE, max: PERMISSIONS.ALL, type: 'integer', mandatory: false, notNull: true, readOnly: false, name: Study.clsname},
            {min: PERMISSIONS.NONE, max: PERMISSIONS.ALL, type: 'integer', mandatory: false, notNull: true, readOnly: false, name: ClinicalTrial.clsname},
            {min: PERMISSIONS.NONE, max: PERMISSIONS.ALL, type: 'integer', mandatory: false, notNull: true, readOnly: false, name: ExternalSource.clsname},
            {min: PERMISSIONS.NONE, max: PERMISSIONS.ALL, type: 'integer', mandatory: false, notNull: true, readOnly: false, name: Event.clsname},
            {min: PERMISSIONS.NONE, max: PERMISSIONS.ALL, type: 'integer', mandatory: false, notNull: true, readOnly: false, name: PositionalEvent.clsname},
            {min: PERMISSIONS.NONE, max: PERMISSIONS.ALL, type: 'integer', mandatory: false, notNull: true, readOnly: false, name: CategoryEvent.clsname},
            {min: PERMISSIONS.NONE, max: PERMISSIONS.ALL, type: 'integer', mandatory: false, notNull: true, readOnly: false, name: Ontology.clsname},
            {min: PERMISSIONS.NONE, max: PERMISSIONS.ALL, type: 'integer', mandatory: false, notNull: true, readOnly: false, name: Disease.clsname},
            {min: PERMISSIONS.NONE, max: PERMISSIONS.ALL, type: 'integer', mandatory: false, notNull: true, readOnly: false, name: Therapy.clsname},
            {min: PERMISSIONS.NONE, max: PERMISSIONS.ALL, type: 'integer', mandatory: false, notNull: true, readOnly: false, name: OntologySubClassOf.clsname},
            {min: PERMISSIONS.NONE, max: PERMISSIONS.ALL, type: 'integer', mandatory: false, notNull: true, readOnly: false, name: OntologyRelatedTo.clsname},
            {min: PERMISSIONS.NONE, max: PERMISSIONS.ALL, type: 'integer', mandatory: false, notNull: true, readOnly: false, name: OntologyAliasOf.clsname},
            {min: PERMISSIONS.NONE, max: PERMISSIONS.ALL, type: 'integer', mandatory: false, notNull: true, readOnly: false, name: OntologyDeprecatedBy.clsname},
            {min: PERMISSIONS.NONE, max: PERMISSIONS.ALL, type: 'integer', mandatory: false, notNull: true, readOnly: false, name: Statement.clsname}, 
            {min: PERMISSIONS.NONE, max: PERMISSIONS.ALL, type: 'integer', mandatory: false, notNull: true, readOnly: false, name: AppliesTo.clsname},
            {min: PERMISSIONS.NONE, max: PERMISSIONS.ALL, type: 'integer', mandatory: false, notNull: true, readOnly: false, name: AsComparedTo.clsname},
            {min: PERMISSIONS.NONE, max: PERMISSIONS.ALL, type: 'integer', mandatory: false, notNull: true, readOnly: false, name: Requires.clsname},
            {min: PERMISSIONS.NONE, max: PERMISSIONS.ALL, type: 'integer', mandatory: false, notNull: true, readOnly: false, name: Vocab.clsname}
        ];
        db.conn.class.create('permissions', 'V', null, false) // create the class first
            .then((cls) => {
                // add the properties
                Promise.all(Array.from(properties, (prop) => cls.property.create(prop)))
                    .then(() => {
                        resolve(cls);
                    }).catch((error) => {
                        reject(error);
                    });
            }).catch((error) => {
                reject(error);
            });
    });
};

module.exports = {createPermissionsClass};
