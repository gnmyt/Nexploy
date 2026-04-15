const Sequelize = require("sequelize");
const db = require("../utils/database");

module.exports = db.define("stacks", {
    serverId: {
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    name: {
        type: Sequelize.STRING,
        allowNull: false,
    },
    directory: {
        type: Sequelize.STRING,
        allowNull: false,
    },
    configFile: {
        type: Sequelize.STRING,
        allowNull: false,
    },
    status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "unknown",
    },
    services: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    icon: {
        type: Sequelize.TEXT,
        allowNull: true,
    },
    lastUpdated: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
    },
    createdAt: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
    },
}, { freezeTableName: true, createdAt: false, updatedAt: false });
