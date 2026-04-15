const Sequelize = require("sequelize");
const db = require("../utils/database");

module.exports = db.define("containers", {
    containerId: {
        type: Sequelize.STRING,
        allowNull: false,
    },
    serverId: {
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    name: {
        type: Sequelize.STRING,
        allowNull: false,
    },
    image: {
        type: Sequelize.STRING,
        allowNull: false,
    },
    imageId: {
        type: Sequelize.STRING,
        allowNull: true,
    },
    status: {
        type: Sequelize.STRING,
        allowNull: false,
    },
    state: {
        type: Sequelize.STRING,
        allowNull: true,
    },
    created: {
        type: Sequelize.DATE,
        allowNull: true,
    },
    ports: {
        type: Sequelize.TEXT,
        allowNull: true,
    },
    networks: {
        type: Sequelize.TEXT,
        allowNull: true,
    },
    volumes: {
        type: Sequelize.TEXT,
        allowNull: true,
    },
    command: {
        type: Sequelize.TEXT,
        allowNull: true,
    },
    lastUpdated: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
    },
}, { freezeTableName: true, createdAt: false, updatedAt: false });
