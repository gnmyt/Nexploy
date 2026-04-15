const Stack = require("../models/Stack");
const Server = require("../models/Server");
const { createTask } = require("../tasks/taskRunner");
const { sessionManager } = require("../adapters/SessionManager");
const logger = require("../utils/logger");

module.exports.listStacks = async (serverId = null) => {
    const where = {};
    if (serverId) where.serverId = serverId;
    return await Stack.findAll({ where, order: [["name", "ASC"]] });
};

module.exports.getStack = async (id) => {
    const stack = await Stack.findByPk(id);
    if (!stack) return { code: 501, message: "Stack not found" };
    return stack;
};

module.exports.refreshStacks = async (serverId = null) => {
    await createTask("UpdateStacks", serverId ? { serverId } : null);
    return { message: "Stack refresh started" };
};

const getSessionForStack = async (stack) => {
    const server = await Server.findByPk(stack.serverId);
    if (!server || server.status !== "active") return { error: { code: 502, message: "Server not available" } };
    const session = await sessionManager.getOrCreateSession(server);
    return { session, server };
};

module.exports.stackAction = async (id, action) => {
    const stack = await Stack.findByPk(id);
    if (!stack) return { code: 501, message: "Stack not found" };

    const validActions = ["start", "stop", "restart", "down"];
    if (!validActions.includes(action)) return { code: 503, message: "Invalid action" };

    const { session, error } = await getSessionForStack(stack);
    if (error) return error;

    const composeCmd = `cd ${escapeShellArg(stack.directory)} && docker compose -f ${escapeShellArg(stack.configFile)}`;
    const actionMap = {
        start: `${composeCmd} up -d --remove-orphans`,
        stop: `${composeCmd} stop`,
        restart: `${composeCmd} restart`,
        down: `${composeCmd} down`,
    };

    try {
        const result = await session.exec(actionMap[action], { stream: false });
        if (result.code !== 0) throw new Error(result.stderr || "Command failed");

        if (action === "stop" || action === "down") {
            const docker = require("../utils/dockerApi")(session);
            const filters = encodeURIComponent(JSON.stringify({ label: [`com.docker.compose.project=${stack.name}`] }));
            try {
                const orphans = await docker.getJson(`/containers/json?all=true&filters=${filters}`);
                for (const c of orphans) {
                    const state = c.State?.toLowerCase();
                    if (state === "running" || state === "restarting") {
                        await docker.post(`/containers/${c.Id}/stop`).catch(() => {});
                    }
                    if (action === "down") {
                        await docker.del(`/containers/${c.Id}?force=true`).catch(() => {});
                    }
                }
            } catch {}
        }

        await createTask("UpdateStacks", { serverId: stack.serverId });
        logger.info(`Stack action executed: ${action}`, { stackId: id, name: stack.name });
        return { message: `Stack ${action} successful` };
    } catch (err) {
        logger.error(`Stack action failed: ${action}`, { stackId: id, error: err.message });
        return { code: 504, message: `Action failed: ${err.message}` };
    }
};

module.exports.getStackCompose = async (id) => {
    const stack = await Stack.findByPk(id);
    if (!stack) return { code: 501, message: "Stack not found" };

    const { session, error } = await getSessionForStack(stack);
    if (error) return error;

    try {
        const filePath = stack.configFile.startsWith("/")
            ? stack.configFile
            : `${stack.directory}/${stack.configFile}`;

        const result = await session.exec(`cat ${escapeShellArg(filePath)}`, { stream: false });
        if (result.code !== 0) throw new Error(result.stderr || "Failed to read file");

        return { content: result.stdout };
    } catch (err) {
        return { code: 504, message: `Failed to read compose file: ${err.message}` };
    }
};

module.exports.updateStackCompose = async (id, content) => {
    const stack = await Stack.findByPk(id);
    if (!stack) return { code: 501, message: "Stack not found" };

    const { session, error } = await getSessionForStack(stack);
    if (error) return error;

    try {
        const filePath = stack.configFile.startsWith("/")
            ? stack.configFile
            : `${stack.directory}/${stack.configFile}`;

        const escaped = content.replace(/'/g, "'\\''");
        const result = await session.exec(
            `cat > ${escapeShellArg(filePath)} << 'NEXPLOY_EOF'\n${escaped}\nNEXPLOY_EOF`,
            { stream: false }
        );
        if (result.code !== 0) throw new Error(result.stderr || "Failed to write file");

        logger.info("Stack compose file updated", { stackId: id, name: stack.name });
        return { message: "Compose file updated successfully" };
    } catch (err) {
        return { code: 504, message: `Failed to update compose file: ${err.message}` };
    }
};

module.exports.createStack = async (serverId, name, composeContent) => {
    const server = await Server.findByPk(serverId);
    if (!server || server.status !== "active") return { code: 502, message: "Server not available" };

    const existing = await Stack.findOne({ where: { name, serverId } });
    if (existing) return { code: 505, message: "A stack with this name already exists on this server" };

    const session = await sessionManager.getOrCreateSession(server);
    const directory = `/opt/nexployed-apps/${name}`;
    const configFile = "docker-compose.yml";

    try {
        const mkdirResult = await session.exec(`mkdir -p ${escapeShellArg(directory)}`, { stream: false });
        if (mkdirResult.code !== 0) throw new Error(mkdirResult.stderr);

        const escaped = composeContent.replace(/'/g, "'\\''");
        const writeResult = await session.exec(
            `cat > ${escapeShellArg(directory)}/${configFile} << 'NEXPLOY_EOF'\n${escaped}\nNEXPLOY_EOF`,
            { stream: false }
        );
        if (writeResult.code !== 0) throw new Error(writeResult.stderr);

        const stack = await Stack.create({
            serverId,
            name,
            directory,
            configFile,
            status: "stopped",
            services: 0,
        });

        await createTask("UpdateStacks", { serverId });
        logger.info("Stack created", { stackId: stack.id, name });
        return stack;
    } catch (err) {
        logger.error("Stack creation failed", { name, error: err.message });
        return { code: 504, message: `Failed to create stack: ${err.message}` };
    }
};

module.exports.deleteStack = async (id) => {
    const stack = await Stack.findByPk(id);
    if (!stack) return { code: 501, message: "Stack not found" };

    const { session, error } = await getSessionForStack(stack);
    if (error) return error;

    try {
        const composeCmd = `cd ${escapeShellArg(stack.directory)} && docker compose -f ${escapeShellArg(stack.configFile)}`;
        await session.exec(`${composeCmd} down -v 2>/dev/null; true`, { stream: false });

        const docker = require("../utils/dockerApi")(session);
        const filters = encodeURIComponent(JSON.stringify({ label: [`com.docker.compose.project=${stack.name}`] }));
        try {
            const orphans = await docker.getJson(`/containers/json?all=true&filters=${filters}`);
            for (const c of orphans) {
                await docker.post(`/containers/${c.Id}/stop`).catch(() => {});
                await docker.del(`/containers/${c.Id}?force=true`).catch(() => {});
            }
        } catch {}

        await session.exec(`rm -rf ${escapeShellArg(stack.directory)}`, { stream: false });

        await Stack.destroy({ where: { id } });
        logger.info("Stack deleted", { stackId: id, name: stack.name });
        return { message: "Stack deleted successfully" };
    } catch (err) {
        logger.error("Stack deletion failed", { stackId: id, error: err.message });
        return { code: 504, message: `Failed to delete stack: ${err.message}` };
    }
};

module.exports.getStackLogs = async (id, tail = 100, timestamps = false) => {
    const stack = await Stack.findByPk(id);
    if (!stack) return { code: 501, message: "Stack not found" };

    const { session, error } = await getSessionForStack(stack);
    if (error) return error;

    try {
        const tsFlag = timestamps ? " --timestamps" : "";
        const result = await session.exec(
            `cd ${escapeShellArg(stack.directory)} && docker compose -f ${escapeShellArg(stack.configFile)} logs --tail=${parseInt(tail)}${tsFlag} 2>&1`,
            { stream: false }
        );
        return { logs: result.stdout };
    } catch (err) {
        return { code: 504, message: `Failed to get logs: ${err.message}` };
    }
};

const escapeShellArg = (arg) => `'${arg.replace(/'/g, "'\\''")}'`;
