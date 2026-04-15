const { registerTaskHandler, createTask } = require("./taskRunner");
const updateContainersHandler = require("./handlers/updateContainers");
const updateServerMetricsHandler = require("./handlers/updateServerMetrics");
const updateStacksHandler = require("./handlers/updateStacks");
const syncSourcesHandler = require("./handlers/syncSources");
const checkAppUpdatesHandler = require("./handlers/checkAppUpdates");
const checkDeploymentUpdatesHandler = require("./handlers/checkDeploymentUpdates");
const logger = require("../utils/logger");

const METRICS_INTERVAL = 60 * 1000;
const SOURCE_SYNC_INTERVAL = 60 * 60 * 1000;
const APP_UPDATE_CHECK_INTERVAL = 30 * 60 * 1000;
const DEPLOYMENT_CHECK_INTERVAL = 5 * 60 * 1000;

const initializeTaskHandlers = () => {
    registerTaskHandler("UpdateContainers", updateContainersHandler);
    registerTaskHandler("UpdateServerMetrics", updateServerMetricsHandler);
    registerTaskHandler("UpdateStacks", updateStacksHandler);
    registerTaskHandler("SyncSources", syncSourcesHandler);
    registerTaskHandler("CheckAppUpdates", checkAppUpdatesHandler);
    registerTaskHandler("CheckDeploymentUpdates", checkDeploymentUpdatesHandler);

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

    setInterval(() => {
        createTask("CheckAppUpdates").catch(err => {
            logger.error("Scheduled app update check failed", { error: err.message });
        });
    }, APP_UPDATE_CHECK_INTERVAL);

    setInterval(() => {
        createTask("CheckDeploymentUpdates").catch(err => {
            logger.error("Scheduled deployment update check failed", { error: err.message });
        });
    }, DEPLOYMENT_CHECK_INTERVAL);

    setTimeout(() => {
        createTask("UpdateServerMetrics").catch(() => {});
    }, 5000);

    setTimeout(() => {
        createTask("SyncSources").catch(() => {});
    }, 10000);

    setTimeout(() => {
        createTask("CheckAppUpdates").catch(() => {});
    }, 15000);
};

module.exports = { initializeTaskHandlers };
