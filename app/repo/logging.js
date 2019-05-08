/**
 * module responsible for setting up logging
 */
/**
 * @ignore
 */
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

const GKB_LOG_LEVEL = process.env.GKB_LOG_LEVEL || 'debug';

const transports = [
    new winston.transports.Console({
        level: GKB_LOG_LEVEL,
        timestamp: true,
        colorize: true
    })
];

let logfile = null;
if (process.env.GKB_LOG_DIR) {
    logfile = path.join(process.env.GKB_LOG_DIR, `${process.env.npm_package_name}-%DATE%-${process.pid}.log`);
    transports.push(new DailyRotateFile({
        level: GKB_LOG_LEVEL,
        filename: logfile,
        maxFiles: `${process.env.GKB_LOG_MAX_FILES || 14}d`, // remove logs more than 2 weeks old
        timestamp: true
    }));
}

const logFormat = winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`);

const logger = winston.createLogger({
    levels: winston.config.npm.levels,
    transports,
    format: winston.format.combine(
        winston.format.timestamp(),
        logFormat
    )
});

if (logfile) {
    logger.log('info', `writing logs to ${logfile}`);
}

module.exports = {logger};
