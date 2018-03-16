const cache = {
    vocabulary: {},
    users: {},
    features: {},
    userGroups: {}
}

// reformats the rows to fit with the cache expected structure
cache.loadVocabulary = (rows) => {
    cache.vocabulary = {};  // remove old vocabulary
    for (let row of rows) {
        if (cache.vocabulary[row.class] === undefined) {
            cache.vocabulary[row.class] = {};
        }
        if (cache.vocabulary[row.class][row.property] === undefined) {
            cache.vocabulary[row.class][row.property] = [];
        }
        cache.vocabulary[row.class][row.property].push(row);
    }
};

module.exports = cache; 
