const Sequelize = require("sequelize");
const db = require("../utils/database");

module.exports = db.define("servers", {
    name: {
        type: Sequelize.STRING,
        allowNull: false,
    },
    location: {
        type: Sequelize.STRING,
        allowNull: true,
    },
    type: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "ssh",
    },
    host: {
        type: Sequelize.STRING,
        allowNull: false,
    },
    port: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 22,
    },
    username: {
        type: Sequelize.STRING,
        allowNull: false,
    },
    authMethod: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "password",
    },
    credentials: {
        type: Sequelize.TEXT,
        allowNull: false,
    },
    passphrase: {
        type: Sequelize.TEXT,
        allowNull: true,
    },
    status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "pending",
    },
    provisioningProgress: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    provisioningMessage: {
        type: Sequelize.STRING,
        allowNull: true,
    },
    lastError: {
        type: Sequelize.TEXT,
        allowNull: true,
    },
    lastConnected: {
        type: Sequelize.DATE,
        allowNull: true,
    },
    cpuUsage: {
        type: Sequelize.FLOAT,
        allowNull: true,
    },
    cpuCores: {
        type: Sequelize.INTEGER,
        allowNull: true,
    },
    memoryUsed: {
        type: Sequelize.BIGINT,
        allowNull: true,
    },
    memoryTotal: {
        type: Sequelize.BIGINT,
        allowNull: true,
    },
    diskUsed: {
        type: Sequelize.BIGINT,
        allowNull: true,
    },
    diskTotal: {
        type: Sequelize.BIGINT,
        allowNull: true,
    },
    osInfo: {
        type: Sequelize.STRING,
        allowNull: true,
    },
    uptime: {
        type: Sequelize.BIGINT,
        allowNull: true,
    },
    metricsUpdatedAt: {
        type: Sequelize.DATE,
        allowNull: true,
    },
    createdAt: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
    },
}, { freezeTableName: true, createdAt: false, updatedAt: false });
