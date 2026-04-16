const logger = require("./logger");

class EventBus {
    constructor() {
        this.clients = new Set();
    }

    addClient(stream) {
        this.clients.add(stream);
        logger.info(`EventBus: client connected (${this.clients.size} total)`);
    }

    removeClient(stream) {
        this.clients.delete(stream);
        logger.info(`EventBus: client disconnected (${this.clients.size} total)`);
    }

    async emit(event, data = {}) {
        const msg = { event, data: JSON.stringify(data) };
        const dead = [];
        for (const client of this.clients) {
            try {
                await client.writeSSE(msg);
            } catch (err) {
                logger.error(`EventBus: failed to write to client`, { error: err.message });
                dead.push(client);
            }
        }
        for (const client of dead) {
            this.clients.delete(client);
        }
    }
}

const eventBus = new EventBus();

module.exports = eventBus;
