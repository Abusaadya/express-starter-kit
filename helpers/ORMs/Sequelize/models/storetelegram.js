"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  class StoreTelegram extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      const { OauthTokens, StoreTelegram } = models;
      StoreTelegram.belongsTo(OauthTokens, { foreignKey: 'oauth_token_id' });
    }
  }
  StoreTelegram.init(
    {
      oauth_token_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      chat_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      label: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "StoreTelegram",
    }
  );
  return StoreTelegram;
};
