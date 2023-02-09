const _asco = require('../asco');
const _pubmed = require('../entrez/pubmed');

/**
 * Check two strings are the same irrespective of casing, trailing periods and other formatting
 */
const titlesMatch = (title1, title2) => {
    const title1Simple = title1.trim().toLowerCase().replace(/\.$/, '').replace(/<\/?(em|i|bold)>/g, '');
    const title2Simple = title2.trim().toLowerCase().replace(/\.$/, '').replace(/<\/?(em|i|bold)>/g, '');
    return title1Simple === title2Simple;
};


/**
 * Fetches the publication record either from pubmed or the ASCO abstract
 *
 * @param {ApiConnection} conn graphkb API connector
 * @param {object} rawRecord CIViC Evidence Item JSON record
 */
const getPublication = async (conn, rawRecord) => {
    if (rawRecord.source.sourceType === 'PUBMED') {
        const [publication] = await _pubmed.fetchAndLoadByIds(conn, [rawRecord.source.citationId]);

        if (!publication) {
            throw Error(`PMID ${rawRecord.source.citationId} is not available`);
        }
        return publication;
    }
    if (rawRecord.source.sourceType === 'ASCO') {
        const abstracts = await _asco.fetchAndLoadByIds(conn, [rawRecord.source.ascoAbstractId]);

        if (abstracts.length === 0) {
            throw Error(`unable to find ASCO abstract (${rawRecord.source.ascoAbstractId})`);
        }

        const yearFilteredAbstracts = abstracts.filter(
            a => a.year === rawRecord.source.publicationYear,
        );

        if (yearFilteredAbstracts.length === 0) {
            throw Error(`An abstract of matching number (${rawRecord.source.ascoAbstractId}) and year (${rawRecord.source.publicationYear}) was not found in the ASCO DB`);
        }

        // select the abstract that matches our metadata
        const filteredAbstracts = yearFilteredAbstracts.filter(a => (
            (!rawRecord.source.sourceUrl || rawRecord.source.sourceUrl.includes(a.sourceId))
            && titlesMatch(rawRecord.source.name, a.name)
        ));

        if (filteredAbstracts.length === 0) {
            throw Error(`failed to select the relevant abstract (${rawRecord.source.ascoAbstractId}) from (${yearFilteredAbstracts.length}) abstracts with the same year and abstract ID`);
        } else if (filteredAbstracts.length > 1) {
            throw Error(`too many choice for abstract (${rawRecord.source.ascoAbstractId})`);
        }
        return abstracts[0];
    }
    if (rawRecord.source.sourceType === 'ASH') {
        // 6 cases
        // TODO: ASH loader
    }
    throw Error(`unable to process non-pubmed/non-asco evidence type (${rawRecord.source.sourceType}) for evidence item (${rawRecord.id})`);
};


module.exports = { getPublication, titlesMatch };
