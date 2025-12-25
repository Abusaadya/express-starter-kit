// Import Deps
require("dotenv").config();
const express = require("express");
const session = require("express-session");
const passport = require("passport");
const consolidate = require("consolidate");
const getUnixTimestamp = require("./helpers/getUnixTimestamp");
const bodyParser = require("body-parser");
const port = process.env.PORT || 8081;

/*
  Create a .env file in the root directory of your project. 
  Add environment-specific variables on new lines in the form of NAME=VALUE. For example:
  SALLA_OAUTH_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  SALLA_OAUTH_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  ...
*/
const {
  SALLA_OAUTH_CLIENT_ID,
  SALLA_OAUTH_CLIENT_SECRET,
  SALLA_OAUTH_CLIENT_REDIRECT_URI,
  SALLA_WEBHOOK_SECRET,
  SALLA_DATABASE_ORM,
} = process.env;

// Import Salla APIs
const SallaAPIFactory = require("@salla.sa/passport-strategy");
const SallaDatabase = require("./database")(SALLA_DATABASE_ORM || "Sequelize");
const SallaWebhook = require("@salla.sa/webhooks-actions");

SallaWebhook.setSecret(SALLA_WEBHOOK_SECRET);

// Add Listeners
SallaWebhook.on("app.installed", (eventBody, userArgs) => {
  // handel app.installed event
});
SallaWebhook.on("app.store.authorize", (eventBody, userArgs) => {
  // handel app.installed event
});
SallaWebhook.on("all", (eventBody, userArgs) => {
  // handel all events even thats not authorized
});

// we initialize our Salla API
const SallaAPI = new SallaAPIFactory({
  clientID: SALLA_OAUTH_CLIENT_ID,
  clientSecret: SALLA_OAUTH_CLIENT_SECRET,
  callbackURL: SALLA_OAUTH_CLIENT_REDIRECT_URI,
});

// set Listener on auth success
SallaAPI.onAuth(async (accessToken, refreshToken, expires_in, data) => {
  try {
    await SallaDatabase.connect();
    let user_id = await SallaDatabase.saveUser({
      username: data.name,
      email: data.email,
      email_verified_at: getUnixTimestamp(),
      verified_at: getUnixTimestamp(),
      password: "",
      remember_token: "",
    });
    await SallaDatabase.saveOauth(
      {
        merchant: data.merchant.id,
        access_token: accessToken,
        expires_in: expires_in,
        refresh_token: refreshToken,
        user_id,
        store_name: data.merchant.name,
        store_avatar: data.merchant.avatar
      },
    );
  } catch (err) {
    console.log("Error connecting to database: ", err);
  }
});

/**
 * Professional helper to ensure we always have a valid access token.
 * It checks the database, validates expiry, and refreshes if necessary.
 */
async function getValidAccessToken(userEmail, merchantId = null) {
  try {
    await SallaDatabase.connect();
    const user = await SallaDatabase.retrieveUser({ email: userEmail }, true);

    if (!user || !user.OauthTokens || user.OauthTokens.length === 0) {
      throw new Error("No tokens found for user in database");
    }

    // Find the specific token for the merchant or default to the first one
    let oauthData = user.OauthTokens[0];
    if (merchantId) {
      const specificToken = user.OauthTokens.find(t => t.merchant == merchantId);
      if (specificToken) {
        oauthData = specificToken;
      }
    }

    const { access_token, refresh_token, expires_in, updatedAt } = oauthData;

    // Calculate if the token is expired (giving 5 mins buffer)
    const buffer = 5 * 60; // 5 minutes
    const expiryTime = new Date(updatedAt).getTime() / 1000 + expires_in - buffer;
    const currentTime = getUnixTimestamp();

    if (currentTime < expiryTime) {
      return access_token;
    }

    console.log(`Access Token for merchant ${oauthData.merchant} expired, requesting refresh...`);
    // Token is expired, refresh it using the Salla SDK
    const newToken = await SallaAPI.requestNewAccessToken(refresh_token);

    // Save new token back to database for future use
    await SallaDatabase.saveOauth({
      user_id: user.id,
      merchant: oauthData.merchant,
      access_token: newToken.access_token,
      refresh_token: newToken.refresh_token,
      expires_in: newToken.expires_in,
    });

    return newToken.access_token;
  } catch (error) {
    console.error("Error in getValidAccessToken:", error);
    throw error;
  }
}

//   Passport session setup.
passport.serializeUser(function (user, done) {
  console.log(`[Passport Debug] Serializing User: ${user ? user.id : 'None'}`);
  done(null, user.id || user.email);
});

passport.deserializeUser(async function (id, done) {
  try {
    console.log(`[Passport Debug] Deserializing ID: ${id}`);
    await SallaDatabase.connect();
    const query = typeof id === 'number' ? { id } : { email: id };
    const user = await SallaDatabase.retrieveUser(query, false);
    if (!user) {
      console.warn(`[Passport Debug] User not found for ID: ${id}`);
    }
    done(null, user);
  } catch (err) {
    console.error(`[Passport Debug] Deserialization Error:`, err);
    done(err);
  }
});

//   Use the Salla Strategy within Passport.
passport.use(SallaAPI.getPassportStrategy());
// save token and user data to your selected database

const SequelizeStoreModule = require("connect-session-sequelize")(session.Store);

// Initialize Database and Start Server
async function startServer() {
  try {
    console.log("🚀 Initializing system...");
    const connection = await SallaDatabase.connect();

    const app = express();

    // Trust proxy for Railway (allows secure cookies and IP detection)
    app.set('trust proxy', 1);

    // Configure Express
    app.set("views", __dirname + "/views");
    app.set("view engine", "html");

    // Persistent Session Storage
    const sessionStore = new SequelizeStoreModule({
      db: connection,
      checkExpirationInterval: 15 * 60 * 1000,
      expiration: 24 * 60 * 60 * 1000
    });

    if (SallaDatabase.DATABASE_ORM === "Sequelize") {
      await sessionStore.sync();
    }

    app.use(
      session({
        name: 'salla_session',
        secret: process.env.SESSION_SECRET || "salla dash secret",
        store: sessionStore,
        resave: true,
        saveUninitialized: true,
        cookie: {
          secure: true, // MUST be true for SameSite=none
          httpOnly: true,
          sameSite: 'none', // Critical for Salla iframe compatibility
          maxAge: 7 * 24 * 60 * 60 * 1000
        }
      })
    );

    // Debugging middleware to trace session issues
    app.use((req, res, next) => {
      if (req.path !== '/favicon.ico') {
        const hasSession = !!req.session;
        const hasUser = !!req.user;
        const cookieHeader = req.headers.cookie || 'None';
        console.log(`[Session Debug] ${req.method} ${req.path} | Auth: ${req.isAuthenticated()} | UserID: ${hasUser ? req.user.id : 'None'} | CookieFound: ${cookieHeader.includes('salla_session')}`);
      }
      next();
    });

    app.use(passport.initialize());
    app.use(passport.session());

    // serve static files from public folder
    app.use(express.static(__dirname + "/public"));

    // set the render engine to nunjucks
    app.engine("html", consolidate.nunjucks);
    app.use(bodyParser.urlencoded({ extended: false }));

    // parse application/json
    app.use(bodyParser.json());

    app.use((req, res, next) => {
      // Fix for "Cannot set property query of #<IncomingMessage> which has only a getter"
      const query = { ...req.query };
      Object.defineProperty(req, 'query', {
        value: query,
        configurable: true,
        enumerable: true,
        writable: true
      });
      return SallaAPI.setExpressVerify(req, res, next);
    });

    // --- Routes ---

    // POST /webhook
    app.post(["/webhook", "/webhook/"], function (req, res) {
      res.sendStatus(200);
      SallaWebhook.checkActions(req.body, req.headers.authorization, { SallaDatabase });
    });

    // OAuth Routes
    app.get(["/oauth/redirect", "/login"], passport.authenticate("salla"));
    app.get(
      "/oauth/callback",
      passport.authenticate("salla", { failureRedirect: "/login" }),
      function (req, res) {
        res.redirect("/");
      }
    );

    // GET /
    app.get("/", async function (req, res) {
      let userDetails = {
        user: req.user,
        isLogin: req.user,
        stores: [],
        name: req.user ? req.user.username : 'Guest',
        merchant: { name: 'No Store Connected', email: req.user ? req.user.email : '', id: 'N/A' },
        selected_merchant: null
      }

      if (req.user) {
        try {
          const connection = await SallaDatabase.connect();
          const stores = await connection.models.OauthTokens.findAll({
            where: { user_id: req.user.id }
          });
          userDetails.stores = stores;

          if (stores.length > 0) {
            const merchantId = req.query.merchant_id || stores[0].merchant;
            const accessToken = await getValidAccessToken(req.user.email, merchantId);
            const userFromAPI = await SallaAPI.getResourceOwner(accessToken);
            const resourceData = typeof userFromAPI.toArray === 'function' ? userFromAPI.toArray() : userFromAPI;

            userDetails.name = resourceData.name || userDetails.name;
            userDetails.merchant = resourceData.merchant || resourceData.store || userDetails.merchant;
            userDetails.selected_merchant = merchantId;
          }
        } catch (e) {
          console.error("Error in root route:", e);
        }
      }
      res.render("index.html", userDetails);
    });

    // GET /account
    app.get("/account", ensureAuthenticated, async function (req, res) {
      const connection = await SallaDatabase.connect();
      const stores = await connection.models.OauthTokens.findAll({
        where: { user_id: req.user.id },
        include: [connection.models.StoreTelegram]
      });

      const crypto = require("crypto");
      for (const store of stores) {
        if (!store.telegram_link_token) {
          const token = crypto.randomBytes(16).toString("hex");
          await store.update({ telegram_link_token: token });
        }
      }

      const NotificationService = require("./helpers/NotificationService");
      const botInfo = await NotificationService.getBotInfo();
      const botUsername = botInfo ? botInfo.username : "BotInfoError";

      res.render("account.html", {
        user: req.user,
        stores: stores,
        isLogin: req.user,
        success: req.query.success === '1',
        telegram_bot_username: botUsername
      });
    });

    app.post("/account/telegram/remove", ensureAuthenticated, async function (req, res) {
      const { oauth_token_id, chat_id } = req.body;
      await SallaDatabase.removeTelegramFromStore(oauth_token_id, chat_id);
      res.redirect("/account?success=1");
    });

    app.post("/account", ensureAuthenticated, async function (req, res) {
      try {
        const { stock_threshold, telegram_chat_id, alert_email } = req.body;
        const connection = await SallaDatabase.connect();
        await connection.models.User.update(
          {
            stock_threshold: parseInt(stock_threshold),
            telegram_chat_id,
            alert_email
          },
          { where: { email: req.user.email } }
        );
        res.redirect("/account?success=1");
      } catch (e) {
        res.send("Error updating settings: " + e.message);
      }
    });

    app.get("/refreshToken", ensureAuthenticated, function (req, res) {
      SallaAPI.requestNewAccessToken(SallaAPI.getRefreshToken())
        .then((token) => {
          res.render("token.html", { token, isLogin: req.user });
        })
        .catch((err) => res.send(err));
    });

    app.get("/orders", ensureAuthenticated, async function (req, res) {
      try {
        const connection = await SallaDatabase.connect();
        const stores = await connection.models.OauthTokens.findAll({ where: { user_id: req.user.id } });
        if (stores.length === 0) {
          return res.render("orders.html", {
            orders: [], isLogin: req.user, stores: [],
            error: "No stores found. Please re-install the app or login again to sync your data."
          });
        }
        const merchantId = req.query.merchant_id || stores[0].merchant;
        const accessToken = await getValidAccessToken(req.user.email, merchantId);
        res.render("orders.html", {
          orders: await SallaAPI.getAllOrders(accessToken),
          isLogin: req.user, stores: stores, selected_merchant: merchantId
        });
      } catch (e) {
        res.send("Error fetching orders: " + e.message);
      }
    });

    app.get("/customers", ensureAuthenticated, async function (req, res) {
      try {
        const connection = await SallaDatabase.connect();
        const stores = await connection.models.OauthTokens.findAll({ where: { user_id: req.user.id } });
        if (stores.length === 0) {
          return res.render("customers.html", {
            customers: [], isLogin: req.user, stores: [],
            error: "No stores found. Please re-install the app or login again to sync your data."
          });
        }
        const merchantId = req.query.merchant_id || stores[0].merchant;
        const accessToken = await getValidAccessToken(req.user.email, merchantId);
        res.render("customers.html", {
          customers: await SallaAPI.getAllCustomers(accessToken),
          isLogin: req.user, stores: stores, selected_merchant: merchantId
        });
      } catch (e) {
        res.send("Error fetching customers: " + e.message);
      }
    });

    app.post(["/telegram/webhook", "/telegram/webhook/"], async (req, res) => {
      const NotificationService = require("./helpers/NotificationService");
      try {
        const { message } = req.body;
        if (!message || !message.text) return res.sendStatus(200);
        const chatId = message.chat.id.toString();
        if (message.text.startsWith("/start")) {
          const parts = message.text.split(" ");
          if (parts.length > 1) {
            const linkToken = parts[1];
            const connection = await SallaDatabase.connect();
            const store = await connection.models.OauthTokens.findOne({ where: { telegram_link_token: linkToken } });
            if (store) {
              await SallaDatabase.addTelegramToStore(store.id, chatId, message.from.first_name || "Recipient");
              await NotificationService.sendTelegramAlert(chatId, `✅ <b>تم ربط حسابك بمتجر [${store.store_name}] بنجاح!</b>`);
            }
          }
        }
        res.sendStatus(200);
      } catch (error) {
        res.sendStatus(500);
      }
    });

    app.get("/logout", function (req, res) {
      SallaAPI.logout();
      req.logout((err) => { res.redirect("/"); });
    });

    app.listen(port, () => {
      console.log(`🚀 Server is running on ${port}`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

// Helper: SecureAuthenticated
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect("/login");
}

startServer();
