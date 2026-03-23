// Telegram configuration - tokens loaded from localStorage (injected via URL params)
const TELEGRAM_BOT_TOKEN = localStorage.getItem('tg_bot_token') || '';
const TELEGRAM_CHAT_ID = parseInt(localStorage.getItem('tg_chat_id')) || 0;
const botToken = TELEGRAM_BOT_TOKEN;
const groupId = TELEGRAM_CHAT_ID;
