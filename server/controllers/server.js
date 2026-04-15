const Server = require("../models/Server");
const Container = require("../models/Container");
const Stack = require("../models/Stack");
const { encrypt } = require("../utils/encryption");
const { sessionManager } = require("../adapters/SessionManager");
const { createTask } = require("../tasks/taskRunner");
const logger = require("../utils/logger");
const dockerApi = require("../utils/dockerApi");

module.exports.createServer = async (config) => {
    const { name, location, type, host, port, username, authMethod, password, sshKey, passphrase } = config;

    const existingServer = await Server.findOne({ where: { host, port } });
    if (existingServer) return { code: 301, message: "A server with this host and port already exists" };

    const credentials = authMethod === "password" ? password : sshKey;
    const encryptedCredentials = encrypt(credentials);
    const encryptedPassphrase = passphrase ? encrypt(passphrase) : null;

    const server = await Server.create({
        name,
        location: location || null,
        type: type || "ssh",
        host,
        port: port || 22,
        username,
        authMethod: authMethod || "password",
        credentials: JSON.stringify(encryptedCredentials),
        passphrase: encryptedPassphrase ? JSON.stringify(encryptedPassphrase) : null,
        status: "pending",
        provisioningProgress: 0,
    });

    logger.system("Server created", { serverId: server.id, name: server.name, host: server.host });

    const fullServer = await Server.findByPk(server.id);
    provisionServerAsync(fullServer).catch(err => {
        logger.error("Auto-provisioning failed", { serverId: server.id, error: err.message });
    });

    const { credentials: _, passphrase: __, ...serverData } = server.dataValues || server;
    return serverData;
};

module.exports.listServers = async () => {
    return await Server.findAll({
        attributes: { exclude: ["credentials", "passphrase"] },
        order: [["createdAt", "DESC"]],
    });
};

module.exports.getServer = async (id) => {
    const server = await Server.findByPk(id, {
        attributes: { exclude: ["credentials", "passphrase"] },
    });
    if (!server) return { code: 302, message: "Server not found" };
    return server;
};

module.exports.updateServer = async (id, updates) => {
    const server = await Server.findByPk(id);
    if (!server) return { code: 302, message: "Server not found" };

    const { name, location } = updates;
    await Server.update({ name, location }, { where: { id } });
    logger.system("Server updated", { serverId: id, updates: { name, location } });
    return { message: "Server updated successfully" };
};

module.exports.deleteServer = async (id) => {
    const server = await Server.findByPk(id);
    if (!server) return { code: 302, message: "Server not found" };

    await sessionManager.closeSession(id);
    await Container.destroy({ where: { serverId: id } });
    await Stack.destroy({ where: { serverId: id } });
    await Server.destroy({ where: { id } });

    logger.system("Server deleted", { serverId: id, name: server.name });
    return { message: "Server deleted successfully" };
};

const updateServerStatus = async (id, status, progress = null, message = null, error = null) => {
    const updates = { status };
    if (progress !== null) updates.provisioningProgress = progress;
    if (message !== null) updates.provisioningMessage = message;
    if (error !== null) updates.lastError = error;
    if (status === "active") updates.lastConnected = new Date();
    await Server.update(updates, { where: { id } });
};

module.exports.reprovisionServer = async (id) => {
    const server = await Server.findByPk(id);
    if (!server) return { code: 302, message: "Server not found" };
    if (server.status === "provisioning") return { code: 303, message: "Server is already being provisioned" };
    if (server.status === "active") return { code: 304, message: "Server is already provisioned" };
    if (server.status !== "error") return { code: 305, message: "Server can only be re-provisioned if in error state" };

    provisionServerAsync(server).catch(err => {
        logger.error("Re-provisioning failed", { serverId: id, error: err.message });
    });

    return { message: "Re-provisioning started" };
};

const provisionServerAsync = async (server) => {
    const id = server.id;

    try {
        await updateServerStatus(id, "provisioning", 0, "Connecting to server...");
        const session = await sessionManager.getOrCreateSession(server);

        await updateServerStatus(id, "provisioning", 5, "Connected, detecting OS...");

        const curlCheck = await session.exec("which curl", { stream: false });
        if (curlCheck.code !== 0) {
            await updateServerStatus(id, "provisioning", 10, "Installing curl...");

            const installCurl = await session.exec(`
                if command -v apt-get &> /dev/null; then
                    apt-get update && apt-get install -y curl
                elif command -v yum &> /dev/null; then
                    yum install -y curl
                elif command -v dnf &> /dev/null; then
                    dnf install -y curl
                elif command -v apk &> /dev/null; then
                    apk add --no-cache curl
                elif command -v pacman &> /dev/null; then
                    pacman -Sy --noconfirm curl
                elif command -v zypper &> /dev/null; then
                    zypper install -y curl
                else
                    echo "Unknown package manager" && exit 1
                fi
            `);

            if (installCurl.code !== 0) throw new Error(`Failed to install curl: ${installCurl.stderr}`);
            session.addLog("system", "curl installed successfully");
        }

        await updateServerStatus(id, "provisioning", 15, "Checking Docker...");

        const dockerCheck = await session.exec("docker --version", { stream: false });

        if (dockerCheck.code !== 0) {
            await updateServerStatus(id, "provisioning", 20, "Installing Docker...");
            const installResult = await session.exec("curl -fsSL https://get.docker.com | sh");
            if (installResult.code !== 0) throw new Error(`Docker installation failed: ${installResult.stderr}`);

            await updateServerStatus(id, "provisioning", 55, "Docker installed, verifying...");
            const verifyResult = await session.exec("docker --version", { stream: false });
            if (verifyResult.code !== 0) throw new Error("Docker verification failed after installation");
        } else {
            await updateServerStatus(id, "provisioning", 55, "Docker already installed");
            session.addLog("system", "Docker is already installed: " + dockerCheck.stdout.trim());
        }

        await updateServerStatus(id, "provisioning", 60, "Creating app directory...");

        const mkdirResult = await session.exec("mkdir -p /opt/nexployed-apps && chmod 755 /opt/nexployed-apps");
        if (mkdirResult.code !== 0) throw new Error(`Failed to create app directory: ${mkdirResult.stderr}`);

        await updateServerStatus(id, "provisioning", 70, "Verifying Docker socket access...");

        const docker = dockerApi(session);
        try {
            await docker.get("/version");
        } catch {
            session.addLog("system", "Warning: Docker socket not accessible, some features may be limited");
        }

        await updateServerStatus(id, "provisioning", 90, "Finalizing...");

        const finalCheck = await session.exec("docker info --format '{{.ServerVersion}}'", { stream: false });
        if (finalCheck.code !== 0) throw new Error("Final Docker verification failed");

        await updateServerStatus(id, "active", 100, "Provisioning complete");
        session.addLog("system", "Server provisioned successfully");
        logger.system("Server provisioned", { serverId: id, dockerVersion: finalCheck.stdout.trim() });

        await createTask("UpdateContainers", { serverId: id });
        await createTask("UpdateStacks", { serverId: id });
        await createTask("UpdateServerMetrics", { serverId: id });
    } catch (err) {
        logger.error("Provisioning error", { serverId: id, error: err.message });
        await updateServerStatus(id, "error", null, null, err.message);
        await sessionManager.closeSession(id);
    }
};

module.exports.testConnection = async (id) => {
    const server = await Server.findByPk(id);
    if (!server) return { code: 302, message: "Server not found" };

    try {
        const session = await sessionManager.getOrCreateSession(server);
        const result = await session.exec("echo 'Connection successful'", { stream: false });

        if (result.code === 0) {
            await Server.update({ lastConnected: new Date() }, { where: { id } });
            return { success: true, message: "Connection successful" };
        }
        return { code: 305, message: "Connection test failed" };
    } catch (err) {
        return { code: 305, message: `Connection failed: ${err.message}` };
    }
};

module.exports.getServerLogs = async (id, limit = 100) => {
    const session = sessionManager.getSession(id);
    if (!session) return { logs: [], connected: false };
    return { logs: session.getLogs(limit), connected: session.isConnected() };
};

module.exports.executeCommand = async (id, command) => {
    const server = await Server.findByPk(id);
    if (!server) return { code: 302, message: "Server not found" };

    try {
        const session = await sessionManager.getOrCreateSession(server);
        return await session.exec(command);
    } catch (err) {
        return { code: 306, message: `Command execution failed: ${err.message}` };
    }
};
