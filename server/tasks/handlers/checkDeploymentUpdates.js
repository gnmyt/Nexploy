const Deployment = require("../../models/Deployment");
const Server = require("../../models/Server");
const { sessionManager } = require("../../adapters/SessionManager");
const { buildDeployment } = require("../../controllers/deployment");
const { resolveGitUrl } = require("../../controllers/gitCredential");
const logger = require("../../utils/logger");

const escapeShellArg = (arg) => `'${arg.replace(/'/g, "'\\''")}'`;

module.exports = async () => {
    const deployments = await Deployment.findAll({
        where: { autoBuild: true },
    });

    for (const deployment of deployments) {
        if (deployment.status === "building") continue;

        try {
            const server = await Server.findByPk(deployment.serverId);
            if (!server || server.status !== "active") continue;

            const session = await sessionManager.getOrCreateSession(server);
            const repoDir = `/opt/nexployed-deployments/${deployment.name}`;

            const dirCheck = await session.exec(
                `test -d ${escapeShellArg(repoDir + "/.git")} && echo yes || echo no`,
                { stream: false }
            );

            if (dirCheck.stdout?.trim() !== "yes") {
                await buildDeployment(deployment.id);
                continue;
            }

            const authUrl = await resolveGitUrl(deployment.repoUrl, deployment.gitCredentialId);
            await session.exec(
                `cd ${escapeShellArg(repoDir)} && git remote set-url origin ${escapeShellArg(authUrl)} && git fetch origin ${escapeShellArg(deployment.branch)} 2>&1`,
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

            if (local !== remote) {
                logger.info(`Auto-build triggered for deployment ${deployment.name}`, {
                    deploymentId: deployment.id,
                    localCommit: local,
                    remoteCommit: remote,
                });
                await buildDeployment(deployment.id);
            }
        } catch (err) {
            logger.error(`Auto-build check failed for deployment ${deployment.name}`, {
                deploymentId: deployment.id,
                error: err.message,
            });
        }
    }
};
