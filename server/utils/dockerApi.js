const DOCKER_SOCKET = "/var/run/docker.sock";
const BASE_URL = "http://localhost";

const dockerApi = (session) => ({
    async get(path) {
        const result = await session.exec(
            `curl -s --unix-socket ${DOCKER_SOCKET} "${BASE_URL}${path}"`,
            { stream: false }
        );
        if (result.code !== 0) throw new Error(`Docker API GET ${path} failed: ${result.stderr}`);
        return result.stdout;
    },

    async post(path) {
        const result = await session.exec(
            `curl -s -X POST --unix-socket ${DOCKER_SOCKET} "${BASE_URL}${path}"`,
            { stream: false }
        );
        if (result.code !== 0) throw new Error(`Docker API POST ${path} failed: ${result.stderr}`);
        return result.stdout;
    },

    async del(path) {
        const result = await session.exec(
            `curl -s -X DELETE --unix-socket ${DOCKER_SOCKET} "${BASE_URL}${path}"`,
            { stream: false }
        );
        if (result.code !== 0) throw new Error(`Docker API DELETE ${path} failed: ${result.stderr}`);
        return result.stdout;
    },

    async getJson(path) {
        const stdout = await this.get(path);
        return JSON.parse(stdout);
    },
});

module.exports = dockerApi;
