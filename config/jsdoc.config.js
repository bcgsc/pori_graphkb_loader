
module.exports = {
    plugins: ['plugins/markdown'],
    markdown: {
        idInHeadings: true
    },
    templates: {
        default: {
            staticFiles: {
                include: ['doc']
            }
        }
    }
};
