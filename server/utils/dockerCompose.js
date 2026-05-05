const composeCache = new Map();

const getDockerComposeCmd = async (session) => {
    const key = session.serverId;
    if (composeCache.has(key)) return composeCache.get(key);

    const result = await session.exec("command -v docker-compose 2>/dev/null", { stream: false });
    const cmd = result.code === 0 && result.stdout?.trim() ? "docker-compose" : "docker compose";
    composeCache.set(key, cmd);
    return cmd;
};

module.exports = { getDockerComposeCmd };
