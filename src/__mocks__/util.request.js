const fs = require('fs');
const _ = require('lodash');
const jwt = require('jsonwebtoken');

const request = jest.fn(({ body, uri, qs = {} } = {}) => {
    // Load mock dataset
    const filepath = global.mockFile; // mockFile is glogal variable declared in current test file
    const mockDataset = JSON.parse(fs.readFileSync(filepath, { encoding: 'utf-8', flag: 'r' }));

    // Update expired API token if needed
    const epochSeconds = () => Math.floor(new Date().getTime() / 1000);

    if (jwt.decode(mockDataset[0].response.kbToken).exp <= epochSeconds()) {
        mockDataset[0].response.kbToken = jwt.sign({ foo: 'bar' }, 'secret');
        fs.writeFileSync(filepath, JSON.stringify(mockDataset));
    }

    // Edit url object
    const url = new URL(uri);
    Object.keys(qs).forEach(key => url.searchParams.append(key, qs[key]));

    // Standardize request with mock dataset format
    const req = { url: url.href.replace(/^http.*8080/, 'http://bcgsc.ca:8080') };

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

    for (let i = 0; i < mockDataset.length; i++) {
        if (_.isEqual(mockDataset[i].request, req)) {
            res = mockDataset[i].response;
            break;
        }
    }

    // Returns corresponding mock response
    if (res) {
        return res;
    }
    throw new Error('');
});

module.exports = {
    request,
};
