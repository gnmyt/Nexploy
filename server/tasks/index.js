const { registerTaskHandler, createTask } = require("./taskRunner");
const updateContainersHandler = require("./handlers/updateContainers");
const updateServerMetricsHandler = require("./handlers/updateServerMetrics");
const logger = require("../utils/logger");

const METRICS_INTERVAL = 60 * 1000;

const initializeTaskHandlers = () => {
    registerTaskHandler("UpdateContainers", updateContainersHandler);
    registerTaskHandler("UpdateServerMetrics", updateServerMetricsHandler);

    setInterval(() => {
        createTask("UpdateServerMetrics").catch(err => {
            logger.error("Scheduled metrics update failed", { error: err.message });
        });
    }, METRICS_INTERVAL);

    setTimeout(() => {
        createTask("UpdateServerMetrics").catch(() => {});
    }, 5000);
};

module.exports = { initializeTaskHandlers };
