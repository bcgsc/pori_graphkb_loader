

/** @module app/repo/error */
const jc = require('json-cycle');
const _ = require('lodash');


class ErrorMixin extends Error {
    constructor(content) {
        let message;
        if (typeof content === 'object' && content !== null) {
            message = content.message;
        } else {
            message = content;
        }
        super(message);
        this.message = message;
        this.name = this.constructor.name;
        Error.captureStackTrace(this);
        this.content = _.omit(content, ['message']);
    }

    toJSON() {
        return jc.decycle(Object.assign(this.content, {
            message: this.message,
            name: this.name,
            stacktrace: Array.from(this.stack.split('\n'), line => line.trim())
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


class NotImplementedError extends ErrorMixin {}


module.exports = {
    RecordExistsError,
    ErrorMixin,
    AttributeError,
    ParsingError,
    ControlledVocabularyError,
    NoRecordFoundError,
    MultipleRecordsFoundError,
    PermissionError,
    NotImplementedError,
    AuthenticationError
};
