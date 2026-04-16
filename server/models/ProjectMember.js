const Sequelize = require("sequelize");
const db = require("../utils/database");

module.exports = db.define("project_members", {
    projectId: {
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    accountId: {
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    permission: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "view",
    },
}, {
    freezeTableName: true,
});
