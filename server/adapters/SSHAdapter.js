const BaseAdapter = require("./BaseAdapter");
const { Client } = require("ssh2");
const { decrypt } = require("../utils/encryption");
const logger = require("../utils/logger");

class SSHAdapter extends BaseAdapter {
    constructor(server, session) {
        super(server, session);
        this.client = null;
        this.connectionConfig = null;
        this._reconnecting = false;
    }

    static get type() {
        return "ssh";
    }

    _buildConnectionConfig = () => {
        const config = {
            host: this.server.host,
            port: this.server.port,
            username: this.server.username,
            readyTimeout: 30000,
            keepaliveInterval: 10000,
        };

        const credentialsData = JSON.parse(this.server.credentials);
        const decryptedCredentials = decrypt(credentialsData.encrypted, credentialsData.iv, credentialsData.authTag);

        if (this.server.authMethod === "password") {
            config.password = decryptedCredentials;
        } else if (this.server.authMethod === "ssh-key") {
            config.privateKey = decryptedCredentials;

            if (this.server.passphrase) {
                const passphraseData = JSON.parse(this.server.passphrase);
                config.passphrase = decrypt(passphraseData.encrypted, passphraseData.iv, passphraseData.authTag);
            }
        }

        return config;
    };

    _createClient = () => {
        if (this.client) {
            this.client.removeAllListeners();
            try { this.client.end(); } catch {}
        }
        this.client = new Client();
    };

    async connect() {
        if (this.connected) return;

        this.connectionConfig = this._buildConnectionConfig();
        this._createClient();

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error("SSH connection timeout"));
            }, 35000);

            this.client.once("ready", () => {
                clearTimeout(timeout);
                this.connected = true;
                this.log("system", `Connected to ${this.server.host}`);
                logger.info(`SSH connected to ${this.server.host}`, { serverId: this.server.id });
                resolve();
            });

            this.client.once("error", (err) => {
                clearTimeout(timeout);
                this.connected = false;
                this.log("error", `Connection error: ${err.message}`);
                logger.error(`SSH connection error for ${this.server.host}`, { serverId: this.server.id, error: err.message });
                reject(err);
            });

            this.client.on("close", () => {
                const wasConnected = this.connected;
                this.connected = false;
                this.log("system", "Connection closed");
                if (wasConnected && !this._reconnecting) this._autoReconnect();
            });

            this.client.connect(this.connectionConfig);
        });
    }

    _autoReconnect = async () => {
        if (this._reconnecting) return;
        this._reconnecting = true;

        const delays = [1000, 2000, 5000, 10000, 30000];
        for (let attempt = 0; attempt < delays.length; attempt++) {
            this.log("system", `Reconnecting in ${delays[attempt] / 1000}s (attempt ${attempt + 1}/${delays.length})...`);
            await new Promise(r => setTimeout(r, delays[attempt]));

            try {
                await this.connect();
                this.log("system", "Reconnected successfully");
                this._reconnecting = false;
                return;
            } catch (err) {
                this.log("error", `Reconnect attempt ${attempt + 1} failed: ${err.message}`);
            }
        }

        this._reconnecting = false;
        this.log("error", "All reconnect attempts failed");
        logger.error(`SSH reconnect failed for ${this.server.host}`, { serverId: this.server.id });
    };

    async disconnect() {
        this._reconnecting = true;
        if (this.client) {
            this.client.removeAllListeners();
            if (this.connected) {
                return new Promise((resolve) => {
                    this.client.once("close", () => {
                        this.connected = false;
                        this._reconnecting = false;
                        resolve();
                    });
                    this.client.end();
                });
            }
        }
        this.connected = false;
        this._reconnecting = false;
    }

    async exec(command, options = {}) {
        if (!this.connected) {
            if (this._reconnecting) {
                await new Promise(r => setTimeout(r, 5000));
                if (!this.connected) throw new Error("Not connected to server (reconnecting)");
            } else {
                throw new Error("Not connected to server");
            }
        }

        const { stream = true } = options;

        return new Promise((resolve, reject) => {
            let stdout = "";
            let stderr = "";

            this.client.exec(command, (err, channel) => {
                if (err) {
                    this.log("error", `Exec error: ${err.message}`);
                    return reject(err);
                }

                channel.on("data", (data) => {
                    const text = data.toString();
                    stdout += text;
                    if (stream) this.log("stdout", text);
                });

                channel.stderr.on("data", (data) => {
                    const text = data.toString();
                    stderr += text;
                    if (stream) this.log("stderr", text);
                });

                channel.on("close", (code) => resolve({ code: code || 0, stdout, stderr }));
                channel.on("error", (err) => {
                    this.log("error", `Channel error: ${err.message}`);
                    reject(err);
                });
            });
        });
    }

    async ping() {
        try {
            const result = await this.exec("echo pong", { stream: false });
            return result.stdout.trim() === "pong";
        } catch {
            return false;
        }
    }
}

module.exports = SSHAdapter;
