const { DataTypes } = require("sequelize");

module.exports = {
    async up(queryInterface) {
        const tableNames = await queryInterface.showAllTables();

        if (!tableNames.includes("projects")) {
            await queryInterface.createTable("projects", {
                id: {
                    type: DataTypes.INTEGER,
                    autoIncrement: true,
                    primaryKey: true,
                    allowNull: false,
                },
                name: {
                    type: DataTypes.STRING,
                    allowNull: false,
                    unique: true,
                },
                description: {
                    type: DataTypes.TEXT,
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
        }

        if (!tableNames.includes("project_members")) {
            await queryInterface.createTable("project_members", {
                id: {
                    type: DataTypes.INTEGER,
                    autoIncrement: true,
                    primaryKey: true,
                    allowNull: false,
                },
                projectId: {
                    type: DataTypes.INTEGER,
                    allowNull: false,
                    references: {
                        model: "projects",
                        key: "id",
                    },
                    onDelete: "CASCADE",
                },
                accountId: {
                    type: DataTypes.INTEGER,
                    allowNull: false,
                    references: {
                        model: "accounts",
                        key: "id",
                    },
                    onDelete: "CASCADE",
                },
                permission: {
                    type: DataTypes.STRING,
                    allowNull: false,
                    defaultValue: "view",
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

            await queryInterface.addIndex("project_members", ["projectId", "accountId"], {
                unique: true,
                name: "project_members_unique",
            });
        }

        if (!tableNames.includes("project_resources")) {
            await queryInterface.createTable("project_resources", {
                id: {
                    type: DataTypes.INTEGER,
                    autoIncrement: true,
                    primaryKey: true,
                    allowNull: false,
                },
                projectId: {
                    type: DataTypes.INTEGER,
                    allowNull: false,
                    references: {
                        model: "projects",
                        key: "id",
                    },
                    onDelete: "CASCADE",
                },
                resourceType: {
                    type: DataTypes.STRING,
                    allowNull: false,
                },
                resourceId: {
                    type: DataTypes.INTEGER,
                    allowNull: false,
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

            await queryInterface.addIndex("project_resources", ["projectId", "resourceType", "resourceId"], {
                unique: true,
                name: "project_resources_unique",
            });
            await queryInterface.addIndex("project_resources", ["resourceType", "resourceId"], {
                name: "project_resources_lookup",
            });
        }
    },
};
