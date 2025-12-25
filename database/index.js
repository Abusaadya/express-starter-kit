///

class SallaDatabase {
  constructor(DATABASE_ORM) {
    this.Database = require("../helpers/ORMs/" + DATABASE_ORM);
    this.DATABASE_ORM = DATABASE_ORM;
  }
  async connect() {
    if (this.connection) return this.connection;
    if (this.connectionPromise) return this.connectionPromise;

    this.connectionPromise = (async () => {
      try {
        this.connection = await this.Database.connect();
        return this.connection;
      } catch (err) {
        console.log("Error connecting to database: ", err);
        this.connectionPromise = null;
        return null;
      }
    })();

    return this.connectionPromise;
  }
  async retrieveUser(data, includeRelatedData) {
    await this.connect();
    if (this.DATABASE_ORM == "TypeORM") {
      var userRepository = this.connection.getRepository("User");
      userRepository
    }
    if (this.DATABASE_ORM == "Sequelize") {
      return await this.connection.models.User.findOne({
        where: { ...data },
        include: includeRelatedData ? [this.connection.models.OauthTokens] : [],
      })
    }
    if (this.DATABASE_ORM == "Mongoose") {
      return includeRelatedData ?
        await this.connection.Mongoose.models.User.findOne(data).populate({
          path: 'oauthId',
          select: 'access_token'
        }) :
        await this.connection.Mongoose.models.User.findOne(data)

    }

  }
  async saveUser(data) {
    await this.connect();
    if (this.DATABASE_ORM == "TypeORM") {
      var userRepository = this.connection.getRepository("User");
      userRepository
        .save(data)
        .then(function (savedUser) {
          console.log("User has been saved: ", savedUser);
          console.log("Now lets load all users: ");

          return userRepository.find();
        })
        .then(function (users) {
          console.log("All users: ", users);
        });
    }
    if (this.DATABASE_ORM == "Sequelize") {
      let user = await this.connection.models.User.findOne({
        where: { email: data.email },
      });

      const { id: incomingId, ...userData } = data;
      // Map incoming Salla ID to our new salla_id field if present
      if (incomingId) userData.salla_id = incomingId;

      if (!user) {
        console.log(`[DB Debug] Creating new user for: ${data.email}`);
        user = await this.connection.models.User.create(userData);
      } else {
        console.log(`[DB Debug] Found existing user: ${user.id} for: ${data.email}`);
        // Optionally update existing user with salla_id if it's missing
        if (incomingId && !user.salla_id) {
          await user.update({ salla_id: incomingId });
        }
      }
      console.log(`[DB Debug] saveUser returning internal ID: ${user.id}`);
      return user.id;
    }
    if (this.DATABASE_ORM == "Mongoose") {
      let userObj
      try {
        userObj = await this.connection.Mongoose.models.User.findOneAndUpdate(
          { email: data.email },
          data,
          { upsert: true, new: true }
        )
        console.log("user has been created")
        return userObj._id;
      } catch (err) {

      }
    }
  }
  async saveOauth({ user_id, ...data }) {
    await this.connect();
    if (this.DATABASE_ORM == "Sequelize") {
      const user = await this.connection.models.User.findOne({
        where: { id: user_id },
      });

      if (user) {
        // Find existing token for this user and merchant or create a new one
        const [token, created] = await this.connection.models.OauthTokens.findOrCreate({
          where: { user_id, merchant: data.merchant },
          defaults: {
            ...data,
            user_id,
            store_name: data.store_name,
            store_avatar: data.store_avatar
          }
        });

        if (!created) {
          // If it exists, update it with new tokens and expiry
          await token.update({
            ...data,
            store_name: data.store_name,
            store_avatar: data.store_avatar
          });
        }
        return token;
      }
    }
    if (this.DATABASE_ORM == "Mongoose") {
      try {
        return this.connection.Mongoose.models.oAuthToken.findOneAndUpdate(
          { user: user_id },
          { user: user_id, ...data },
          { upsert: true, new: true }
        ).then(async results => {
          await this.connection.Mongoose.models.User.findOneAndUpdate(
            { _id: user_id },
            {
              $set: {
                oauthId: results._id
              }
            },
            { new: true }
          )
          return results
        });
      } catch (err) {
      }
    }
  }

  async addTelegramToStore(oauthTokenId, chatId, label) {
    await this.connect();
    if (this.DATABASE_ORM == "Sequelize") {
      return await this.connection.models.StoreTelegram.create({
        oauth_token_id: oauthTokenId,
        chat_id: chatId,
        label: label
      });
    }
  }

  async removeTelegramFromStore(oauthTokenId, chatId) {
    await this.connect();
    if (this.DATABASE_ORM == "Sequelize") {
      return await this.connection.models.StoreTelegram.destroy({
        where: { oauth_token_id: oauthTokenId, chat_id: chatId }
      });
    }
  }

  async getTelegramsForStore(oauthTokenId) {
    await this.connect();
    if (this.DATABASE_ORM == "Sequelize") {
      return await this.connection.models.StoreTelegram.findAll({
        where: { oauth_token_id: oauthTokenId }
      });
    }
  }
}
module.exports = (DATABASE_ORM) => new SallaDatabase(DATABASE_ORM);
