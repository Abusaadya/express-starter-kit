const nodemailer = require("nodemailer");

/**
 * Notification Service
 */
class NotificationService {
    /**
     * Fetch bot info from Telegram
     */
    async getBotInfo() {
        const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
        if (!token) {
            console.error("❌ TELEGRAM_BOT_TOKEN is missing in .env");
            return null;
        }

        try {
            console.log(`📡 Fetching bot info from Telegram...`);
            const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
            const result = await response.json();
            if (!result.ok) {
                console.error("❌ Telegram API Error (getMe):", result.description);
                return null;
            }
            return result.result;
        } catch (error) {
            console.error("❌ Error fetching bot info:", error.message);
            return null;
        }
    }

    /**
     * Broadcast alert via Telegram to multiple recipients
     * @param {Array<string>} chatIds 
     * @param {string} message 
     * @param {string} storeName
     */
    async broadcastToStore(chatIds, message, storeName = "") {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token || !chatIds || !chatIds.length) {
            console.warn("Telegram Token or Chat IDs missing. Skipping broadcast.");
            return;
        }

        const prefix = storeName ? `🏪 <b>[${storeName}]</b>\n` : "";
        const fullMessage = prefix + message;

        const promises = chatIds.map(chatId => this.sendTelegramAlert(chatId, fullMessage));
        await Promise.allSettled(promises);
    }

    /**
     * Send alert via Telegram
     * @param {string} chatId 
     * @param {string} message 
     */
    async sendTelegramAlert(chatId, message) {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token || !chatId) {
            console.warn("Telegram Token or Chat ID missing. Skipping alert.");
            return;
        }

        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: message,
                    parse_mode: "HTML"
                })
            });
            const result = await response.json();
            if (!result.ok) {
                console.error(`Telegram API Error (ChatID: ${chatId}):`, result.description);
            }
        } catch (error) {
            console.error(`Error sending Telegram alert (ChatID: ${chatId}):`, error);
        }
    }

    /**
     * Send alert via Email
     * @param {string} email 
     * @param {string} message 
     */
    async sendEmailAlert(email, message) {
        if (!email || !process.env.EMAIL_HOST) {
            console.warn("Email or SMTP settings missing. Skipping alert.");
            return;
        }

        const transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST,
            port: process.env.EMAIL_PORT,
            secure: process.env.EMAIL_PORT == 465,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });

        try {
            await transporter.sendMail({
                from: `"Salla Alerts" <${process.env.EMAIL_USER}>`,
                to: email,
                subject: "Low Stock Alert! ⚠️",
                html: `<p>${message}</p>`,
            });
            console.log("Email alert sent to:", email);
        } catch (error) {
            console.error("Error sending Email alert:", error);
        }
    }
}

module.exports = new NotificationService();
