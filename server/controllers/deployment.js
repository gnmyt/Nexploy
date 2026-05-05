const Deployment = require("../models/Deployment");
const Server = require("../models/Server");
const Stack = require("../models/Stack");
const { sessionManager } = require("../adapters/SessionManager");
const { createTask } = require("../tasks/taskRunner");
const { resolveGitUrl } = require("./gitCredential");
const logger = require("../utils/logger");
const { getDockerComposeCmd } = require("../utils/dockerCompose");

const escapeShellArg = (arg) => `'${arg.replace(/'/g, "'\\''")}'`;

const generateCompose = (name, imageName, port) => {
    let compose = `services:\n  ${name}:\n    image: ${imageName}:latest\n    restart: unless-stopped\n`;
    if (port) {
        compose += `    ports:\n      - "${port}:${port}"\n`;
    }
    return compose;
};

module.exports.listDeployments = async (serverId = null) => {
    const where = {};
    if (serverId) where.serverId = serverId;
    return await Deployment.findAll({ where, order: [["createdAt", "DESC"]] });
};

module.exports.getDeployment = async (id) => {
    const deployment = await Deployment.findByPk(id);
    if (!deployment) return { code: 601, message: "Deployment not found" };
    return deployment;
};

const getSessionForDeployment = async (deployment) => {
    const server = await Server.findByPk(deployment.serverId);
    if (!server || server.status !== "active") return { error: { code: 602, message: "Server not available" } };
    const session = await sessionManager.getOrCreateSession(server);
    return { session, server };
};

module.exports.createDeployment = async (data) => {
    const { serverId, name, repoUrl, branch, dockerfilePath, buildContext, composeContent, autoBuild, autoBuildInterval, port } = data;

    const server = await Server.findByPk(serverId);
    if (!server || server.status !== "active") return { code: 602, message: "Server not available" };

    const existing = await Deployment.findOne({ where: { name, serverId } });
    if (existing) return { code: 605, message: "A deployment with this name already exists on this server" };

    const imageName = `nexploy-deploy-${name}`.toLowerCase().replace(/[^a-z0-9_-]/g, "-");

    const defaultCompose = composeContent || generateCompose(name, imageName, port);

    const deployment = await Deployment.create({
        serverId,
        name,
        repoUrl,
        branch: branch || "main",
        dockerfilePath: dockerfilePath || "Dockerfile",
        buildContext: buildContext || ".",
        imageName,
        composeContent: defaultCompose,
        autoBuild: autoBuild || false,
        autoBuildInterval: autoBuildInterval || 300,
        port: port || null,
        status: "pending",
    });

    logger.info("Deployment created", { deploymentId: deployment.id, name });
    return deployment;
};

module.exports.updateDeployment = async (id, data) => {
    const deployment = await Deployment.findByPk(id);
    if (!deployment) return { code: 601, message: "Deployment not found" };

    const allowed = ["branch", "dockerfilePath", "buildContext", "composeContent", "autoBuild", "autoBuildInterval", "gitCredentialId", "port"];
    const updates = {};
    for (const key of allowed) {
        if (data[key] !== undefined) updates[key] = data[key];
    }

    if (data.port !== undefined && data.composeContent === undefined) {
        updates.composeContent = generateCompose(deployment.name, deployment.imageName, data.port);
    }

    await Deployment.update(updates, { where: { id } });
    logger.info("Deployment updated", { deploymentId: id, name: deployment.name });
    return await Deployment.findByPk(id);
};

module.exports.deleteDeployment = async (id) => {
    const deployment = await Deployment.findByPk(id);
    if (!deployment) return { code: 601, message: "Deployment not found" };

    const { session } = await getSessionForDeployment(deployment);

    if (session) {
        const repoDir = `/opt/nexployed-deployments/${deployment.name}`;
        await session.exec(`rm -rf ${escapeShellArg(repoDir)}`, { stream: false }).catch(() => {});

        try {
            await session.exec(`docker rmi ${escapeShellArg(deployment.imageName + ":latest")} 2>/dev/null; true`, { stream: false });
        } catch {}
    }

    if (deployment.stackId) {
        const stack = await Stack.findByPk(deployment.stackId);
        if (stack && session) {
            const compose = await getDockerComposeCmd(session);
            const composeCmd = `cd ${escapeShellArg(stack.directory)} && ${compose} -f ${escapeShellArg(stack.configFile)}`;
            await session.exec(`${composeCmd} down -v 2>/dev/null; true`, { stream: false }).catch(() => {});
            await session.exec(`rm -rf ${escapeShellArg(stack.directory)}`, { stream: false }).catch(() => {});
            await Stack.destroy({ where: { id: deployment.stackId } });
        }
    }

    await Deployment.destroy({ where: { id } });
    logger.info("Deployment deleted", { deploymentId: id, name: deployment.name });
    return { message: "Deployment deleted successfully" };
};

module.exports.buildDeployment = async (id) => {
    const deployment = await Deployment.findByPk(id);
    if (!deployment) return { code: 601, message: "Deployment not found" };

    if (deployment.status === "building") return { code: 606, message: "Build already in progress" };

    const { session, error } = await getSessionForDeployment(deployment);
    if (error) return error;

    await Deployment.update(
        { status: "building", lastBuildStatus: "building", lastBuildLog: "" },
        { where: { id } }
    );
    deployment.status = "building";

    buildAsync(deployment, session).catch((err) => {
        logger.error("Build failed unexpectedly", { deploymentId: id, error: err.message });
    });

    return { message: "Build started", deploymentId: deployment.id };
};

async function buildAsync(deployment, session) {
    const repoDir = `/opt/nexployed-deployments/${deployment.name}`;
    let buildLog = "";

    const appendLog = (msg) => { buildLog += msg + "\n"; };

    try {
        appendLog(`[nexploy] Checking repository at ${repoDir}...`);
        const authUrl = await resolveGitUrl(deployment.repoUrl, deployment.gitCredentialId);
        const dirCheck = await session.exec(`test -d ${escapeShellArg(repoDir + "/.git")} && echo yes || echo no`, { stream: false });

        if (dirCheck.stdout?.trim() === "yes") {
            appendLog(`[nexploy] Fetching latest changes...`);
            const fetchResult = await session.exec(
                `cd ${escapeShellArg(repoDir)} && git remote set-url origin ${escapeShellArg(authUrl)} && git fetch origin && git checkout ${escapeShellArg(deployment.branch)} && git reset --hard origin/${escapeShellArg(deployment.branch)}`,
                { stream: false }
            );
            if (fetchResult.code !== 0) throw new Error(fetchResult.stderr || "Git fetch failed");
            appendLog(fetchResult.stdout || "");
        } else {
            appendLog(`[nexploy] Cloning repository...`);
            await session.exec(`mkdir -p ${escapeShellArg(repoDir)}`, { stream: false });
            const cloneResult = await session.exec(
                `git clone --branch ${escapeShellArg(deployment.branch)} --single-branch ${escapeShellArg(authUrl)} ${escapeShellArg(repoDir)}`,
                { stream: false }
            );
            if (cloneResult.code !== 0) throw new Error(cloneResult.stderr || "Git clone failed");
            appendLog(cloneResult.stdout || "");
        }

        const commitResult = await session.exec(
            `cd ${escapeShellArg(repoDir)} && git log -1 --format='%H|||%s'`,
            { stream: false }
        );
        let lastCommitHash = null;
        let lastCommitMessage = null;
        if (commitResult.stdout) {
            const parts = commitResult.stdout.trim().split("|||");
            lastCommitHash = parts[0] || null;
            lastCommitMessage = parts[1] || null;
        }

        const dockerfilePath = deployment.dockerfilePath.startsWith("/")
            ? deployment.dockerfilePath
            : `${repoDir}/${deployment.dockerfilePath}`;
        const buildContextPath = deployment.buildContext === "."
            ? repoDir
            : `${repoDir}/${deployment.buildContext}`;

        appendLog(`[nexploy] Building Docker image ${deployment.imageName}:latest...`);
        const buildResult = await session.exec(
            `cd ${escapeShellArg(repoDir)} && docker build -t ${escapeShellArg(deployment.imageName + ":latest")} -f ${escapeShellArg(dockerfilePath)} ${escapeShellArg(buildContextPath)}`,
            { stream: false, timeout: 600000 }
        );
        appendLog(buildResult.stdout || "");
        if (buildResult.stderr) appendLog(buildResult.stderr);

        if (buildResult.code !== 0) throw new Error("Docker build failed");

        appendLog(`[nexploy] Build completed successfully.`);

        if (deployment.composeContent) {
            await deployStack(deployment, session, appendLog);
        }

        await Deployment.update({
            status: "deployed",
            lastBuildStatus: "success",
            lastBuildLog: buildLog,
            lastBuildAt: new Date(),
            lastCommitHash,
            lastCommitMessage,
            stackId: deployment.stackId,
        }, { where: { id: deployment.id } });

        logger.info("Build completed", { deploymentId: deployment.id, name: deployment.name });
    } catch (err) {
        appendLog(`[nexploy] ERROR: ${err.message}`);
        await Deployment.update({
            status: "failed",
            lastBuildStatus: "failed",
            lastBuildLog: buildLog,
            lastBuildAt: new Date(),
        }, { where: { id: deployment.id } });

        logger.error("Build failed", { deploymentId: deployment.id, error: err.message });
    }
}

async function deployStack(deployment, session, appendLog) {
    const stackName = `deploy-${deployment.name}`;
    const directory = `/opt/nexploy/apps/${stackName}`;
    const configFile = "docker-compose.yml";

    appendLog(`[nexploy] Deploying stack ${stackName}...`);

    await session.exec(`mkdir -p ${escapeShellArg(directory)}`, { stream: false });

    const escaped = deployment.composeContent.replace(/'/g, "'\\''");
    const writeResult = await session.exec(
        `cat > ${escapeShellArg(directory)}/${configFile} << 'NEXPLOY_EOF'\n${escaped}\nNEXPLOY_EOF`,
        { stream: false }
    );
    if (writeResult.code !== 0) throw new Error("Failed to write compose file");

    let stack = deployment.stackId ? await Stack.findByPk(deployment.stackId) : null;
    if (!stack) {
        stack = await Stack.findOne({ where: { name: stackName, serverId: deployment.serverId } });
    }

    if (!stack) {
        stack = await Stack.create({
            serverId: deployment.serverId,
            name: stackName,
            directory,
            configFile,
            status: "stopped",
            services: 0,
        });
    }

    deployment.stackId = stack.id;

    const compose = await getDockerComposeCmd(session);
    const composeResult = await session.exec(
        `cd ${escapeShellArg(directory)} && ${compose} -f ${configFile} up -d --remove-orphans`,
        { stream: false }
    );
    appendLog(composeResult.stdout || "");
    if (composeResult.stderr) appendLog(composeResult.stderr);

    if (composeResult.code !== 0) throw new Error("Docker compose up failed");

    appendLog(`[nexploy] Stack deployed successfully.`);
    await createTask("UpdateStacks", { serverId: deployment.serverId });
}

module.exports.getBuildLog = async (id) => {
    const deployment = await Deployment.findByPk(id);
    if (!deployment) return { code: 601, message: "Deployment not found" };
    return { log: deployment.lastBuildLog || "" };
};

module.exports.checkForUpdates = async (id) => {
    const deployment = await Deployment.findByPk(id);
    if (!deployment) return { code: 601, message: "Deployment not found" };

    const { session, error } = await getSessionForDeployment(deployment);
    if (error) return error;

    const repoDir = `/opt/nexployed-deployments/${deployment.name}`;
    const dirCheck = await session.exec(`test -d ${escapeShellArg(repoDir + "/.git")} && echo yes || echo no`, { stream: false });

    if (dirCheck.stdout?.trim() !== "yes") {
        return { hasUpdates: true, message: "Repository not yet cloned" };
    }

    const fetchResult = await session.exec(
        `cd ${escapeShellArg(repoDir)} && git fetch origin ${escapeShellArg(deployment.branch)} 2>&1`,
        { stream: false }
    );

    const localHash = await session.exec(
        `cd ${escapeShellArg(repoDir)} && git rev-parse HEAD`,
        { stream: false }
    );
    const remoteHash = await session.exec(
        `cd ${escapeShellArg(repoDir)} && git rev-parse origin/${escapeShellArg(deployment.branch)}`,
        { stream: false }
    );

    const local = localHash.stdout?.trim();
    const remote = remoteHash.stdout?.trim();

    return {
        hasUpdates: local !== remote,
        localCommit: local,
        remoteCommit: remote,
    };
};
