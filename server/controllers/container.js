const Container = require("../models/Container");
const Server = require("../models/Server");
const { createTask } = require("../tasks/taskRunner");
const { sessionManager } = require("../adapters/SessionManager");
const logger = require("../utils/logger");
const dockerApi = require("../utils/dockerApi");

const parseContainer = (container) => {
    if (!container) return null;
    return {
        ...container,
        ports: container.ports ? JSON.parse(container.ports) : [],
        networks: container.networks ? JSON.parse(container.networks) : [],
        volumes: container.volumes ? JSON.parse(container.volumes) : [],
    };
};

module.exports.listContainers = async (serverId = null) => {
    const where = {};
    if (serverId) where.serverId = serverId;

    const containers = await Container.findAll({ where, order: [["name", "ASC"]] });
    return containers.map(parseContainer);
};

module.exports.getContainer = async (id) => {
    const container = await Container.findByPk(id);
    if (!container) return { code: 401, message: "Container not found" };
    return parseContainer(container);
};

module.exports.refreshContainers = async (serverId = null) => {
    await createTask("UpdateContainers", serverId ? { serverId } : null);
    return { message: "Container refresh started" };
};

module.exports.containerAction = async (id, action) => {
    const container = await Container.findByPk(id);
    if (!container) return { code: 401, message: "Container not found" };

    const server = await Server.findByPk(container.serverId);
    if (!server || server.status !== "active") return { code: 402, message: "Server not available" };

    const validActions = ["start", "stop", "restart", "pause", "unpause", "kill"];
    if (!validActions.includes(action)) return { code: 403, message: "Invalid action" };

    try {
        const session = await sessionManager.getOrCreateSession(server);
        const docker = dockerApi(session);

        await docker.post(`/containers/${container.containerId}/${action}`);

        await createTask("UpdateContainers", { serverId: server.id });
        logger.info(`Container action executed: ${action}`, { containerId: id, dockerId: container.containerId });
        return { message: `Container ${action} successful` };
    } catch (err) {
        logger.error(`Container action failed: ${action}`, { containerId: id, error: err.message });
        return { code: 404, message: `Action failed: ${err.message}` };
    }
};

module.exports.removeContainer = async (id, force = false) => {
    const container = await Container.findByPk(id);
    if (!container) return { code: 401, message: "Container not found" };

    const server = await Server.findByPk(container.serverId);
    if (!server || server.status !== "active") return { code: 402, message: "Server not available" };

    try {
        const session = await sessionManager.getOrCreateSession(server);
        const docker = dockerApi(session);
        const forceParam = force ? "?force=true" : "";

        await docker.del(`/containers/${container.containerId}${forceParam}`);

        await Container.destroy({ where: { id } });
        logger.info("Container removed", { containerId: id, dockerId: container.containerId });
        return { message: "Container removed successfully" };
    } catch (err) {
        logger.error("Container removal failed", { containerId: id, error: err.message });
        return { code: 404, message: `Removal failed: ${err.message}` };
    }
};

module.exports.getContainerLogs = async (id, tail = 100) => {
    const container = await Container.findByPk(id);
    if (!container) return { code: 401, message: "Container not found" };

    const server = await Server.findByPk(container.serverId);
    if (!server || server.status !== "active") return { code: 402, message: "Server not available" };

    try {
        const session = await sessionManager.getOrCreateSession(server);
        const docker = dockerApi(session);

        const stdout = await docker.get(`/containers/${container.containerId}/logs?stdout=true&stderr=true&tail=${tail}`);

        return { logs: stdout.replace(/[\x00-\x08]/g, "") };
    } catch (err) {
        return { code: 404, message: `Failed to get logs: ${err.message}` };
    }
};

module.exports.getContainerStats = async (id) => {
    const container = await Container.findByPk(id);
    if (!container) return { code: 401, message: "Container not found" };

    const server = await Server.findByPk(container.serverId);
    if (!server || server.status !== "active") return { code: 402, message: "Server not available" };

    try {
        const session = await sessionManager.getOrCreateSession(server);
        const docker = dockerApi(session);

        const stats = await docker.getJson(`/containers/${container.containerId}/stats?stream=false`);

        const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
        const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
        const cpuCount = stats.cpu_stats.online_cpus || 1;
        const cpuPercent = systemDelta > 0 ? ((cpuDelta / systemDelta) * cpuCount * 100).toFixed(2) : "0.00";

        const memUsage = stats.memory_stats.usage || 0;
        const memLimit = stats.memory_stats.limit || 1;
        const memPercent = ((memUsage / memLimit) * 100).toFixed(2);

        return {
            cpu: `${cpuPercent}%`,
            memory: formatBytes(memUsage),
            memoryLimit: formatBytes(memLimit),
            memoryPercentage: `${memPercent}%`,
            networkRx: formatBytes(getNetworkRx(stats)),
            networkTx: formatBytes(getNetworkTx(stats)),
            blockRead: formatBytes(getBlockRead(stats)),
            blockWrite: formatBytes(getBlockWrite(stats)),
        };
    } catch (err) {
        return { code: 404, message: `Failed to get stats: ${err.message}` };
    }
};

const formatBytes = (bytes) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

const getNetworkRx = (stats) => {
    if (!stats.networks) return 0;
    return Object.values(stats.networks).reduce((acc, net) => acc + (net.rx_bytes || 0), 0);
};

const getNetworkTx = (stats) => {
    if (!stats.networks) return 0;
    return Object.values(stats.networks).reduce((acc, net) => acc + (net.tx_bytes || 0), 0);
};

const getBlockRead = (stats) => {
    if (!stats.blkio_stats?.io_service_bytes_recursive) return 0;
    return stats.blkio_stats.io_service_bytes_recursive.find(s => s.op === "Read")?.value || 0;
};

const getBlockWrite = (stats) => {
    if (!stats.blkio_stats?.io_service_bytes_recursive) return 0;
    return stats.blkio_stats.io_service_bytes_recursive.find(s => s.op === "Write")?.value || 0;
};
