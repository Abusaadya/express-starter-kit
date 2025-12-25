"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  class OauthTokens extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      const { OauthTokens, StoreTelegram, User } = models;
      OauthTokens.hasMany(StoreTelegram, { foreignKey: 'oauth_token_id' });
      OauthTokens.belongsTo(User, { foreignKey: 'user_id' });
    }
  }
  OauthTokens.init(
    {
      user_id: DataTypes.INTEGER,
      merchant: DataTypes.INTEGER,
      access_token: DataTypes.STRING,
      expires_in: DataTypes.INTEGER,
      refresh_token: DataTypes.STRING,
      store_name: DataTypes.STRING,
      store_avatar: DataTypes.STRING,
      telegram_link_token: {
        type: DataTypes.STRING,
        unique: true
      },
    },
    {
      sequelize,
      modelName: "OauthTokens",
    }
  );
  return OauthTokens;
};
