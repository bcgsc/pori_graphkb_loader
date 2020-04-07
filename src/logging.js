/**
 * module responsible for setting up logging
 * @module importer/logging
 */
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const moment = require('moment');

const GKB_LOG_LEVEL = process.env.GKB_LOG_LEVEL || 'info';

const transports = [
    new winston.transports.Console({
        level: GKB_LOG_LEVEL,
        timestamp: true,
        colorize: true,
    }),
];

let logfile = null;

if (process.env.GKB_LOG_DIR) {
    logfile = path.join(process.env.GKB_LOG_DIR, `${process.env.npm_package_name}-%DATE%-${process.pid}.log`);
    const transport = new DailyRotateFile({
        level: GKB_LOG_LEVEL,
        filename: logfile,
        maxFiles: `${process.env.GKB_LOG_MAX_FILES || 14}d`, // remove logs more than 2 weeks old
        timestamp: true,
    });
    transports.push(transport);
}

const logFormat = winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`);

const logger = winston.createLogger({
    levels: winston.config.npm.levels,
    transports,
    format: winston.format.combine(
        winston.format.timestamp(),
        logFormat,
    ),
});


const getFilename = () => {
    if (logfile) {
        return logfile.replace('%DATE%', moment().format('YYYY-MM-DD'));
    }
    return null;
};

if (logfile) {
    logger.log('info', `writing logs to ${getFilename()}`);
}

module.exports = { logger, getFilename };
