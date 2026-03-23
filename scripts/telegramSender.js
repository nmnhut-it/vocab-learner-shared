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
