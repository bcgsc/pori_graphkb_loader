const commandLineArgs = require('command-line-args');
const commandLineUsage = require('command-line-usage');
const fs = require('fs');
const path = require('path');

/* eslint-disable no-console */

const argumentError = (usage, msg) => {
    console.log(usage);
    console.error(`Argument Error: ${msg}\n`);
    process.exit(2);
};


const fileExists = (fileName) => {
    if (!fs.existsSync(fileName)) {
        throw new Error(`File does not exist: ${fileName}`);
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
const createOptionsMenu = (defns, opt) => {
    for (const defn of defns) {
        if (defn.env !== undefined) {
            if (process.env[defn.env] !== undefined) {
                defn.default = process.env[defn.env];
            }
            defn.description = `${defn.description} (${defn.env})`;
        }
        if (defn.default !== undefined) {
            defn.description = `[default: ${
                /\bpass(word)?\b/.exec(defn.name) === null
                    ? defn.default
                    : '****'
            }] ${defn.description}`;
        }
    }
    const usage = commandLineUsage([
        { header: opt.title || 'Help Menu', content: opt.description || '' },
        { header: 'Options', optionList: defns },
    ]);
    let options;

    try {
        options = commandLineArgs(defns);
    } catch (err) {
        argumentError(usage, err.message);
    }

    // check if they are looking for the help menu
    if (options.help !== undefined) {
        console.log(usage);
        process.exit(0);
    }

    // check all required arguments
    for (const option of defns) {
        if (options[option.name] === undefined) {
            if (option.default !== undefined) {
                options[option.name] = option.default;
            } else if (option.required) {
                argumentError(usage, `--${option.name} is a required argument`);
            }
        }
    }

    // at least one argument must be given, or show the help menu and exit
    if (Object.keys(options).length === 0) {
        console.log(usage);
        process.exit(0);
    }
    return options;
};

module.exports = { createOptionsMenu, fileExists };
