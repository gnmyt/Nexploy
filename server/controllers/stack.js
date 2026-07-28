const Stack = require("../models/Stack");
const Server = require("../models/Server");
const Container = require("../models/Container");
const { createTask } = require("../tasks/taskRunner");
const { sessionManager } = require("../adapters/SessionManager");
const logger = require("../utils/logger");
const eventBus = require("../utils/eventBus");
const dockerApi = require("../utils/dockerApi");
const { getDockerComposeCmd } = require("../utils/dockerCompose");

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

    let envFlag = "";
    try {
        const envCheck = await session.exec(`test -f ${escapeShellArg(stack.directory + '/.env')} && echo yes`, { stream: false });
        if (envCheck.stdout?.trim() === "yes") envFlag = " --env-file .env";
    } catch {}

    const compose = await getDockerComposeCmd(session);
    const composeCmd = `cd ${escapeShellArg(stack.directory)} && ${compose} -f ${escapeShellArg(stack.configFile)}${envFlag}`;
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
            const docker = dockerApi(session);
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
    const directory = `/opt/nexploy/apps/${name}`;
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
        const compose = await getDockerComposeCmd(session);
        const composeCmd = `cd ${escapeShellArg(stack.directory)} && ${compose} -f ${escapeShellArg(stack.configFile)}`;
        await session.exec(`${composeCmd} down -v 2>/dev/null; true`, { stream: false });

        const docker = dockerApi(session);
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
        await eventBus.emit("stacks:updated", { serverId: stack.serverId });
        await eventBus.emit("containers:updated", { serverId: stack.serverId });
        return { message: "Stack deleted successfully" };
    } catch (err) {
        logger.error("Stack deletion failed", { stackId: id, error: err.message });
        return { code: 504, message: `Failed to delete stack: ${err.message}` };
    }
};

module.exports.getStackContainers = async (id) => {
    const stack = await Stack.findByPk(id);
    if (!stack) return { code: 501, message: "Stack not found" };

    const { session, error } = await getSessionForStack(stack);
    if (error) return error;

    const docker = dockerApi(session);
    const filters = encodeURIComponent(JSON.stringify({ label: [`com.docker.compose.project=${stack.name}`] }));

    let dockerContainers;
    try {
        dockerContainers = await docker.getJson(`/containers/json?all=true&filters=${filters}`);
    } catch (err) {
        logger.error(`Failed to fetch Docker containers for stack ${stack.name}: ${err.message}`);
        return [];
    }

    return dockerContainers.map(dc => ({
        containerId: dc.Id.substring(0, 12),
        name: dc.Names?.[0]?.replace(/^\//, "") || "unknown",
        image: dc.Image || "unknown",
        state: dc.State || "unknown",
        status: dc.Status || "",
    }));
};

module.exports.getStackLogs = async (id, tail = 100, timestamps = false) => {
    const stack = await Stack.findByPk(id);
    if (!stack) return { code: 501, message: "Stack not found" };

    const { session, error } = await getSessionForStack(stack);
    if (error) return error;

    try {
        const tsFlag = timestamps ? " --timestamps" : "";
        const compose = await getDockerComposeCmd(session);
        const result = await session.exec(
            `cd ${escapeShellArg(stack.directory)} && ${compose} -f ${escapeShellArg(stack.configFile)} logs --tail=${parseInt(tail)}${tsFlag} 2>&1`,
            { stream: false }
        );
        return { logs: result.stdout };
    } catch (err) {
        return { code: 504, message: `Failed to get logs: ${err.message}` };
    }
};

module.exports.getStackEnv = async (id) => {
    const stack = await Stack.findByPk(id);
    if (!stack) return { code: 501, message: "Stack not found" };

    const { session, error } = await getSessionForStack(stack);
    if (error) return error;

    try {
        const envPath = `${stack.directory}/.env`;
        const result = await session.exec(`cat ${escapeShellArg(envPath)} 2>/dev/null || true`, { stream: false });
        const content = result.stdout || "";

        const variables = [];
        for (const line of content.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#")) continue;
            const eqIndex = trimmed.indexOf("=");
            if (eqIndex === -1) continue;
            variables.push({
                key: trimmed.substring(0, eqIndex),
                value: trimmed.substring(eqIndex + 1),
            });
        }

        return { variables };
    } catch (err) {
        return { code: 504, message: `Failed to read env file: ${err.message}` };
    }
};

module.exports.updateStackEnv = async (id, variables) => {
    const stack = await Stack.findByPk(id);
    if (!stack) return { code: 501, message: "Stack not found" };

    const { session, error } = await getSessionForStack(stack);
    if (error) return error;

    try {
        const envPath = `${stack.directory}/.env`;

        if (!Array.isArray(variables) || variables.length === 0) {
            await session.exec(`rm -f ${escapeShellArg(envPath)}`, { stream: false });
            logger.info("Stack env file removed", { stackId: id, name: stack.name });
            return { message: "Environment variables cleared" };
        }

        const envContent = variables
            .filter(v => v.key && typeof v.key === "string")
            .map(v => `${v.key}=${v.value ?? ""}`)
            .join("\n") + "\n";

        const escaped = envContent.replace(/'/g, "'\\''");
        const result = await session.exec(
            `cat > ${escapeShellArg(envPath)} << 'NEXPLOY_EOF'\n${escaped}\nNEXPLOY_EOF`,
            { stream: false }
        );
        if (result.code !== 0) throw new Error(result.stderr || "Failed to write file");

        logger.info("Stack env file updated", { stackId: id, name: stack.name, count: variables.length });
        return { message: "Environment variables updated" };
    } catch (err) {
        return { code: 504, message: `Failed to update env file: ${err.message}` };
    }
};

const CONFIG_EXTENSIONS = ["json", "yml", "yaml", "toml", "ini", "conf", "cfg", "properties", "xml"];
const SQLITE_EXTENSIONS = ["db", "sqlite", "sqlite3"];
const ALL_DISCOVERABLE_EXTENSIONS = [...CONFIG_EXTENSIONS, ...SQLITE_EXTENSIONS];
const MAX_CONFIG_FILES = 10;
const MAX_CONFIG_SIZE = 1048576; // 1MB
const FIND_TIMEOUT_SECS = 5;
const VOLUME_MAXDEPTH = 3;
const STACK_MAXDEPTH = 5;

const getVolumeMountPaths = async (session, stack) => {
    try {
        const composePath = stack.configFile.startsWith("/")
            ? stack.configFile
            : `${stack.directory}/${stack.configFile}`;

        const compose = await getDockerComposeCmd(session);
        const result = await session.exec(
            `cd ${escapeShellArg(stack.directory)} && ${compose} -f ${escapeShellArg(composePath)} config 2>/dev/null | grep -E '^\\s+source:\\s' | sed 's/^.*source:\\s*//' | sort -u`,
            { stream: false }
        );

        if (result.code !== 0 || !result.stdout) return [];

        return result.stdout
            .split("\n")
            .map(p => p.trim())
            .filter(p => p && p.startsWith("/"))
            .filter(p => !p.includes(".."));
    } catch {
        return [];
    }
};

const getStackAllowedPaths = async (session, stack) => {
    const paths = [stack.directory];
    const volumePaths = await getVolumeMountPaths(session, stack);
    for (const vp of volumePaths) {
        if (!vp.startsWith(stack.directory + "/") && vp !== stack.directory) {
            paths.push(vp);
        }
    }
    return paths;
};

const isPathAllowed = (allowedPaths, filePath) => {
    return allowedPaths.some(base => filePath.startsWith(base + "/") || filePath === base);
};

module.exports.getStackConfigFiles = async (id) => {
    const stack = await Stack.findByPk(id);
    if (!stack) return { code: 501, message: "Stack not found" };

    const { session, error } = await getSessionForStack(stack);
    if (error) return error;

    try {
        const allowedPaths = await getStackAllowedPaths(session, stack);
        const extPattern = ALL_DISCOVERABLE_EXTENSIONS.map(e => `-name "*.${e}"`).join(" -o ");
        const IGNORED_NAMES = ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml", ".nexploy.json"];
        const ignorePattern = IGNORED_NAMES.map(n => `! -name ${escapeShellArg(n)}`).join(" ");
        const prunePattern = `\\( -name node_modules -o -name .git -o -name vendor -o -name __pycache__ -o -name .cache -o -name dist -o -name build -o -name .npm -o -name .yarn \\) -prune -o`;

        const findCmds = allowedPaths.map(p => {
            const depth = p === stack.directory ? STACK_MAXDEPTH : VOLUME_MAXDEPTH;
            return `timeout ${FIND_TIMEOUT_SECS}s find ${escapeShellArg(p)} -maxdepth ${depth} ${prunePattern} -type f \\( ${extPattern} \\) ${ignorePattern} -print 2>/dev/null`;
        });
        const cmd = `{ ${findCmds.join(" ; ")} ; } | head -n ${MAX_CONFIG_FILES}`;

        const result = await session.exec(cmd, { stream: false });
        if (result.code !== 0 && !result.stdout) return { files: [] };

        const files = (result.stdout || "")
            .split("\n")
            .map(f => f.trim())
            .filter(Boolean)
            .map(fullPath => {
                const ext = fullPath.split(".").pop()?.toLowerCase();
                const relativeName = fullPath.startsWith(stack.directory + "/")
                    ? fullPath.replace(stack.directory + "/", "")
                    : fullPath;
                return {
                    path: fullPath,
                    name: relativeName,
                    type: SQLITE_EXTENSIONS.includes(ext) ? "sqlite" : "config",
                };
            });

        return { files };
    } catch (err) {
        return { code: 504, message: `Failed to discover config files: ${err.message}` };
    }
};

module.exports.getStackConfigFile = async (id, filePath) => {
    const stack = await Stack.findByPk(id);
    if (!stack) return { code: 501, message: "Stack not found" };

    const ext = filePath.split(".").pop()?.toLowerCase();
    if (!CONFIG_EXTENSIONS.includes(ext)) {
        return { code: 503, message: "File type not allowed" };
    }

    const { session, error } = await getSessionForStack(stack);
    if (error) return error;

    const allowedPaths = await getStackAllowedPaths(session, stack);
    if (!isPathAllowed(allowedPaths, filePath)) {
        return { code: 503, message: "Access denied: file is outside stack directory and volumes" };
    }

    try {
        const sizeResult = await session.exec(`stat -c%s ${escapeShellArg(filePath)} 2>/dev/null`, { stream: false });
        const size = parseInt(sizeResult.stdout?.trim(), 10);
        if (size > MAX_CONFIG_SIZE) return { code: 503, message: "File too large (max 1MB)" };

        const result = await session.exec(`cat ${escapeShellArg(filePath)}`, { stream: false });
        if (result.code !== 0) throw new Error(result.stderr || "Failed to read file");

        return { content: result.stdout };
    } catch (err) {
        return { code: 504, message: `Failed to read config file: ${err.message}` };
    }
};

module.exports.updateStackConfigFile = async (id, filePath, content) => {
    const stack = await Stack.findByPk(id);
    if (!stack) return { code: 501, message: "Stack not found" };

    const ext = filePath.split(".").pop()?.toLowerCase();
    if (!CONFIG_EXTENSIONS.includes(ext)) {
        return { code: 503, message: "File type not allowed" };
    }

    const { session, error } = await getSessionForStack(stack);
    if (error) return error;

    const allowedPaths = await getStackAllowedPaths(session, stack);
    if (!isPathAllowed(allowedPaths, filePath)) {
        return { code: 503, message: "Access denied: file is outside stack directory and volumes" };
    }

    try {
        const escaped = content.replace(/'/g, "'\\''");
        const result = await session.exec(
            `cat > ${escapeShellArg(filePath)} << 'NEXPLOY_EOF'\n${escaped}\nNEXPLOY_EOF`,
            { stream: false }
        );
        if (result.code !== 0) throw new Error(result.stderr || "Failed to write file");

        logger.info("Stack config file updated", { stackId: id, name: stack.name, file: filePath });
        return { message: "Config file updated successfully" };
    } catch (err) {
        return { code: 504, message: `Failed to update config file: ${err.message}` };
    }
};

const validateSqlitePath = (allowedPaths, filePath) => {
    if (!isPathAllowed(allowedPaths, filePath)) {
        return { code: 503, message: "Access denied: file is outside stack directory and volumes" };
    }
    const ext = filePath.split(".").pop()?.toLowerCase();
    if (!SQLITE_EXTENSIONS.includes(ext)) {
        return { code: 503, message: "Not a SQLite file" };
    }
    return null;
};

module.exports.getSqliteTables = async (id, filePath) => {
    const stack = await Stack.findByPk(id);
    if (!stack) return { code: 501, message: "Stack not found" };

    const { session, error } = await getSessionForStack(stack);
    if (error) return error;

    const allowedPaths = await getStackAllowedPaths(session, stack);
    const pathError = validateSqlitePath(allowedPaths, filePath);
    if (pathError) return pathError;

    try {
        const result = await session.exec(
            `sqlite3 ${escapeShellArg(filePath)} ".tables"`,
            { stream: false }
        );
        if (result.code !== 0) throw new Error(result.stderr || "Failed to list tables");

        const tables = (result.stdout || "")
            .split(/\s+/)
            .map(t => t.trim())
            .filter(Boolean);

        return { tables };
    } catch (err) {
        return { code: 504, message: `Failed to list tables: ${err.message}` };
    }
};

module.exports.getSqliteTableData = async (id, filePath, table, page = 1, pageSize = 50) => {
    const stack = await Stack.findByPk(id);
    if (!stack) return { code: 501, message: "Stack not found" };

    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
        return { code: 503, message: "Invalid table name" };
    }

    const { session, error } = await getSessionForStack(stack);
    if (error) return error;

    const allowedPaths = await getStackAllowedPaths(session, stack);
    const pathError = validateSqlitePath(allowedPaths, filePath);
    if (pathError) return pathError;

    try {
        const offset = (page - 1) * pageSize;

        const countResult = await session.exec(
            `sqlite3 ${escapeShellArg(filePath)} "SELECT COUNT(*) FROM \\"${table}\\";"`,
            { stream: false }
        );
        if (countResult.code !== 0) throw new Error(countResult.stderr || "Failed to count rows");
        const total = parseInt(countResult.stdout?.trim(), 10) || 0;

        const columnsResult = await session.exec(
            `sqlite3 -json ${escapeShellArg(filePath)} "PRAGMA table_info(\\"${table}\\");"`,
            { stream: false }
        );
        if (columnsResult.code !== 0) throw new Error(columnsResult.stderr || "Failed to get columns");
        const columns = JSON.parse(columnsResult.stdout || "[]").map(c => ({
            name: c.name,
            type: c.type,
            notnull: c.notnull === 1,
            pk: c.pk === 1,
        }));

        const dataResult = await session.exec(
            `sqlite3 -json ${escapeShellArg(filePath)} "SELECT * FROM \\"${table}\\" LIMIT ${parseInt(pageSize)} OFFSET ${parseInt(offset)};"`,
            { stream: false }
        );
        if (dataResult.code !== 0) throw new Error(dataResult.stderr || "Failed to query data");
        const rows = JSON.parse(dataResult.stdout || "[]");

        return { columns, rows, total, page, pageSize };
    } catch (err) {
        return { code: 504, message: `Failed to query table: ${err.message}` };
    }
};

module.exports.executeSqliteQuery = async (id, filePath, query) => {
    const stack = await Stack.findByPk(id);
    if (!stack) return { code: 501, message: "Stack not found" };

    const { session, error } = await getSessionForStack(stack);
    if (error) return error;

    const allowedPaths = await getStackAllowedPaths(session, stack);
    const pathError = validateSqlitePath(allowedPaths, filePath);
    if (pathError) return pathError;

    try {
        const escaped = query.replace(/'/g, "'\\''");
        const result = await session.exec(
            `sqlite3 -json ${escapeShellArg(filePath)} '${escaped}'`,
            { stream: false }
        );

        if (result.code !== 0) {
            return { code: 504, message: result.stderr?.trim() || "Query failed" };
        }

        let rows = [];
        let columns = [];
        const output = result.stdout?.trim();

        if (output && output.startsWith("[")) {
            rows = JSON.parse(output);
            if (rows.length > 0) {
                columns = Object.keys(rows[0]).map(name => ({ name, type: "" }));
            }
        }

        return { columns, rows, message: rows.length === 0 ? "Query executed successfully" : null };
    } catch (err) {
        return { code: 504, message: `Query execution failed: ${err.message}` };
    }
};

const escapeShellArg = (arg) => `'${arg.replace(/'/g, "'\\''")}'`;
