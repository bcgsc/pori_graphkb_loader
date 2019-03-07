/**
 * Classes for enforcing constraints on DB classes and properties
 */
/**
 * @ignore
 */
const orientjs = require('orientjs');
const kbSchema = require('@bcgsc/knowledgebase-schema');


class Property extends kbSchema.Property {
    /**
     * Create the property in the database
     *
     * @param {Property} model the property model to be created
     * @param {orientjs.dbClass} dbClass the database class object from orientjs
     */
    static async create(model, dbClass) {
        const dbProperties = {
            name: model.name,
            type: model.type,
            notNull: !model.nullable,
            mandatory: model.mandatory
        };
        if (model.linkedClass) {
            dbProperties.linkedClass = model.linkedClass.name;
        }
        if (model.default !== undefined) {
            dbProperties.default = model.default;
        }
        if (model.min !== undefined) {
            dbProperties.min = model.min;
        }
        if (model.max !== undefined) {
            dbProperties.max = model.max;
        }
        return dbClass.property.create(dbProperties);
    }
}


class ClassModel extends kbSchema.ClassModel {
    /**
     * Create this class (and its properties) in the database
     *
     * @param {ClassModel} model the model to create
     * @param {orientjs.Db} db the database connection
     * @param {object} opt optional parameters
     * @param {bool} opt.properties flag which if false properties are not created
     * @param {bool} opt.indices flag which if false indices are not created
     */
    static async create(model, db, opt = {}) {
        const {
            properties = true,
            indices = true
        } = opt;
        const inherits = model._inherits
            ? Array.from(model._inherits, x => x.name).join(',')
            : null;
        let cls;
        try {
            cls = await db.class.get(model.name);
        } catch (err) {
            cls = await db.class.create(model.name, inherits, null, model.isAbstract); // create the class first
        }
        if (properties) {
            await Promise.all(Array.from(
                Object.values(model._properties).filter(prop => !prop.name.startsWith('@')),
                async prop => Property.create(prop, cls)
            ));
        }
        if (indices) {
            await Promise.all(Array.from(model.indices, i => db.index.create(i)));
        }
        return cls;
    }

    /**
     * Given some orientjs class object, compare the model to the schema definition expected
     * @param {ClassModel} model the class model to compare
     * @param {orientjs.dbClass} oclass the class from the database load
     *
     * @throws {Error} when the parsed class from the database does not match the expected schema definition
     */
    static compareToDbClass(model, oclass) {
        for (const dbProp of oclass.properties) {
            if (dbProp.name.startsWith('@') && !['@version', '@class', '@rid'].includes(prop.name)) {
                continue;
            }
            // get the property definition from the schema
            const prop = model.properties[dbProp.name];
            if (prop === undefined) {
                throw new Error(`[${
                    model.name
                }] failed to find the property ${
                    dbProp.name
                } on the schema definition`);
            }
            const dbPropType = orientjs.types[dbProp.type].toLowerCase();
            if (dbPropType !== prop.type) {
                throw new Error(
                    `[${model.name}] The type defined on the schema model (${
                        prop.type
                    }) does not match the type loaded from the database (${
                        dbPropType
                    })`
                );
            }
        }
        if ((oclass.defaultClusterId === -1) !== model.isAbstract && model.name !== 'V' && model.name !== 'E') {
            throw new Error(
                `The abstractness (${
                    model.isAbstract
                }) of the schema model ${
                    model.name
                } does not match the database definition (${
                    oclass.defaultClusterId
                })`
            );
        }
    }
}


module.exports = {
    ClassModel,
    Property
};
