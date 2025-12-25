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

    if (isSqlite) {
      console.log(`📡 Connecting to SQLite database at: ${process.env.DATABASE_STORAGE}`);
    } else {
      console.log(`🛢️  Connecting to MySQL database at: ${process.env.DATABASE_SERVER || process.env.MYSQLHOST}:${process.env.DATABASE_PORT || process.env.MYSQLPORT || 3306}`);
    }

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
    ];

    console.log("🛠️ Initializing models...");
    // 1. First, define all models
    for (let i = 0; i < modelDefiners.length; i++) {
      modelDefiners[i] = modelDefiners[i](sequelize, DataTypes);
    }

    console.log("🔗 Setting up associations...");
    // 2. Then, call associate on all models
    Object.keys(sequelize.models).forEach((modelName) => {
      if (sequelize.models[modelName].associate) {
        sequelize.models[modelName].associate(sequelize.models);
      }
    });

    // Debug environment variables in logs (safe keys only)
    console.log("📋 DB Config Check:", {
      server: process.env.DATABASE_SERVER || "N/A",
      mysql_host: process.env.MYSQLHOST || "N/A",
      port: process.env.DATABASE_PORT || process.env.MYSQLPORT || "3306",
      user: process.env.DATABASE_USERNAME || process.env.MYSQLUSER || "N/A",
      db: process.env.DATABASE_NAME || process.env.MYSQLDATABASE || "N/A"
    });

    try {
      console.log("🔄 Syncing database...");
      await sequelize.sync({ alter: true });
      console.log("✅ Database synced successfully.");
    } catch (err) {
      console.log("❌ Error in creating and connecting database", err);
      throw err; // Rethrow to stop server if DB fails
    }
    return sequelize;
  },
};
