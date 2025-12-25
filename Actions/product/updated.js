/**
 *  this function is executed on "product.updated" action triggered by Salla .
 *
 * Action Body received from Salla
 * @param {Object} eventBody
 * { 
 *  event: 'product.updated',
    merchant: 472944967,
    created_at: '2021-11-22 13:51:57',
    data:
 *    {
 *      "id":1911645512,
 *      "app_name":"app name",
 *      "app_description":"desc",
 *      "app_type":"app",
 *      "app_scopes":[ 
 *        'settings.read',
 *        'customers.read_write',
 *        'orders.read_write',
 *        'carts.read',
 *        ...
 *      ],
 *      "installation_date":"2021-11-21 11:07:13"
 *    }
 * }
 * Arguments passed by you:
 * @param {Object} userArgs
 * { key:"val" }
 * @api public
 */
const NotificationService = require("../../helpers/NotificationService");

module.exports = async (eventBody, userArgs) => {
  const { merchant, data } = eventBody;
  const { SallaDatabase } = userArgs;

  if (!SallaDatabase) {
    console.error("SallaDatabase not passed to webhook action.");
    return;
  }

  // 1. Get user (merchant) settings from DB
  // Merchant ID in Salla is often used to link with our local user_id or merchant field
  const user = await SallaDatabase.retrieveUser({ email: eventBody.merchant_email || "" }, true);
  // Wait, merchant ID is better. Let's assume we can find the user by merchant ID.
  // Actually, let's look for a user that has an OAuth token with this merchant ID.

  try {
    const connection = await SallaDatabase.connect();
    // Finding user by merchant ID in OauthTokens
    const oauthToken = await connection.models.OauthTokens.findOne({
      where: { merchant: merchant },
      include: [
        { model: connection.models.User },
        { model: connection.models.StoreTelegram }
      ]
    });

    if (!oauthToken || !oauthToken.User) {
      console.warn(`No user found for merchant ${merchant}`);
      return;
    }

    const user = oauthToken.User;
    const storeName = oauthToken.store_name || "Salla Store";
    const product = data;
    const quantity = product.quantity;
    const threshold = user.stock_threshold || 5;

    console.log(`Checking stock for product ${product.name} in store ${storeName}: ${quantity} vs threshold ${threshold}`);

    if (quantity <= threshold) {
      const message = `⚠️ <b>Low Stock Alert</b>\n\nProduct: <b>${product.name}</b>\nCurrent Quantity: <b>${quantity}</b>\nThreshold: <b>${threshold}</b>\n\nPlease restock soon!`;

      // fetch telegram chat IDs for this store
      const storeTelegrams = oauthToken.StoreTelegrams || [];
      const chatIds = storeTelegrams.map(t => t.chat_id);

      // Also include the legacy user.telegram_chat_id if present and not already in chatIds
      if (user.telegram_chat_id && !chatIds.includes(user.telegram_chat_id)) {
        chatIds.push(user.telegram_chat_id);
      }

      // Broadcast Telegram Alert
      if (chatIds.length > 0) {
        await NotificationService.broadcastToStore(chatIds, message, storeName);
      }

      // Send Email Alert
      if (user.alert_email) {
        await NotificationService.sendEmailAlert(user.alert_email, message);
      }
    }
  } catch (error) {
    console.error("Error in product.updated action:", error);
  }
};
