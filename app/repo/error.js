'use strict';

const errorJSON = function(error) {
    return {type: error.type, message: error.message};
};

class AttributeError extends Error {}


class ParsingError extends Error {}


class ControlledVocabularyError extends Error {} 


class NoResultFoundError extends Error {}


class PermissionError extends Error {}


class AuthenticationError extends Error {}


class MultipleResultsFoundError extends Error {}


module.exports = {
    AttributeError, errorJSON, ParsingError, ControlledVocabularyError, NoResultFoundError, MultipleResultsFoundError, PermissionError, AuthenticationError
};
