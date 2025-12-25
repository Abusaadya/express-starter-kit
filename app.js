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
//   To support persistent login sessions, Passport needs to be able to
//   serialize users into and deserialize users out of the session. Typically,
//   this will be as simple as storing the user ID when serializing, and finding
//   the user by ID when deserializing. However, since this example does not
//   have a database of user records, the complete salla user is serialized
//   and deserialized.

passport.serializeUser(function (user, done) {
  done(null, user);
});

passport.deserializeUser(function (obj, done) {
  done(null, obj);
});

//   Use the Salla Strategy within Passport.
passport.use(SallaAPI.getPassportStrategy());
// save token and user data to your selected database

var app = express();

// configure Express
app.set("views", __dirname + "/views");
app.set("view engine", "html");

// set the session secret
// you can store session data in any database (monogdb - mysql - inmemory - etc) for more (https://www.npmjs.com/package/express-session)
app.use(
  session({ secret: "keyboard cat", resave: true, saveUninitialized: true })
);

// Initialize Passport!  Also use passport.session() middleware, to support
// persistent login sessions (recommended).
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

// POST /webhook
app.post(["/webhook", "/webhook/"], function (req, res) {
  // Salla expects a 200 response immediately to avoid timeout
  res.sendStatus(200);

  // Process actions in background
  SallaWebhook.checkActions(req.body, req.headers.authorization, {
    SallaDatabase
  });
});

// GET /oauth/redirect
//   Use passport.authenticate() as route middleware to authenticate the
//   request. The first step in salla authentication will involve redirecting
//   the user to accounts.salla.sa. After authorization, salla will redirect the user
//   back to this application at /oauth/callback
app.get(["/oauth/redirect", "/login"], passport.authenticate("salla"));

// GET /oauth/callback
//   Use passport.authenticate() as route middleware to authenticate the
//   request. If authentication fails, the user will be redirected back to the
//   login page. Otherwise, the primary route function function will be called,
//   which, in this example, will redirect the user to the home page.
app.get(
  "/oauth/callback",
  passport.authenticate("salla", { failureRedirect: "/login" }),
  function (req, res) {
    res.redirect("/");
  }
);

// GET /
// render the index page

app.get("/", async function (req, res) {
  let userDetails = {
    user: req.user,
    isLogin: req.user,
    stores: []
  }
  if (req.user) {
    await SallaDatabase.connect();
    const connection = await SallaDatabase.connect();
    const stores = await connection.models.OauthTokens.findAll({
      where: { user_id: req.user.id }
    });
    userDetails.stores = stores;

    if (stores.length > 0) {
      try {
        const merchantId = req.query.merchant_id || stores[0].merchant;
        const accessToken = await getValidAccessToken(req.user.email, merchantId);
        const userFromAPI = await SallaAPI.getResourceOwner(accessToken);
        const resourceData = typeof userFromAPI.toArray === 'function' ? userFromAPI.toArray() : userFromAPI;

        userDetails = {
          ...userDetails,
          ...resourceData,
          name: resourceData.name || (req.user ? req.user.username : ''),
          merchant: resourceData.merchant || resourceData.store || {},
          selected_merchant: merchantId
        };
      } catch (e) {
        console.error("Error fetching user data from Salla:", e);
      }
    }
  }
  res.render("index.html", userDetails);
});

// GET /account
// get account information and ensure user is authenticated

app.get("/account", ensureAuthenticated, async function (req, res) {
  const connection = await SallaDatabase.connect();
  const stores = await connection.models.OauthTokens.findAll({
    where: { user_id: req.user.id },
    include: [connection.models.StoreTelegram]
  });

  // Ensure each store has a telegram_link_token
  const crypto = require("crypto");
  for (const store of stores) {
    if (!store.telegram_link_token) {
      const token = crypto.randomBytes(16).toString("hex");
      await store.update({ telegram_link_token: token });
    }
  }

  // Get Bot Username automatically using the token
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

// GET /refreshToken
// get new access token

app.get("/refreshToken", ensureAuthenticated, function (req, res) {
  SallaAPI.requestNewAccessToken(SallaAPI.getRefreshToken())
    .then((token) => {
      res.render("token.html", {
        token,
        isLogin: req.user,
      });
    })
    .catch((err) => res.send(err));
});

// GET /orders
// get all orders from user store

app.get("/orders", ensureAuthenticated, async function (req, res) {
  try {
    const connection = await SallaDatabase.connect();
    const stores = await connection.models.OauthTokens.findAll({ where: { user_id: req.user.id } });
    const merchantId = req.query.merchant_id || (stores.length > 0 ? stores[0].merchant : null);

    if (!merchantId) throw new Error("No stores connected.");

    const accessToken = await getValidAccessToken(req.user.email, merchantId);
    res.render("orders.html", {
      orders: await SallaAPI.getAllOrders(accessToken),
      isLogin: req.user,
      stores: stores,
      selected_merchant: merchantId
    });
  } catch (e) {
    res.send("Error fetching orders: " + e.message);
  }
});

// GET /customers
// get all customers from user store

app.get("/customers", ensureAuthenticated, async function (req, res) {
  try {
    const connection = await SallaDatabase.connect();
    const stores = await connection.models.OauthTokens.findAll({ where: { user_id: req.user.id } });
    const merchantId = req.query.merchant_id || (stores.length > 0 ? stores[0].merchant : null);

    if (!merchantId) throw new Error("No stores connected.");

    const accessToken = await getValidAccessToken(req.user.email, merchantId);
    res.render("customers.html", {
      customers: await SallaAPI.getAllCustomers(accessToken),
      isLogin: req.user,
      stores: stores,
      selected_merchant: merchantId
    });
  } catch (e) {
    res.send("Error fetching customers: " + e.message);
  }
});

// Telegram Webhook Handler
app.post(["/telegram/webhook", "/telegram/webhook/"], async (req, res) => {
  const NotificationService = require("./helpers/NotificationService");
  try {
    const { message } = req.body;
    console.log("📩 Incoming Telegram Webhook:", JSON.stringify(req.body));

    if (!message || !message.text) return res.sendStatus(200);

    const chatId = message.chat.id.toString();

    if (message.text.startsWith("/start")) {
      const parts = message.text.split(" ");

      if (parts.length > 1) {
        const linkToken = parts[1];
        await SallaDatabase.connect();
        const connection = await SallaDatabase.connect();

        // Find store by its linking token
        const store = await connection.models.OauthTokens.findOne({
          where: { telegram_link_token: linkToken }
        });

        if (store) {
          // Add this recipient to the store
          await SallaDatabase.addTelegramToStore(store.id, chatId, message.from.first_name || "Recipient");
          await NotificationService.sendTelegramAlert(chatId, `✅ <b>تم ربط حسابك بمتجر [${store.store_name}] بنجاح!</b>\nمن الآن فصاعداً، ستصلك تنبيهات هذا المتجر هنا.`);
        } else {
          await NotificationService.sendTelegramAlert(chatId, "❌ <b>عذراً، هذا الرابط غير صالح أو منتهي الصلاحية.</b>\nيرجى المحاولة مرة أخرى من صفحة الحساب.");
        }
      } else {
        await NotificationService.sendTelegramAlert(chatId, "👋 <b>أهلاً بك في بوت تنبيهات سلة!</b>\n\nلربط حسابك بمتجرك، يرجى الضغط على زر 'Connect with Telegram' الخاص بالمتجر من داخل التطبيق.");
      }
    }
    res.sendStatus(200);
  } catch (error) {
    console.error("Telegram Webhook Error:", error);
    res.sendStatus(500);
  }
});

// GET /logout
//   logout from passport
app.get("/logout", function (req, res) {
  SallaAPI.logout();
  req.logout(function (err) {
    if (err) { return next(err); }
    res.redirect("/");
  });
});

// Initialize Database and Start Server
async function startServer() {
  try {
    console.log("🚀 Initializing system...");
    await SallaDatabase.connect();

    app.listen(port, () => {
      console.log(`🚀 Server is running on ${port}`);
    });
  } catch (error) {
    console.error("❌ Failed to start server due to database connection error:", error);
    process.exit(1);
  }
}

startServer();


// Simple route middleware to ensure user is authenticated.
//   Use this route middleware on any resource that needs to be protected.  If
//   the request is authenticated (typically via a persistent login session),
//   the request will proceed. Otherwise, the user will be redirected to the
//   login page.
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect("/login");
}
