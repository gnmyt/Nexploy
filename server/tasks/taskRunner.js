const logger = require("../utils/logger");
const eventBus = require("../utils/eventBus");

const taskHandlers = {};

const TASK_EVENT_MAP = {
    UpdateContainers: "containers:updated",
    UpdateStacks: "stacks:updated",
};

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

    try {
        await handler(data);
        logger.info(`Task completed: ${type}`);
    } catch (err) {
        logger.error(`Task failed: ${type}`, { error: err.message });
    } finally {
        const event = TASK_EVENT_MAP[type];
        if (event) {
            await eventBus.emit(event, { serverId: data?.serverId || null });
        }
    }
};

module.exports = { registerTaskHandler, createTask };
