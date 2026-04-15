const { DataTypes } = require("sequelize");

module.exports = {
    async up(queryInterface) {
        const tableNames = await queryInterface.showAllTables();

        if (!tableNames.includes("git_credentials")) {
            await queryInterface.createTable("git_credentials", {
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
                host: {
                    type: DataTypes.STRING,
                    allowNull: false,
                },
                authType: {
                    type: DataTypes.STRING,
                    allowNull: false,
                    defaultValue: "token",
                },
                username: {
                    type: DataTypes.STRING,
                    allowNull: true,
                },
                token: {
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
    },
};
