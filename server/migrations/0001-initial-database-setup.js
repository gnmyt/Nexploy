const { DataTypes } = require("sequelize");
const logger = require('../utils/logger');

module.exports = {
    async up(queryInterface) {
        const tableNames = await queryInterface.showAllTables();

        if (!tableNames.includes("accounts")) {
            await queryInterface.createTable("accounts", {
                id: {
                    type: DataTypes.INTEGER,
                    autoIncrement: true,
                    primaryKey: true,
                    allowNull: false,
                },
                firstName: {
                    type: DataTypes.STRING,
                    allowNull: false,
                },
                lastName: {
                    type: DataTypes.STRING,
                    allowNull: false,
                },
                username: {
                    type: DataTypes.STRING,
                    allowNull: false,
                },
                password: {
                    type: DataTypes.STRING,
                    allowNull: false,
                },
                totpEnabled: {
                    type: DataTypes.BOOLEAN,
                    defaultValue: false,
                },
                role: {
                    type: DataTypes.STRING,
                    defaultValue: "user",
                },
                totpSecret: {
                    type: DataTypes.STRING,
                    allowNull: true,
                },
            });
            logger.info("Created accounts table");
        }


        if (!tableNames.includes("sessions")) {
            await queryInterface.createTable("sessions", {
                id: {
                    type: DataTypes.INTEGER,
                    autoIncrement: true,
                    primaryKey: true,
                    allowNull: false,
                },
                accountId: {
                    type: DataTypes.INTEGER,
                    allowNull: false,
                },
                token: {
                    type: DataTypes.STRING,
                    allowNull: true,
                },
                ip: {
                    type: DataTypes.STRING,
                    allowNull: false,
                },
                userAgent: {
                    type: DataTypes.STRING,
                    allowNull: false,
                },
                lastActivity: {
                    type: DataTypes.DATE,
                    defaultValue: DataTypes.NOW,
                },
            });
            logger.info("Created sessions table");
        }
    },
};
