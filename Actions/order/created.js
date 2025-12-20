/**
 *  this function is executed on "order.created" action triggered by Salla .
 *
 * Action Body received from Salla
 * @param {Object} eventBody
 * { 
 *  event: 'order.created',
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


const nodemailer = require('nodemailer');

module.exports = async (eventBody) => {
  const { id, customer, total } = eventBody.data;

  // إعداد "الناقل" (ببيانات SMTP الخاصة بك)
  let transporter = nodemailer.createTransport({
    host: "smtp.example.com",
    port: 587,
    auth: { user: "your-email@example.com", pass: "your-password" }
  });

  // محتوى الإيميل
  let info = await transporter.sendMail({
    from: '"متجري البرمجي" <your-email@example.com>',
    to: "admin@example.com",
    subject: `طلب جديد رقم #${id}`,
    text: `أهلاً، لقد قام العميل ${customer.first_name} بطلب جديد بقيمة ${total.amount} ريال.`
  });

  console.log("تم إرسال إيميل التنبيه بنجاح: %s", info.messageId);
};

