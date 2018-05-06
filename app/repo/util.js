const moment = require('moment');
const uuidValidate = require('uuid-validate');

const castUUID = (uuid) => {
    if (uuidValidate(uuid, 4)) {
        return uuid;
    }
    throw new Error(`not a valid version 4 uuid ${uuid}`);
};

const timeStampNow = () => {
    return moment().valueOf();
};

const getParameterPrefix = (param) => {
    const match = /^([^\.]+)\.([^\.]+)$/.exec(param);
    if (match) {
        return {prefix: match[1], suffix: match[2]};
    } else {
        return {};
    }
};

module.exports = {timeStampNow, castUUID, getParameterPrefix};
