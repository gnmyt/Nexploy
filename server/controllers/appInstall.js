const InstalledApp = require("../models/InstalledApp");
const Stack = require("../models/Stack");
const Server = require("../models/Server");
const { sessionManager } = require("../adapters/SessionManager");
const { createTask } = require("../tasks/taskRunner");
const { getApp } = require("./source");
const logger = require("../utils/logger");
const { getDockerComposeCmd } = require("../utils/dockerCompose");
const fs = require("fs");
const path = require("path");
const yaml = require("yaml");

const SOURCES_DIR = path.join(process.cwd(), "data", "sources");
const resolveRunnerPath = () => {
    const candidates = [
        path.join(process.cwd(), "bin", "runner"),
        path.join(process.cwd(), "runner", "target", "release", "runner"),
    ];
    return candidates.find(p => fs.existsSync(p)) || candidates[0];
};
const escapeShellArg = (arg) => `'${arg.replace(/'/g, "'\\''")}'`;

const getSessionForServer = async (serverId) => {
    const server = await Server.findByPk(serverId);
    if (!server || server.status !== "active") return { error: { code: 502, message: "Server not available" } };
    const session = await sessionManager.getOrCreateSession(server);
    return { session, server };
};

const writeNexployMeta = async (session, directory, meta) => {
    const json = JSON.stringify(meta, null, 2);
    const escaped = json.replace(/'/g, "'\\''");
    await session.exec(
        `cat > ${escapeShellArg(directory)}/.nexploy.json << 'NEXPLOY_EOF'\n${escaped}\nNEXPLOY_EOF`,
        { stream: false }
    );
};

const uploadLogoPng = async (session, directory, sourceName, slug) => {
    const firstLetter = slug.charAt(0).toLowerCase();
    const logoPath = path.join(SOURCES_DIR, sourceName, firstLetter, slug, "logo.png");
    if (!fs.existsSync(logoPath)) return;

    const logoBuffer = fs.readFileSync(logoPath);
    const base64 = logoBuffer.toString("base64");
    await session.exec(
        `echo '${base64}' | base64 -d > ${escapeShellArg(directory)}/logo.png`,
        { stream: false }
    );
};

const ensureRunner = async (session) => {
    const check = await session.exec("test -f /opt/nexploy/runner && echo yes", { stream: false });
    if (check.stdout?.trim() === "yes") return;

    const runnerPath = resolveRunnerPath();
    if (!fs.existsSync(runnerPath)) {
        logger.warn("runner binary not found (checked bin/runner and runner/target/release/runner)");
        return;
    }

    await session.exec("mkdir -p /opt/nexploy", { stream: false });

    const binary = fs.readFileSync(runnerPath);
    const chunkSize = 65536;
    const totalChunks = Math.ceil(binary.length / chunkSize);

    await session.exec("cat /dev/null > /opt/nexploy/runner", { stream: false });
    for (let i = 0; i < totalChunks; i++) {
        const chunk = binary.subarray(i * chunkSize, (i + 1) * chunkSize);
        const b64 = chunk.toString("base64");
        await session.exec(`echo '${b64}' | base64 -d >> /opt/nexploy/runner`, { stream: false });
    }
    await session.exec("chmod +x /opt/nexploy/runner", { stream: false });
    logger.info("runner binary uploaded to server");
};

const executeHook = async (session, directory, sourceName, slug, hookName, appData, configValues = {}) => {
    if (!appData.hooks || !appData.hooks[hookName]) return null;

    const hookFile = appData.hooks[hookName];
    const firstLetter = slug.charAt(0).toLowerCase();
    const hookPath = path.join(SOURCES_DIR, sourceName, firstLetter, slug, "hooks", hookFile);

    if (!fs.existsSync(hookPath)) {
        logger.warn(`Hook file not found: ${hookPath}`);
        return null;
    }

    await ensureRunner(session);

    const scriptContent = fs.readFileSync(hookPath, "utf-8");
    const scriptB64 = Buffer.from(scriptContent).toString("base64");

    const context = {
        appName: appData.name,
        appVersion: appData.version,
        slug,
        source: sourceName,
        directory,
        hook: hookName,
        config: configValues,
    };
    const contextB64 = Buffer.from(JSON.stringify(context)).toString("base64");

    try {
        const result = await session.exec(
            `/opt/nexploy/runner --script ${escapeShellArg(scriptB64)} --context ${escapeShellArg(contextB64)} --path ${escapeShellArg(directory)}`,
            { stream: false }
        );

        if (result.code !== 0) {
            logger.warn(`Hook ${hookName} for ${slug} exited with code ${result.code}`, { stderr: result.stderr, stdout: result.stdout });
        } else {
            logger.info(`Hook ${hookName} executed for ${slug}`, { stdout: result.stdout?.substring(0, 500) });
        }

        return { code: result.code, stdout: result.stdout, stderr: result.stderr };
    } catch (err) {
        logger.error(`Hook ${hookName} failed for ${slug}`, { error: err.message });
        return { code: -1, error: err.message };
    }
};

const applyPortMappings = (composeContent, mainService, portMappings) => {
    if (!portMappings || !Array.isArray(portMappings) || portMappings.length === 0) return composeContent;

    const doc = yaml.parseDocument(composeContent);
    const services = doc.get("services");
    if (!services) return composeContent;

    const service = services.get(mainService);
    if (!service) return composeContent;

    const portsNode = service.get("ports");
    if (!portsNode) return composeContent;

    const newPorts = portMappings.map(pm => `${pm.host}:${pm.container}`);
    service.set("ports", newPorts);

    return doc.toString();
};

const parsePortsFromCompose = (composeContent, mainService) => {
    try {
        const doc = yaml.parse(composeContent);
        const service = doc?.services?.[mainService];
        if (!service?.ports) return [];

        return service.ports.map(p => {
            const str = String(p);
            const match = str.match(/^(?:(\d+):)?(\d+)(?:\/(\w+))?$/);
            if (!match) return null;
            return {
                host: match[1] ? parseInt(match[1]) : parseInt(match[2]),
                container: parseInt(match[2]),
                protocol: match[3] || "tcp",
            };
        }).filter(Boolean);
    } catch {
        return [];
    }
};

const installDockerApp = async (serverId, sourceName, slug, appData, parentSlug = null, userInputs = {}, portMappings = null) => {
    const { session, server, error } = await getSessionForServer(serverId);
    if (error) return error;

    const existing = await InstalledApp.findOne({
        where: { slug, source: sourceName, serverId },
    });
    if (existing) return { code: 505, message: `${appData.name} is already installed on this server` };

    const firstLetter = slug.charAt(0).toLowerCase();
    const composePath = path.join(SOURCES_DIR, sourceName, firstLetter, slug, "docker-compose.yml");
    if (!fs.existsSync(composePath)) {
        return { code: 504, message: `No docker-compose.yml found for ${slug}` };
    }
    let composeContent = fs.readFileSync(composePath, "utf-8");

    if (portMappings && appData.mainService) {
        composeContent = applyPortMappings(composeContent, appData.mainService, portMappings);
    }

    const stackName = `nexploy-${slug}`;
    const directory = `/opt/nexploy/apps/${stackName}`;
    const configFile = "docker-compose.yml";

    const existingStack = await Stack.findOne({ where: { name: stackName, serverId } });
    if (existingStack) {
        return { code: 505, message: `A stack named "${stackName}" already exists on this server` };
    }

    try {
        const mkdirResult = await session.exec(`mkdir -p ${escapeShellArg(directory)}`, { stream: false });
        if (mkdirResult.code !== 0) throw new Error(mkdirResult.stderr);

        const escaped = composeContent.replace(/'/g, "'\\''");
        const writeResult = await session.exec(
            `cat > ${escapeShellArg(directory)}/${configFile} << 'NEXPLOY_EOF'\n${escaped}\nNEXPLOY_EOF`,
            { stream: false }
        );
        if (writeResult.code !== 0) throw new Error(writeResult.stderr);

        await uploadLogoPng(session, directory, sourceName, slug);

        await writeNexployMeta(session, directory, {
            slug,
            source: sourceName,
            version: appData.version,
            name: appData.name,
            installedAt: new Date().toISOString(),
            managedBy: "nexploy",
        });

        const stack = await Stack.create({
            serverId,
            name: stackName,
            directory,
            configFile,
            status: "stopped",
            services: 0,
        });

        const compose = await getDockerComposeCmd(session);
        const startResult = await session.exec(
            `cd ${escapeShellArg(directory)} && ${compose} -f ${configFile} up -d --remove-orphans`,
            { stream: false }
        );
        if (startResult.code !== 0) {
            logger.warn(`Stack started with warnings for ${slug}`, { stderr: startResult.stderr });
        }

        const installedApp = await InstalledApp.create({
            slug,
            source: sourceName,
            serverId,
            stackId: stack.id,
            version: appData.version,
            type: "docker",
            name: appData.name,
            category: appData.category || null,
            parentSlug,
            config: Object.keys(userInputs).length > 0 ? JSON.stringify(userInputs) : null,
        });

        await executeHook(session, directory, sourceName, slug, "postInstall", appData, userInputs);

        const restartResult = await session.exec(
            `cd ${escapeShellArg(directory)} && ${compose} -f ${configFile} up -d --remove-orphans`,
            { stream: false }
        );
        if (restartResult.code !== 0) {
            logger.warn(`Post-hook restart had warnings for ${slug}`, { stderr: restartResult.stderr });
        }

        await createTask("UpdateStacks", { serverId });

        logger.info(`App installed: ${appData.name}`, {
            slug,
            source: sourceName,
            serverId,
            version: appData.version,
        });

        return {
            message: `${appData.name} installed successfully`,
            installedApp,
            stackId: stack.id,
        };
    } catch (err) {
        logger.error(`App installation failed: ${slug}`, { error: err.message });
        return { code: 504, message: `Installation failed: ${err.message}` };
    }
};

const installBundleApp = async (serverId, sourceName, slug, appData) => {
    if (!appData.applications || !Array.isArray(appData.applications)) {
        return { code: 504, message: "Bundle has no applications defined" };
    }

    const results = [];
    const errors = [];

    for (const ref of appData.applications) {
        const [refSource, refSlug] = ref.includes("/")
            ? ref.split("/")
            : [sourceName, ref];

        const childApp = await getApp(refSource, refSlug);
        if (!childApp) {
            errors.push({ slug: refSlug, error: `App not found in source "${refSource}"` });
            continue;
        }

        if (childApp.type === "docker") {
            const result = await installDockerApp(serverId, refSource, refSlug, childApp, slug);
            if (result.code) {
                errors.push({ slug: refSlug, error: result.message });
            } else {
                results.push(result);
            }
        }
    }

    return {
        message: `Bundle "${appData.name}" installation completed`,
        installed: results.length,
        failed: errors.length,
        results,
        errors: errors.length > 0 ? errors : undefined,
    };
};

module.exports.installApp = async (sourceName, slug, serverId, userInputs = {}, portMappings = null) => {
    const appData = await getApp(sourceName, slug);
    if (!appData) return { code: 404, message: "App not found" };

    if (appData.type === "docker") {
        return installDockerApp(serverId, sourceName, slug, appData, null, userInputs, portMappings);
    } else if (appData.type === "bundle") {
        return installBundleApp(serverId, sourceName, slug, appData);
    }

    return { code: 504, message: `Unsupported app type: ${appData.type}` };
};

module.exports.updateApp = async (installedAppId) => {
    const installed = await InstalledApp.findByPk(installedAppId);
    if (!installed) return { code: 404, message: "Installed app not found" };
    if (!installed.updateAvailable) return { code: 400, message: "No update available" };

    const appData = await getApp(installed.source, installed.slug);
    if (!appData) return { code: 404, message: "App no longer available in source" };

    if (installed.type !== "docker") {
        return { code: 504, message: "Only docker type apps can be updated directly" };
    }

    const { session, error } = await getSessionForServer(installed.serverId);
    if (error) return error;

    const stack = installed.stackId ? await Stack.findByPk(installed.stackId) : null;
    if (!stack) return { code: 504, message: "Associated stack not found" };

    const firstLetter = installed.slug.charAt(0).toLowerCase();
    const composePath = path.join(SOURCES_DIR, installed.source, firstLetter, installed.slug, "docker-compose.yml");
    if (!fs.existsSync(composePath)) {
        return { code: 504, message: "Updated docker-compose.yml not found" };
    }
    const composeContent = fs.readFileSync(composePath, "utf-8");

    try {
        const filePath = stack.configFile.startsWith("/")
            ? stack.configFile
            : `${stack.directory}/${stack.configFile}`;
        const escaped = composeContent.replace(/'/g, "'\\''");
        const writeResult = await session.exec(
            `cat > ${escapeShellArg(filePath)} << 'NEXPLOY_EOF'\n${escaped}\nNEXPLOY_EOF`,
            { stream: false }
        );
        if (writeResult.code !== 0) throw new Error(writeResult.stderr);

        await uploadLogoPng(session, stack.directory, installed.source, installed.slug);

        await writeNexployMeta(session, stack.directory, {
            slug: installed.slug,
            source: installed.source,
            version: appData.version,
            name: appData.name,
            installedAt: installed.installedAt,
            updatedAt: new Date().toISOString(),
            managedBy: "nexploy",
        });

        const compose = await getDockerComposeCmd(session);
        const pullResult = await session.exec(
            `cd ${escapeShellArg(stack.directory)} && ${compose} -f ${escapeShellArg(stack.configFile)} pull`,
            { stream: false }
        );
        if (pullResult.code !== 0) {
            logger.warn(`Pull had issues for ${installed.slug}`, { stderr: pullResult.stderr });
        }

        const upResult = await session.exec(
            `cd ${escapeShellArg(stack.directory)} && ${compose} -f ${escapeShellArg(stack.configFile)} up -d --remove-orphans`,
            { stream: false }
        );
        if (upResult.code !== 0) {
            logger.warn(`Restart had issues for ${installed.slug}`, { stderr: upResult.stderr });
        }

        await InstalledApp.update(
            { version: appData.version, updateAvailable: null },
            { where: { id: installedAppId } }
        );

        await executeHook(session, stack.directory, installed.source, installed.slug, "postUpdate", appData,
            installed.config ? JSON.parse(installed.config) : {});

        await createTask("UpdateStacks", { serverId: installed.serverId });

        logger.info(`App updated: ${installed.name}`, {
            slug: installed.slug,
            oldVersion: installed.version,
            newVersion: appData.version,
        });

        return { message: `${installed.name} updated to v${appData.version}` };
    } catch (err) {
        logger.error(`App update failed: ${installed.slug}`, { error: err.message });
        return { code: 504, message: `Update failed: ${err.message}` };
    }
};

module.exports.uninstallApp = async (installedAppId) => {
    const installed = await InstalledApp.findByPk(installedAppId);
    if (!installed) return { code: 404, message: "Installed app not found" };

    if (installed.stackId) {
        const stack = await Stack.findByPk(installed.stackId);
        if (stack) {
            const { session, error } = await getSessionForServer(installed.serverId);
            if (!error) {
                try {
                    const compose = await getDockerComposeCmd(session);
                    const composeCmd = `cd ${escapeShellArg(stack.directory)} && ${compose} -f ${escapeShellArg(stack.configFile)}`;
                    await session.exec(`${composeCmd} down -v 2>/dev/null; true`, { stream: false });
                    await session.exec(`rm -rf ${escapeShellArg(stack.directory)}`, { stream: false });
                } catch (err) {
                    logger.warn(`Cleanup failed for ${installed.slug}`, { error: err.message });
                }
            }
            await Stack.destroy({ where: { id: stack.id } });
        }
    }

    const name = installed.name;
    await InstalledApp.destroy({ where: { id: installedAppId } });

    logger.info(`App uninstalled: ${name}`);
    return { message: `${name} uninstalled successfully` };
};

module.exports.listInstalledApps = async () => {
    const apps = await InstalledApp.findAll({ order: [["name", "ASC"]] });

    const grouped = {};
    for (const app of apps) {
        const key = `${app.source}/${app.slug}`;
        if (!grouped[key]) {
            grouped[key] = {
                slug: app.slug,
                source: app.source,
                name: app.name,
                type: app.type,
                category: app.category,
                hasLogo: true,
                instances: [],
                updateAvailable: null,
            };
        }
        grouped[key].instances.push({
            id: app.id,
            serverId: app.serverId,
            stackId: app.stackId,
            version: app.version,
            updateAvailable: app.updateAvailable,
            installedAt: app.installedAt,
        });
        if (app.updateAvailable) {
            grouped[key].updateAvailable = app.updateAvailable;
        }
    }

    return Object.values(grouped);
};

module.exports.getInstalledApp = async (id) => {
    const app = await InstalledApp.findByPk(id);
    if (!app) return { code: 404, message: "Installed app not found" };
    return app;
};

module.exports.getInstalledAppDetails = async (id) => {
    const installed = await InstalledApp.findByPk(id);
    if (!installed) return { code: 404, message: "Installed app not found" };

    const appData = await getApp(installed.source, installed.slug);

    const stack = installed.stackId ? await Stack.findByPk(installed.stackId) : null;

    const configValues = installed.config ? JSON.parse(installed.config) : {};

    const firstLetter = installed.slug.charAt(0).toLowerCase();
    const composePath = path.join(SOURCES_DIR, installed.source, firstLetter, installed.slug, "docker-compose.yml");
    let ports = [];
    if (fs.existsSync(composePath) && appData?.mainService) {
        const composeContent = fs.readFileSync(composePath, "utf-8");
        ports = parsePortsFromCompose(composeContent, appData.mainService);
    }

    return {
        id: installed.id,
        slug: installed.slug,
        source: installed.source,
        serverId: installed.serverId,
        stackId: installed.stackId,
        version: installed.version,
        name: installed.name,
        type: installed.type,
        category: installed.category,
        updateAvailable: installed.updateAvailable,
        installedAt: installed.installedAt,
        hasLogo: true,
        config: configValues,
        inputs: appData?.inputs || [],
        hooks: appData?.hooks || {},
        ports,
        mainService: appData?.mainService || null,
        description: appData?.description || null,
        stack: stack ? { id: stack.id, name: stack.name, status: stack.status, services: stack.services } : null,
    };
};

module.exports.updateInstalledAppConfig = async (id, newConfig) => {
    const installed = await InstalledApp.findByPk(id);
    if (!installed) return { code: 404, message: "Installed app not found" };

    const appData = await getApp(installed.source, installed.slug);

    await InstalledApp.update(
        { config: JSON.stringify(newConfig) },
        { where: { id } }
    );

    if (appData?.hooks?.onConfigure && installed.stackId) {
        const stack = await Stack.findByPk(installed.stackId);
        if (stack) {
            const { session, error } = await getSessionForServer(installed.serverId);
            if (!error) {
                await executeHook(session, stack.directory, installed.source, installed.slug, "onConfigure", appData, newConfig);

                const compose = await getDockerComposeCmd(session);
                await session.exec(
                    `cd ${escapeShellArg(stack.directory)} && ${compose} -f ${escapeShellArg(stack.configFile)} up -d --remove-orphans`,
                    { stream: false }
                );
                await createTask("UpdateStacks", { serverId: installed.serverId });
            }
        }
    }

    logger.info(`App config updated: ${installed.name}`, { id });
    return { message: "Configuration updated successfully" };
};

module.exports.executeInstalledAppHook = async (id, hookName) => {
    const installed = await InstalledApp.findByPk(id);
    if (!installed) return { code: 404, message: "Installed app not found" };

    const appData = await getApp(installed.source, installed.slug);
    if (!appData) return { code: 404, message: "App no longer available in source" };

    if (!appData.hooks || !appData.hooks[hookName]) {
        return { code: 400, message: `Hook "${hookName}" not defined for this app` };
    }

    const stack = installed.stackId ? await Stack.findByPk(installed.stackId) : null;
    if (!stack) return { code: 504, message: "Associated stack not found" };

    const { session, error } = await getSessionForServer(installed.serverId);
    if (error) return error;

    const configValues = installed.config ? JSON.parse(installed.config) : {};
    const result = await executeHook(session, stack.directory, installed.source, installed.slug, hookName, appData, configValues);

    if (!result) return { code: 504, message: "Hook execution failed" };

    return {
        message: `Hook "${hookName}" executed`,
        exitCode: result.code,
        stdout: result.stdout,
        stderr: result.stderr,
    };
};

module.exports.getAppPortAnalysis = async (sourceName, slug) => {
    const appData = await getApp(sourceName, slug);
    if (!appData) return { code: 404, message: "App not found" };
    if (appData.type !== "docker") return { ports: [] };

    const firstLetter = slug.charAt(0).toLowerCase();
    const composePath = path.join(SOURCES_DIR, sourceName, firstLetter, slug, "docker-compose.yml");
    if (!fs.existsSync(composePath)) return { ports: [] };

    const composeContent = fs.readFileSync(composePath, "utf-8");
    const ports = parsePortsFromCompose(composeContent, appData.mainService);

    return { ports, mainService: appData.mainService };
};
