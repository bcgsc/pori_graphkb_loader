/**
 * module responsible for setting up logging
 */
/**
 * @ignore
 */
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

const transports = [
    new winston.transports.Console({
        level: process.env.GKB_LOG_LEVEL || 'debug',
        timestamp: true,
        colorize: true
    })
];
if (process.env.GKB_LOG_DIR) {
    transports.push(new DailyRotateFile({
        level: 'info',
        filename: path.join(process.env.GKB_LOG_DIR, `${process.env.npm_package_name}-%DATE%.log`),
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

module.exports = {logger};
