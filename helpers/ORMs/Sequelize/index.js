const { Sequelize, DataTypes } = require("sequelize");

const OauthTokens = require("./models/oauthtokens");
const PasswordResets = require("./models/passwordresets");
const User = require("./models/user");
const StoreTelegram = require("./models/storetelegram");

// We export the sequelize connection instance to be used around our app.
module.exports = {
  connect: async () => {
    // In a real app, you should keep the database connection URL as an environment variable.
    // But for this example, we will just use a local SQLite database.
    // const sequelize = new Sequelize(process.env.DB_CONNECTION_URL);
    const isSqlite = process.env.DATABASE_STORAGE ? true : false;
    const sequelize = isSqlite
      ? new Sequelize({
        dialect: "sqlite",
        storage: process.env.DATABASE_STORAGE,
        logging: true,
      })
      : new Sequelize({
        host: process.env.DATABASE_SERVER || process.env.MYSQLHOST,
        port: process.env.DATABASE_PORT || process.env.MYSQLPORT || 3306,
        username: process.env.DATABASE_USERNAME || process.env.MYSQLUSER,
        password: process.env.DATABASE_PASSWORD || process.env.MYSQLPASSWORD,
        database: process.env.DATABASE_NAME || process.env.MYSQLDATABASE,
        dialect: "mysql",
        logging: true,
        dialectOptions: {
          ssl: {
            rejectUnauthorized: false
          }
        }
      });

    const modelDefiners = [
      OauthTokens,
      PasswordResets,
      User,
      StoreTelegram,
      // Add more models here...
      // require('./models/item'),
    ];

    // We define all models according to their files.
    for (let i = 0; i < modelDefiners.length; i++) {
      modelDefiners[i] = modelDefiners[i](sequelize, DataTypes);
      modelDefiners[i].associate(sequelize.models);
    }

    // We execute any associates  after the models are defined .

    try {
      await sequelize.sync({ alter: true });
    } catch (err) {
      console.log("Error in creating and connecting database", err);
    }
    return sequelize;
  },
};
