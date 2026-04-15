const Server = require("../../models/Server");
const Stack = require("../../models/Stack");
const { sessionManager } = require("../../adapters/SessionManager");
const logger = require("../../utils/logger");
const dockerApi = require("../../utils/dockerApi");

const updateStacksHandler = async (data) => {
    const { serverId } = data || {};

    let servers;
    if (serverId) {
        const server = await Server.findByPk(serverId);
        if (!server || server.status !== "active") return;
        servers = [server];
    } else {
        servers = await Server.findAll({ where: { status: "active" } });
    }

    for (const server of servers) {
        try {
            await updateServerStacks(server);
        } catch (err) {
            logger.error(`Failed to update stacks for server ${server.id}`, { error: err.message });
        }
    }
};

const updateServerStacks = async (server) => {
    let session;
    try {
        session = await sessionManager.getOrCreateSession(server);
    } catch (err) {
        throw new Error(`Failed to connect: ${err.message}`);
    }

    const docker = dockerApi(session);

    let containers;
    try {
        const filters = encodeURIComponent('{"label":["com.docker.compose.project"]}');
        containers = await docker.getJson(
            `/containers/json?all=true&filters=${filters}`
        );
    } catch (err) {
        throw new Error(`Failed to query Docker: ${err.message}`);
    }

    const stackMap = new Map();

    for (const c of containers) {
        const labels = c.Labels || {};
        const project = labels["com.docker.compose.project"];
        if (!project) continue;

        if (!stackMap.has(project)) {
            stackMap.set(project, {
                name: project,
                directory: labels["com.docker.compose.project.working_dir"] || "",
                configFile: labels["com.docker.compose.project.config_files"] || "docker-compose.yml",
                containers: [],
            });
        }

        stackMap.get(project).containers.push({
            state: c.State?.toLowerCase(),
        });
    }

    const fetchedNames = new Set();

    for (const [name, info] of stackMap) {
        fetchedNames.add(name);

        const running = info.containers.filter(c => c.state === "running").length;
        const total = info.containers.length;
        let status = "stopped";
        if (running === total && total > 0) status = "running";
        else if (running > 0) status = "partial";

        const configFile = info.configFile.includes(",")
            ? info.configFile.split(",")[0].trim()
            : info.configFile;

        const existing = await Stack.findOne({ where: { name, serverId: server.id } });

        const stackData = {
            serverId: server.id,
            name,
            directory: info.directory,
            configFile,
            status,
            services: total,
            lastUpdated: new Date(),
        };

        if (existing) {
            await Stack.update(stackData, { where: { id: existing.id } });
            if (!existing.icon) await updateStackIcon(session, existing.id, info.directory);
        } else {
            const created = await Stack.create(stackData);
            await updateStackIcon(session, created.id, info.directory);
        }
    }

    const existingStacks = await Stack.findAll({
        where: { serverId: server.id },
        attributes: ["id", "name", "directory"],
    });

    for (const existing of existingStacks) {
        if (fetchedNames.has(existing.name)) {
            const configFile = stackMap.get(existing.name)?.configFile || "docker-compose.yml";
            const filePath = configFile.startsWith("/") ? configFile : `${existing.directory}/${configFile}`;
            const checkResult = await session.exec(
                `test -f ${escapeShellArg(filePath)} && echo "exists" || echo "missing"`,
                { stream: false }
            );
            if (checkResult.stdout.trim() !== "exists") {
                await Stack.update({ status: "orphaned", lastUpdated: new Date() }, { where: { id: existing.id } });
            }
        } else {
            const checkResult = await session.exec(
                `test -f ${escapeShellArg(existing.directory)}/docker-compose.yml && echo "exists" || echo "missing"`,
                { stream: false }
            );

            if (checkResult.stdout.trim() === "exists") {
                await Stack.update({ status: "stopped", services: 0, lastUpdated: new Date() }, { where: { id: existing.id } });
            } else {
                await Stack.destroy({ where: { id: existing.id } });
            }
        }
    }
};

const updateStackIcon = async (session, stackId, directory) => {
    try {
        const checkResult = await session.exec(
            `test -f ${escapeShellArg(directory)}/logo.png && echo "exists" || echo "missing"`,
            { stream: false }
        );

        if (checkResult.stdout.trim() !== "exists") return;

        const result = await session.exec(
            `base64 -w 0 ${escapeShellArg(directory)}/logo.png`,
            { stream: false }
        );

        if (result.code === 0 && result.stdout.length > 0 && result.stdout.length < 500000) {
            await Stack.update(
                { icon: `data:image/png;base64,${result.stdout.trim()}` },
                { where: { id: stackId } }
            );
        }
    } catch {
    }
};

const escapeShellArg = (arg) => `'${arg.replace(/'/g, "'\\''")}'`;

module.exports = updateStacksHandler;
