"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      const { User, OauthTokens } = models;
      OauthTokens.belongsTo(User);
      User.hasMany(OauthTokens);
    }
  }

  User.init(
    {
      salla_id: {
        type: DataTypes.INTEGER,
        unique: true
      },
      username: DataTypes.STRING,
      email: DataTypes.STRING,
      email_verified_at: DataTypes.INTEGER,
      verified_at: DataTypes.INTEGER,
      password: DataTypes.STRING,
      remember_token: DataTypes.STRING,
      stock_threshold: {
        type: DataTypes.INTEGER,
        defaultValue: 5
      },
      telegram_chat_id: DataTypes.STRING,
      alert_email: DataTypes.STRING,
      telegram_link_token: {
        type: DataTypes.STRING,
        unique: true
      },
    },
    {
      sequelize,
      modelName: "User",
    }
  );
  return User;
};
