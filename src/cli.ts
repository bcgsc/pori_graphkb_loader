import { ArgumentParser, ArgumentTypeError } from 'argparse';

import fs from 'fs';

import path from 'path';

/* eslint-disable no-console */
const fileExists = (fileName) => {
    if (!fs.existsSync(fileName)) {
        throw new ArgumentTypeError(`File does not exist: ${fileName}`);
    }
    return path.resolve(fileName);
};

/**
 * Creates the command line help menu
 *
 * @param {Array.<Object>} options the list of option objects
 * @param {string} defns[].name the name of an option
 * @param {string} defns[].description the description of an option
 * @param {function} defns[].type a function to cast the content of an option
 * @param defns[].default the default value of an option
 * @param {boolean} defns[].required flag to indicate if the option is required
 */
const createOptionsMenu = (opt = {}) => {
    const parser = new ArgumentParser(opt);
    parser.add_argument('-g', '--graphkb', {
        default: `${process.env.GKB_URL || 'https://graphkbdev-api.bcgsc.ca/api'}`,
        help: 'URL for the KB API (env: GKB_URL)',
    });
    parser.add_argument('-u', '--username', {
        default: process.env.GKB_USER || 'graphkb_importer',
        help: 'ldap username required for access to the kb (env: USER|GKB_USER)',
    });
    parser.add_argument('-p', '--password', {
        default: process.env.GKB_PASS,
        help: 'the password for access to the kb api (env: GKB_PASS)',
        required: !process.env.GKB_PASS,
    });
    parser.add_argument('--pubmed', {
        default: process.env.PUBMED_API_KEY,
        help: 'The pubmed API key to use for pubmed requests (env: PUBMED_API_KEY)',
    });
    parser.add_argument('--errorLogPrefix', {
        default: `${process.cwd()}/errorLog-${new Date().valueOf()}`,
        help: 'prefix to use for any module specific log files that are written',
    });
    return parser;
};

export { createOptionsMenu, fileExists };
