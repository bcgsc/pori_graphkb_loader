const _ = require('lodash');

const request = jest.fn(({ body, uri, qs = {} } = {}) => {
    // Edit url object with qs
    const url = new URL(uri);
    Object.keys(qs).forEach(key => url.searchParams.append(key, qs[key]));

    // Standardize request with mock dataset format
    const req = { url: url.href.replace(/^http.*8080\/api/, global.baseUrl) };

    if (body) {
        req.body = { ...body };

        if ('password' in req.body) {
            req.body.password = '';
        } if ('username' in req.body) {
            req.body.username = '';
        }
    }

    // Search for a matching request in mock dataset
    let res;

    for (let i = 0; i < global.mockDataset.length; i++) {
        if (_.isEqual(global.mockDataset[i].request, req)) {
            res = global.mockDataset[i].response;
            // Delete request from the dataset.
            // Help dealing with identical requests with differents responses
            global.mockDataset.splice(i, 1);
            break;
        }
    }

    // Returns corresponding mock response
    if (res) {
        return res;
    }
    throw new Error('Actual request not in mock dataset');
});

module.exports = {
    request,
};
