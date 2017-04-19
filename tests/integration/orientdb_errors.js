"use strict";
const {expect} = require('chai');

const expectDuplicateKeyError = (error) => {
    expect(error.message).to.include('duplicated key');
    expect(error.type).to.equal('com.orientechnologies.orient.core.storage.ORecordDuplicatedException');
    expect(error.name).to.equal('OrientDB.RequestError');
};

const expectAbstractClassError = (error) => {
    expect(error.message).to.include('abstract class');
    expect(error.type).to.equal('com.orientechnologies.orient.core.exception.OSchemaException');
    expect(error.name).to.equal('OrientDB.RequestError');
};

const expectNullConstraintError = (error) => {
    expect(error.message).to.include('cannot be null');
    expect(error.type).to.equal('com.orientechnologies.orient.core.exception.OValidationException');
    expect(error.name).to.equal('OrientDB.RequestError');
};

const expectMissingMandatoryAttributeError = (error) => {
    expect(error.message).to.include('mandatory, but not found');
    expect(error.type).to.equal('com.orientechnologies.orient.core.exception.OValidationException');
    expect(error.name).to.equal('OrientDB.RequestError');
};

module.exports = {expectDuplicateKeyError, expectAbstractClassError, expectNullConstraintError, expectMissingMandatoryAttributeError};
