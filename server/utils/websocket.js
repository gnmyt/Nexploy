const { createBunWebSocket } = require("hono/bun");

const { upgradeWebSocket, websocket } = createBunWebSocket();

module.exports = { upgradeWebSocket, websocket };
