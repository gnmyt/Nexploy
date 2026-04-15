const Server = require("../../models/Server");
const { sessionManager } = require("../../adapters/SessionManager");
const logger = require("../../utils/logger");

const METRICS_COMMAND = `
echo "---CPU---"
top -bn1 | grep '%Cpu' | head -1 | awk '{print $2 + $4}'
echo "---CORES---"
nproc 2>/dev/null || grep -c ^processor /proc/cpuinfo 2>/dev/null || echo "0"
echo "---MEMORY---"
free -b | awk '/^Mem:/{print $3, $2}'
echo "---DISK---"
df -B1 / | awk 'NR==2{print $3, $2}'
echo "---OS---"
cat /etc/os-release 2>/dev/null | grep ^PRETTY_NAME | cut -d'"' -f2 || uname -s
echo "---UPTIME---"
awk '{print int($1)}' /proc/uptime 2>/dev/null || echo "0"
echo "---END---"
`.trim();

const parseSectionLine = (sections, key) => {
    const line = sections[key]?.[0];
    return line ? line.split(/\s+/) : [undefined, undefined];
};

const parseMetrics = (stdout) => {
    const sections = {};
    let currentSection = null;

    for (const line of stdout.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("---") && trimmed.endsWith("---")) {
            currentSection = trimmed.replaceAll("---", "");
            if (currentSection === "END") break;
            sections[currentSection] = [];
        } else if (currentSection && trimmed) {
            sections[currentSection].push(trimmed);
        }
    }

    const [memUsedStr, memTotalStr] = parseSectionLine(sections, "MEMORY");
    const [diskUsedStr, diskTotalStr] = parseSectionLine(sections, "DISK");

    return {
        cpuUsage: sections.CPU?.[0] ? parseFloat(sections.CPU[0]) : null,
        cpuCores: sections.CORES?.[0] ? parseInt(sections.CORES[0], 10) : null,
        memoryUsed: memUsedStr ? parseInt(memUsedStr, 10) : null,
        memoryTotal: memTotalStr ? parseInt(memTotalStr, 10) : null,
        diskUsed: diskUsedStr ? parseInt(diskUsedStr, 10) : null,
        diskTotal: diskTotalStr ? parseInt(diskTotalStr, 10) : null,
        osInfo: sections.OS?.[0] || null,
        uptime: sections.UPTIME?.[0] ? parseInt(sections.UPTIME[0], 10) : null,
    };
};

const updateServerMetricsHandler = async (data) => {
    const { serverId } = data || {};

    let servers;
    if (serverId) {
        const server = await Server.findByPk(serverId);
        if (!server || server.status !== "active") return { success: false, message: "Server not found or not active" };
        servers = [server];
    } else {
        servers = await Server.findAll({ where: { status: "active" } });
    }

    const results = { serversProcessed: 0, errors: [] };

    for (const server of servers) {
        try {
            const session = await sessionManager.getOrCreateSession(server);
            const result = await session.exec(METRICS_COMMAND, { stream: false });

            if (result.code !== 0) {
                throw new Error(`Command failed: ${result.stderr}`);
            }

            const metrics = parseMetrics(result.stdout);

            await Server.update({
                ...metrics,
                metricsUpdatedAt: new Date(),
            }, { where: { id: server.id } });

            results.serversProcessed++;
        } catch (err) {
            logger.error(`Failed to update metrics for server ${server.id}`, { error: err.message });
            results.errors.push({ serverId: server.id, error: err.message });
        }
    }

    logger.info("UpdateServerMetrics task completed", results);
    return results;
};

module.exports = updateServerMetricsHandler;
