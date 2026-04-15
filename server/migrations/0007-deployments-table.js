const { DataTypes } = require("sequelize");
const Sequelize = require("sequelize");

module.exports = {
    async up(queryInterface) {
        const tableNames = await queryInterface.showAllTables();

        if (!tableNames.includes("deployments")) {
            await queryInterface.createTable("deployments", {
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
                stackId: {
                    type: DataTypes.INTEGER,
                    allowNull: true,
                },
                name: {
                    type: DataTypes.STRING,
                    allowNull: false,
                },
                repoUrl: {
                    type: DataTypes.STRING,
                    allowNull: false,
                },
                branch: {
                    type: DataTypes.STRING,
                    allowNull: false,
                    defaultValue: "main",
                },
                dockerfilePath: {
                    type: DataTypes.STRING,
                    allowNull: false,
                    defaultValue: "Dockerfile",
                },
                buildContext: {
                    type: DataTypes.STRING,
                    allowNull: false,
                    defaultValue: ".",
                },
                imageName: {
                    type: DataTypes.STRING,
                    allowNull: false,
                },
                composeContent: {
                    type: DataTypes.TEXT,
                    allowNull: true,
                },
                autoBuild: {
                    type: DataTypes.BOOLEAN,
                    allowNull: false,
                    defaultValue: false,
                },
                autoBuildInterval: {
                    type: DataTypes.INTEGER,
                    allowNull: false,
                    defaultValue: 300,
                },
                status: {
                    type: DataTypes.STRING,
                    allowNull: false,
                    defaultValue: "pending",
                },
                lastBuildStatus: {
                    type: DataTypes.STRING,
                    allowNull: true,
                },
                lastBuildLog: {
                    type: DataTypes.TEXT,
                    allowNull: true,
                },
                lastBuildAt: {
                    type: DataTypes.DATE,
                    allowNull: true,
                },
                lastCommitHash: {
                    type: DataTypes.STRING,
                    allowNull: true,
                },
                lastCommitMessage: {
                    type: DataTypes.TEXT,
                    allowNull: true,
                },
                gitCredentialId: {
                    type: Sequelize.INTEGER,
                    allowNull: true,
                },
                port: {
                    type: DataTypes.INTEGER,
                    allowNull: true,
                },
                createdAt: {
                    type: DataTypes.DATE,
                    allowNull: false,
                },
                updatedAt: {
                    type: DataTypes.DATE,
                    allowNull: false,
                },
            });

            await queryInterface.addIndex("deployments", ["serverId"]);
            await queryInterface.addIndex("deployments", ["name", "serverId"], { unique: true });
        }
    },
};
