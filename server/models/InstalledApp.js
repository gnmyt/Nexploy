const Sequelize = require("sequelize");
const db = require("../utils/database");

module.exports = db.define("installed_apps", {
    slug: {
        type: Sequelize.STRING,
        allowNull: false,
    },
    source: {
        type: Sequelize.STRING,
        allowNull: false,
    },
    serverId: {
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    stackId: {
        type: Sequelize.INTEGER,
        allowNull: true,
    },
    version: {
        type: Sequelize.STRING,
        allowNull: false,
    },
    type: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "docker",
    },
    name: {
        type: Sequelize.STRING,
        allowNull: false,
    },
    category: {
        type: Sequelize.STRING,
        allowNull: true,
    },
    updateAvailable: {
        type: Sequelize.STRING,
        allowNull: true,
    },
    parentSlug: {
        type: Sequelize.STRING,
        allowNull: true,
    },
    config: {
        type: Sequelize.TEXT,
        allowNull: true,
    },
    installedAt: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
    },
}, { freezeTableName: true, createdAt: false, updatedAt: false });
