const { registerTaskHandler, createTask } = require("./taskRunner");
const updateContainersHandler = require("./handlers/updateContainers");
const updateServerMetricsHandler = require("./handlers/updateServerMetrics");
const updateStacksHandler = require("./handlers/updateStacks");
const syncSourcesHandler = require("./handlers/syncSources");
const logger = require("../utils/logger");

const METRICS_INTERVAL = 60 * 1000;
const SOURCE_SYNC_INTERVAL = 60 * 60 * 1000;

const initializeTaskHandlers = () => {
    registerTaskHandler("UpdateContainers", updateContainersHandler);
    registerTaskHandler("UpdateServerMetrics", updateServerMetricsHandler);
    registerTaskHandler("UpdateStacks", updateStacksHandler);
    registerTaskHandler("SyncSources", syncSourcesHandler);

    setInterval(() => {
        createTask("UpdateServerMetrics").catch(err => {
            logger.error("Scheduled metrics update failed", { error: err.message });
        });
    }, METRICS_INTERVAL);

    setInterval(() => {
        createTask("SyncSources").catch(err => {
            logger.error("Scheduled source sync failed", { error: err.message });
        });
    }, SOURCE_SYNC_INTERVAL);

    setTimeout(() => {
        createTask("UpdateServerMetrics").catch(() => {});
    }, 5000);

    setTimeout(() => {
        createTask("SyncSources").catch(() => {});
    }, 10000);
};

module.exports = { initializeTaskHandlers };
