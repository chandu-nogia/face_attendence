const logger = require('../utils/logger');

/**
 * WhatsApp / SMS stubs — wire Twilio / Gupshup via env when ready.
 * WHATSAPP_API_URL, WHATSAPP_API_KEY, SMS_API_URL, SMS_API_KEY
 */
async function sendWhatsApp({ to, message }) {
  if (!to || !message) return { sent: false, reason: 'missing_params' };
  if (!process.env.WHATSAPP_API_URL || !process.env.WHATSAPP_API_KEY) {
    logger.info(`[WhatsApp stub] to=${to} msg=${message.slice(0, 80)}`);
    return { sent: false, stub: true, channel: 'whatsapp' };
  }
  try {
    const res = await fetch(process.env.WHATSAPP_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.WHATSAPP_API_KEY}`,
      },
      body: JSON.stringify({ to, message }),
    });
    return { sent: res.ok, channel: 'whatsapp', status: res.status };
  } catch (err) {
    logger.warn(`WhatsApp send failed: ${err.message}`);
    return { sent: false, error: err.message };
  }
}

async function sendSms({ to, message }) {
  if (!to || !message) return { sent: false, reason: 'missing_params' };
  if (!process.env.SMS_API_URL || !process.env.SMS_API_KEY) {
    logger.info(`[SMS stub] to=${to} msg=${message.slice(0, 80)}`);
    return { sent: false, stub: true, channel: 'sms' };
  }
  try {
    const res = await fetch(process.env.SMS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.SMS_API_KEY}`,
      },
      body: JSON.stringify({ to, message }),
    });
    return { sent: res.ok, channel: 'sms', status: res.status };
  } catch (err) {
    logger.warn(`SMS send failed: ${err.message}`);
    return { sent: false, error: err.message };
  }
}

async function notifyParentChannels({ phone, message, settings }) {
  const results = [];
  if (settings?.notifyViaWhatsApp && phone) {
    results.push(await sendWhatsApp({ to: phone, message }));
  }
  if (settings?.notifyViaSms && phone) {
    results.push(await sendSms({ to: phone, message }));
  }
  return results;
}

module.exports = { sendWhatsApp, sendSms, notifyParentChannels };
