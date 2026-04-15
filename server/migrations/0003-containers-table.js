const { DataTypes } = require("sequelize");
const logger = require('../utils/logger');

module.exports = {
    async up(queryInterface) {
        const tableNames = await queryInterface.showAllTables();

        if (!tableNames.includes("containers")) {
            await queryInterface.createTable("containers", {
                id: {
                    type: DataTypes.INTEGER,
                    autoIncrement: true,
                    primaryKey: true,
                    allowNull: false,
                },
                containerId: {
                    type: DataTypes.STRING,
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
                image: {
                    type: DataTypes.STRING,
                    allowNull: false,
                },
                imageId: {
                    type: DataTypes.STRING,
                    allowNull: true,
                },
                status: {
                    type: DataTypes.STRING,
                    allowNull: false,
                },
                state: {
                    type: DataTypes.STRING,
                    allowNull: true,
                },
                created: {
                    type: DataTypes.DATE,
                    allowNull: true,
                },
                ports: {
                    type: DataTypes.TEXT,
                    allowNull: true,
                },
                networks: {
                    type: DataTypes.TEXT,
                    allowNull: true,
                },
                volumes: {
                    type: DataTypes.TEXT,
                    allowNull: true,
                },
                command: {
                    type: DataTypes.TEXT,
                    allowNull: true,
                },
                lastUpdated: {
                    type: DataTypes.DATE,
                    defaultValue: DataTypes.NOW,
                },
            });
            logger.info("Created containers table");

            // Add index for faster lookups
            await queryInterface.addIndex("containers", ["serverId"]);
            await queryInterface.addIndex("containers", ["containerId", "serverId"], { unique: true });
        }
    },
};
