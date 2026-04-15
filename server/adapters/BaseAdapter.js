class BaseAdapter {
    constructor(server, session) {
        this.server = server;
        this.session = session;
        this.connected = false;
    }

    static get type() {
        throw new Error("Adapter must implement static type getter");
    }

    async connect() {
        throw new Error("Adapter must implement connect()");
    }

    async disconnect() {
        throw new Error("Adapter must implement disconnect()");
    }

    async exec(command, options = {}) {
        throw new Error("Adapter must implement exec()");
    }

    async ping() {
        throw new Error("Adapter must implement ping()");
    }

    log = (type, message) => {
        if (this.session) this.session.addLog(type, message);
    };
}

module.exports = BaseAdapter;
