/**
 * module responsible for setting up logging
 * @module app/repo/logging
 */

const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

const transports = [
    new winston.transports.Console({level: process.env.LOG_LEVEL || 'info', timestamp: true, colorize: true})
];
if (process.env.LOG_DIR) {
    transports.push(new DailyRotateFile({
        level: 'info',
        filename: path.join(process.env.LOG_DIR, `${process.env.npm_package_name}-%DATE%.log`),
        maxFiles: '14d', // remove logs more than 2 weeks old
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

const progress = (content) => {
    if (['info', 'debug', 'verbose'].includes(winston.level)) {
        process.stdout.write(content);
    }
};

module.exports = {logger, progress};
