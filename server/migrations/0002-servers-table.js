const { DataTypes } = require("sequelize");
const logger = require('../utils/logger');

module.exports = {
    async up(queryInterface) {
        const tableNames = await queryInterface.showAllTables();

        if (!tableNames.includes("servers")) {
            await queryInterface.createTable("servers", {
                id: {
                    type: DataTypes.INTEGER,
                    autoIncrement: true,
                    primaryKey: true,
                    allowNull: false,
                },
                name: {
                    type: DataTypes.STRING,
                    allowNull: false,
                },
                location: {
                    type: DataTypes.STRING,
                    allowNull: true,
                },
                type: {
                    type: DataTypes.STRING,
                    allowNull: false,
                    defaultValue: "ssh",
                },
                host: {
                    type: DataTypes.STRING,
                    allowNull: false,
                },
                port: {
                    type: DataTypes.INTEGER,
                    allowNull: false,
                    defaultValue: 22,
                },
                username: {
                    type: DataTypes.STRING,
                    allowNull: false,
                },
                authMethod: {
                    type: DataTypes.STRING,
                    allowNull: false,
                    defaultValue: "password",
                },
                credentials: {
                    type: DataTypes.TEXT,
                    allowNull: false,
                },
                passphrase: {
                    type: DataTypes.TEXT,
                    allowNull: true,
                },
                status: {
                    type: DataTypes.STRING,
                    allowNull: false,
                    defaultValue: "pending",
                },
                provisioningProgress: {
                    type: DataTypes.INTEGER,
                    allowNull: false,
                    defaultValue: 0,
                },
                provisioningMessage: {
                    type: DataTypes.STRING,
                    allowNull: true,
                },
                lastError: {
                    type: DataTypes.TEXT,
                    allowNull: true,
                },
                lastConnected: {
                    type: DataTypes.DATE,
                    allowNull: true,
                },
                createdAt: {
                    type: DataTypes.DATE,
                    defaultValue: DataTypes.NOW,
                },
            });
            logger.info("Created servers table");
        }
    },
};
