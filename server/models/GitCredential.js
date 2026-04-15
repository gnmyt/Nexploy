const Sequelize = require("sequelize");
const db = require("../utils/database");

module.exports = db.define("git_credentials", {
    name: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
    },
    host: {
        type: Sequelize.STRING,
        allowNull: false,
    },
    authType: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "token",
    },
    username: {
        type: Sequelize.STRING,
        allowNull: true,
    },
    token: {
        type: Sequelize.TEXT,
        allowNull: true,
    },
}, { freezeTableName: true });
