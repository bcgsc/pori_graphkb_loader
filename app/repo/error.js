

/** @module app/repo/error */
const {error: {ErrorMixin}} = require('@bcgsc/knowledgebase-parser');
const {error: {AttributeError}} = require('@bcgsc/knowledgebase-schema');


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
