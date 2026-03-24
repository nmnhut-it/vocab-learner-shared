// Telegram configuration - tokens loaded from localStorage (injected via URL params)
// Parse ?tg=BASE64&cid=BASE64 from URL and save to localStorage
(function() {
    const params = new URLSearchParams(window.location.search);
    const tg = params.get('tg');
    const cid = params.get('cid');
    if (tg) {
        try { localStorage.setItem('tg_bot_token', atob(tg)); } catch(e) {}
    }
    if (cid) {
        try { localStorage.setItem('tg_chat_id', atob(cid)); } catch(e) {}
    }
    if (tg || cid) {
        // Strip tokens from URL bar for security
        const url = new URL(window.location);
        url.searchParams.delete('tg');
        url.searchParams.delete('cid');
        history.replaceState({}, '', url.pathname + url.search);
    }
})();

const TELEGRAM_BOT_TOKEN = localStorage.getItem('tg_bot_token') || '';
const TELEGRAM_CHAT_ID = parseInt(localStorage.getItem('tg_chat_id')) || 0;
const botToken = TELEGRAM_BOT_TOKEN;
const groupId = TELEGRAM_CHAT_ID;
