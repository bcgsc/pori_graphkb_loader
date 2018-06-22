'use strict';
/** @module app/repo/error */
const jc = require('json-cycle');


class ErrorMixin extends Error {
    constructor(content) {
        let message;
        if (typeof content === 'object' && content !== null) {
            message = content.message;
            delete content.message;
        } else {
            message = content;
            content = {};
        }
        super(message);
        this.message = message;
        this.name = this.constructor.name;
        Error.captureStackTrace(this);
        this.content = content;
    }
    toJSON() {
        return jc.decycle(Object.assign(this.content, {
            message: this.message,
            name: this.name,
            stacktrace: this.stack
        }));
    }
}


class AttributeError extends ErrorMixin {}


class ParsingError extends ErrorMixin {}


class ControlledVocabularyError extends ErrorMixin {}


class NoRecordFoundError extends ErrorMixin {}


class PermissionError extends ErrorMixin {}


class AuthenticationError extends ErrorMixin {}


class MultipleRecordsFoundError extends ErrorMixin {}


class RecordExistsError extends ErrorMixin {}


module.exports = {
    RecordExistsError,
    ErrorMixin,
    AttributeError,
    ParsingError,
    ControlledVocabularyError,
    NoRecordFoundError,
    MultipleRecordsFoundError,
    PermissionError,
    AuthenticationError
};