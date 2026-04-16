const { DataTypes } = require("sequelize");

module.exports = {
    async up(queryInterface) {
        const tableInfo = await queryInterface.describeTable("installed_apps");

        if (!tableInfo.config) {
            await queryInterface.addColumn("installed_apps", "config", {
                type: DataTypes.TEXT,
                allowNull: true,
            });
        }
    },
};
