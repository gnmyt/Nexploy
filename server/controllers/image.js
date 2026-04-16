const Server = require("../models/Server");
const { sessionManager } = require("../adapters/SessionManager");
const logger = require("../utils/logger");
const dockerApi = require("../utils/dockerApi");
const eventBus = require("../utils/eventBus");

const formatBytes = (bytes) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

module.exports.listImages = async (serverId = null) => {
    const where = { status: "active" };
    if (serverId) where.id = serverId;

    const servers = await Server.findAll({
        where,
        attributes: { exclude: ["credentials", "passphrase"] },
    });

    const allImages = [];

    for (const server of servers) {
        try {
            const session = await sessionManager.getOrCreateSession(server);
            const docker = dockerApi(session);
            const images = await docker.getJson("/images/json?all=false");

            for (const img of images) {
                const tags = img.RepoTags || ["<none>:<none>"];
                for (const tag of tags) {
                    const [repo, tagName] = tag.includes(":") ? [tag.substring(0, tag.lastIndexOf(":")), tag.substring(tag.lastIndexOf(":") + 1)] : [tag, "latest"];
                    allImages.push({
                        id: img.Id,
                        shortId: img.Id.replace("sha256:", "").substring(0, 12),
                        repository: repo,
                        tag: tagName,
                        fullTag: tag,
                        size: img.Size,
                        sizeFormatted: formatBytes(img.Size),
                        created: img.Created * 1000,
                        containers: img.Containers || 0,
                        serverId: server.id,
                        serverName: server.name,
                    });
                }
            }
        } catch (err) {
            logger.error("Failed to list images from server", { serverId: server.id, error: err.message });
        }
    }

    return allImages;
};

module.exports.pullImage = async (serverId, imageName) => {
    const server = await Server.findByPk(serverId);
    if (server?.status !== "active") return { code: 402, message: "Server not available" };

    try {
        const session = await sessionManager.getOrCreateSession(server);
        const result = await session.exec(
            `docker pull ${imageName} 2>&1`,
            { stream: false }
        );

        if (result.code !== 0) {
            return { code: 404, message: `Pull failed: ${result.stderr || result.stdout}` };
        }

        logger.info("Image pulled", { serverId: server.id, image: imageName });
        await eventBus.emit("images:updated", { serverId: server.id });
        return { message: `Successfully pulled ${imageName}` };
    } catch (err) {
        logger.error("Image pull failed", { serverId: server.id, image: imageName, error: err.message });
        return { code: 404, message: `Pull failed: ${err.message}` };
    }
};

module.exports.removeImage = async (serverId, imageId, force = false) => {
    const server = await Server.findByPk(serverId);
    if (server?.status !== "active") return { code: 402, message: "Server not available" };

    try {
        const session = await sessionManager.getOrCreateSession(server);
        const docker = dockerApi(session);
        const forceParam = force ? "?force=true" : "";

        await docker.del(`/images/${encodeURIComponent(imageId)}${forceParam}`);

        logger.info("Image removed", { serverId: server.id, imageId });
        await eventBus.emit("images:updated", { serverId: server.id });
        return { message: "Image removed successfully" };
    } catch (err) {
        logger.error("Image removal failed", { serverId: server.id, imageId, error: err.message });
        return { code: 404, message: `Removal failed: ${err.message}` };
    }
};

module.exports.pruneImages = async (serverId) => {
    const server = await Server.findByPk(serverId);
    if (server?.status !== "active") return { code: 402, message: "Server not available" };

    try {
        const session = await sessionManager.getOrCreateSession(server);
        const docker = dockerApi(session);
        const result = await docker.post("/images/prune");
        const parsed = JSON.parse(result);

        const deleted = parsed.ImagesDeleted?.length || 0;
        const reclaimed = parsed.SpaceReclaimed || 0;

        logger.info("Images pruned", { serverId: server.id, deleted, reclaimed });
        await eventBus.emit("images:updated", { serverId: server.id });
        return {
            message: `Pruned ${deleted} image(s), reclaimed ${formatBytes(reclaimed)}`,
            deleted,
            spaceReclaimed: reclaimed,
            spaceReclaimedFormatted: formatBytes(reclaimed),
        };
    } catch (err) {
        logger.error("Image prune failed", { serverId: server.id, error: err.message });
        return { code: 404, message: `Prune failed: ${err.message}` };
    }
};
