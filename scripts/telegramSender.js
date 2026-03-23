/**
 * Telegram Sender Utility
 * Sends audio recordings to Telegram via Bot API
 */

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';
const MAX_AUDIO_SIZE_MB = 50;
const BYTES_PER_MB = 1024 * 1024;

class TelegramSender {
    constructor(botToken, chatId) {
        if (!botToken || !chatId) {
            throw new Error('Bot token and chat ID required');
        }
        this.botToken = botToken;
        this.chatId = chatId;
    }

    async sendTextMessage(message) {
        const url = `${TELEGRAM_API_BASE}${this.botToken}/sendMessage`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: this.chatId,
                text: message,
                parse_mode: 'HTML'
            })
        });

        return this.handleResponse(response);
    }

    async sendAudio(audioBlob, caption, fileName = 'recording.ogg') {
        if (audioBlob.size > MAX_AUDIO_SIZE_MB * BYTES_PER_MB) {
            throw new Error(`Audio exceeds ${MAX_AUDIO_SIZE_MB}MB limit`);
        }

        const url = `${TELEGRAM_API_BASE}${this.botToken}/sendAudio`;
        const formData = new FormData();

        formData.append('chat_id', this.chatId);
        formData.append('audio', audioBlob, fileName);

        if (caption) {
            formData.append('caption', caption);
            formData.append('parse_mode', 'HTML');
        }

        const response = await fetch(url, {
            method: 'POST',
            body: formData
        });

        return this.handleResponse(response);
    }

    async sendPhoto(photoBlob, caption, fileName = 'photo.jpg') {
        if (photoBlob.size > MAX_AUDIO_SIZE_MB * BYTES_PER_MB) {
            throw new Error(`Photo exceeds ${MAX_AUDIO_SIZE_MB}MB limit`);
        }

        const url = `${TELEGRAM_API_BASE}${this.botToken}/sendPhoto`;
        const formData = new FormData();

        formData.append('chat_id', this.chatId);
        formData.append('photo', photoBlob, fileName);

        if (caption) {
            formData.append('caption', caption);
            formData.append('parse_mode', 'HTML');
        }

        const response = await fetch(url, {
            method: 'POST',
            body: formData
        });

        return this.handleResponse(response);
    }

    async handleResponse(response) {
        const data = await response.json();

        if (!data.ok) {
            throw new Error(data.description || 'Telegram API error');
        }

        return data.result;
    }

    async sendMessageWithKeyboard(message, inlineKeyboard) {
        const url = `${TELEGRAM_API_BASE}${this.botToken}/sendMessage`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: this.chatId,
                text: message,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: inlineKeyboard }
            })
        });

        return this.handleResponse(response);
    }

    async pollForApproval(sessionId, timeoutMs = 300000) {
        const POLL_INTERVAL_MS = 3000;
        const startTime = Date.now();
        let offset = 0;

        while (Date.now() - startTime < timeoutMs) {
            try {
                const url = `${TELEGRAM_API_BASE}${this.botToken}/getUpdates`;
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ offset, timeout: 2 })
                });

                const data = await response.json();

                if (data.ok && data.result.length > 0) {
                    for (const update of data.result) {
                        offset = update.update_id + 1;

                        if (update.callback_query) {
                            const callbackData = update.callback_query.data;

                            if (callbackData === `approve_${sessionId}`) {
                                await this.answerCallbackQuery(
                                    update.callback_query.id,
                                    'Session approved!'
                                );
                                return { approved: true };
                            }

                            if (callbackData === `reject_${sessionId}`) {
                                await this.answerCallbackQuery(
                                    update.callback_query.id,
                                    'Session rejected.'
                                );
                                return { approved: false };
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('Poll error:', error);
            }

            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
        }

        return { approved: false, timeout: true };
    }

    async answerCallbackQuery(callbackQueryId, text) {
        const url = `${TELEGRAM_API_BASE}${this.botToken}/answerCallbackQuery`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                callback_query_id: callbackQueryId,
                text: text
            })
        });

        return this.handleResponse(response);
    }

    formatAudioCaption(questionText, questionNum, category, duration, studentName = null) {
        const durationSec = Math.round(duration / 1000);

        let caption = `<b>IELTS Module 2 - Question ${questionNum}</b>\n\n`;

        if (studentName) {
            caption += `<b>Student:</b> ${studentName}\n`;
        }

        caption += `<b>Category:</b> ${category}\n` +
                   `<b>Question:</b> ${questionText}\n\n` +
                   `<b>Duration:</b> ${durationSec}s`;

        return caption;
    }
}
