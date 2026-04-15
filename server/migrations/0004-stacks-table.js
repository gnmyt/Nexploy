const { DataTypes } = require("sequelize");
const logger = require('../utils/logger');

module.exports = {
    async up(queryInterface) {
        const tableNames = await queryInterface.showAllTables();

        if (!tableNames.includes("stacks")) {
            await queryInterface.createTable("stacks", {
                id: {
                    type: DataTypes.INTEGER,
                    autoIncrement: true,
                    primaryKey: true,
                    allowNull: false,
                },
                serverId: {
                    type: DataTypes.INTEGER,
                    allowNull: false,
                },
                name: {
                    type: DataTypes.STRING,
                    allowNull: false,
                },
                directory: {
                    type: DataTypes.STRING,
                    allowNull: false,
                },
                configFile: {
                    type: DataTypes.STRING,
                    allowNull: false,
                },
                status: {
                    type: DataTypes.STRING,
                    allowNull: false,
                    defaultValue: "unknown",
                },
                services: {
                    type: DataTypes.INTEGER,
                    allowNull: false,
                    defaultValue: 0,
                },
                icon: {
                    type: DataTypes.TEXT,
                    allowNull: true,
                },
                lastUpdated: {
                    type: DataTypes.DATE,
                    defaultValue: DataTypes.NOW,
                },
                createdAt: {
                    type: DataTypes.DATE,
                    defaultValue: DataTypes.NOW,
                },
            });

            await queryInterface.addIndex("stacks", ["serverId"]);
            await queryInterface.addIndex("stacks", ["name", "serverId"], { unique: true });

            logger.info("Created stacks table");
        }
    },
};
