const Server = require("../../models/Server");
const Container = require("../../models/Container");
const { sessionManager } = require("../../adapters/SessionManager");
const logger = require("../../utils/logger");
const dockerApi = require("../../utils/dockerApi");

const updateContainersHandler = async (data) => {
    const { serverId } = data || {};

    let servers;
    if (serverId) {
        const server = await Server.findByPk(serverId);
        if (!server || server.status !== "active") return { success: false, message: "Server not found or not active" };
        servers = [server];
    } else {
        servers = await Server.findAll({ where: { status: "active" } });
    }

    const results = { serversProcessed: 0, containersUpdated: 0, containersRemoved: 0, errors: [] };

    for (const server of servers) {
        try {
            await updateServerContainers(server, results);
            results.serversProcessed++;
        } catch (err) {
            logger.error(`Failed to update containers for server ${server.id}`, { error: err.message });
            results.errors.push({ serverId: server.id, error: err.message });
        }
    }

    logger.info("UpdateContainers task completed", results);
    return results;
};

const updateServerContainers = async (server, results) => {
    let session;
    try {
        session = await sessionManager.getOrCreateSession(server);
    } catch (err) {
        throw new Error(`Failed to connect: ${err.message}`);
    }

    const docker = dockerApi(session);

    let dockerContainers;
    try {
        dockerContainers = await docker.getJson("/containers/json?all=true");
    } catch (err) {
        throw new Error(`Failed to parse Docker response: ${err.message}`);
    }

    const existingContainers = await Container.findAll({
        where: { serverId: server.id },
        attributes: ["id", "containerId"],
    });
    const fetchedContainerIds = new Set();

    for (const dc of dockerContainers) {
        const containerId = dc.Id.substring(0, 12);
        fetchedContainerIds.add(dc.Id);
        fetchedContainerIds.add(containerId);

        const containerData = {
            containerId,
            serverId: server.id,
            name: dc.Names?.[0]?.replace(/^\//, "") || "unknown",
            image: dc.Image || "unknown",
            imageId: dc.ImageID?.substring(7, 19) || null,
            status: mapDockerStatus(dc.State),
            state: dc.Status || null,
            created: dc.Created ? new Date(dc.Created * 1000) : null,
            ports: JSON.stringify(parsePorts(dc.Ports)),
            networks: JSON.stringify(Object.keys(dc.NetworkSettings?.Networks || {})),
            volumes: JSON.stringify(parseMounts(dc.Mounts)),
            command: dc.Command || null,
            lastUpdated: new Date(),
        };

        const existing = await Container.findOne({
            where: { containerId, serverId: server.id }
        });

        if (existing) {
            await Container.update(containerData, { where: { id: existing.id } });
        } else {
            await Container.create(containerData);
        }

        results.containersUpdated++;
    }

    for (const existing of existingContainers) {
        if (!fetchedContainerIds.has(existing.containerId)) {
            await Container.destroy({ where: { id: existing.id } });
            results.containersRemoved++;
        }
    }
};

const mapDockerStatus = (state) => {
    switch (state?.toLowerCase()) {
        case "running": return "running";
        case "exited": return "exited";
        case "paused": return "paused";
        case "restarting": return "restarting";
        case "dead": return "dead";
        case "created": return "created";
        default: return "unknown";
    }
};

const parsePorts = (ports) => {
    if (!ports || !Array.isArray(ports)) return [];
    return ports.map(p => ({
        PublicPort: p.PublicPort || null,
        PrivatePort: p.PrivatePort || null,
        Type: p.Type || "tcp",
        IP: p.IP || "0.0.0.0",
    }));
};

const parseMounts = (mounts) => {
    if (!mounts || !Array.isArray(mounts)) return [];
    return mounts.map(m => ({
        host: m.Source || m.Name || "",
        container: m.Destination || "",
        mode: m.RW ? "rw" : "ro",
    }));
};

module.exports = updateContainersHandler;
