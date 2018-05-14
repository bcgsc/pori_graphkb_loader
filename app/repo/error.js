'use strict';


class ErrorMixin extends Error {
    constructor(message) {
        super(message);
        this.message = message;
        this.name = this.constructor.name;
        Error.captureStackTrace(this);
    }
    toJSON() {
        return {
            message: this.message,
            name: this.name,
            stacktrace: this.stack
        };
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