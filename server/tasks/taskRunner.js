const logger = require("../utils/logger");

const taskHandlers = {};

const registerTaskHandler = (type, handler) => {
    taskHandlers[type] = handler;
    logger.info(`Task handler registered: ${type}`);
};

const createTask = async (type, data = null) => {
    const handler = taskHandlers[type];
    if (!handler) {
        logger.error(`No handler for task type: ${type}`);
        return;
    }

    logger.info(`Task started: ${type}`);

    handler(data).then(() => {
        logger.info(`Task completed: ${type}`);
    }).catch(err => {
        logger.error(`Task failed: ${type}`, { error: err.message });
    });
};

module.exports = { registerTaskHandler, createTask };
