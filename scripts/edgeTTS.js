// Edge TTS Service - Free, fast, high-quality text-to-speech using Microsoft Edge API
// Much faster than local WASM models and better quality

const EDGE_TTS_VOICES = {
    US_FEMALE: 'en-US-AriaNeural',
    US_MALE: 'en-US-GuyNeural',
    UK_FEMALE: 'en-GB-SoniaNeural',
    UK_MALE: 'en-GB-RyanNeural'
};

const DEFAULT_VOICE = EDGE_TTS_VOICES.US_FEMALE;

class EdgeTTSService {
    constructor() {
        this.audioCache = new Map();
        this.currentAudio = null;
        this.isPlaying = false;
        this.dbName = 'EdgeTTSCache';
        this.storeName = 'audioCache';
        this.db = null;
        this.initDB();
    }

    async initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };
        });
    }

    async getCachedAudio(text, voice) {
        const cacheKey = `${voice}:${text.toLowerCase().trim()}`;
        if (this.audioCache.has(cacheKey)) {
            return this.audioCache.get(cacheKey);
        }
        if (!this.db) await this.initDB();
        return new Promise((resolve) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(cacheKey);
            request.onsuccess = () => {
                if (request.result) {
                    this.audioCache.set(cacheKey, request.result);
                }
                resolve(request.result);
            };
            request.onerror = () => resolve(null);
        });
    }

    async saveCachedAudio(text, voice, audioBlob) {
        const cacheKey = `${voice}:${text.toLowerCase().trim()}`;
        this.audioCache.set(cacheKey, audioBlob);
        if (!this.db) await this.initDB();
        return new Promise((resolve) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.put(audioBlob, cacheKey);
            request.onsuccess = () => resolve();
            request.onerror = () => resolve();
        });
    }

    async speak(text, options = {}) {
        const {
            voice = DEFAULT_VOICE,
            useCache = true,
            onStart = null,
            onEnd = null,
            onError = null
        } = options;

        try {
            if (useCache) {
                const cachedAudio = await this.getCachedAudio(text, voice);
                if (cachedAudio) {
                    await this.playAudioBlob(cachedAudio, onStart, onEnd);
                    return;
                }
            }

            const audioBlob = await this.generateSpeech(text, voice);
            if (useCache) {
                await this.saveCachedAudio(text, voice, audioBlob);
            }
            await this.playAudioBlob(audioBlob, onStart, onEnd);

        } catch (error) {
            console.error('Edge TTS error:', error);
            if (onError) onError(error);
            throw error;
        }
    }

    async generateSpeech(text, voice) {
        const EDGE_API_URL = 'https://api.streamelements.com/kappa/v2/speech';
        const params = new URLSearchParams({
            voice: voice,
            text: text
        });
        const response = await fetch(`${EDGE_API_URL}?${params}`);
        if (!response.ok) {
            throw new Error(`Edge TTS failed: ${response.status}`);
        }
        return await response.blob();
    }

    async playAudioBlob(audioBlob, onStart, onEnd) {
        return new Promise((resolve, reject) => {
            try {
                const audio = new Audio(URL.createObjectURL(audioBlob));
                this.currentAudio = audio;
                this.isPlaying = true;

                audio.oncanplaythrough = () => {
                    if (onStart) onStart();
                    audio.play().catch(reject);
                };

                audio.onended = () => {
                    this.isPlaying = false;
                    this.currentAudio = null;
                    URL.revokeObjectURL(audio.src);
                    if (onEnd) onEnd();
                    resolve();
                };

                audio.onerror = () => {
                    this.isPlaying = false;
                    reject(new Error('Audio playback failed'));
                };

            } catch (error) {
                reject(error);
            }
        });
    }

    stop() {
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio.currentTime = 0;
            this.isPlaying = false;
        }
    }

    clearCache() {
        this.audioCache.clear();
        if (this.db) {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            store.clear();
        }
    }
}

window.edgeTTS = new EdgeTTSService();
