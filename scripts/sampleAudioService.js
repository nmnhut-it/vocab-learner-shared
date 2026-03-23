/**
 * Sample Audio Service
 * Plays pre-generated MP3 files for sample answers instead of using TTS
 */

class SampleAudioService {
    constructor() {
        this.audioPlayer = null;
        this.metadata = null;
        this.isLoading = false;
        this.audioMap = new Map();
    }

    async initialize() {
        if (this.metadata) return true;
        if (this.isLoading) {
            return new Promise((resolve) => {
                const checkInterval = setInterval(() => {
                    if (this.metadata || !this.isLoading) {
                        clearInterval(checkInterval);
                        resolve(!!this.metadata);
                    }
                }, 100);
            });
        }

        this.isLoading = true;

        try {
            // Load metadata for ielts-lessons
            const response = await fetch('audio/ielts-lessons/metadata.json');
            if (!response.ok) {
                throw new Error('Failed to load audio metadata');
            }

            this.metadata = await response.json();

            // Build map: question -> filename
            this.metadata.forEach(item => {
                const key = this.normalizeQuestion(item.topic);
                this.audioMap.set(key, {
                    filename: `audio/ielts-lessons/${item.filename}`,
                    text: item.text,
                    wordCount: item.word_count
                });
            });

            console.log(`Sample audio service initialized with ${this.audioMap.size} samples`);
            this.isLoading = false;
            return true;

        } catch (error) {
            console.error('Failed to initialize sample audio service:', error);
            this.isLoading = false;
            return false;
        }
    }

    normalizeQuestion(question) {
        return question.toLowerCase().trim().replace(/[?.,!]/g, '');
    }

    async playSampleAnswer(question, options = {}) {
        const {
            onStart = null,
            onEnd = null,
            onError = null
        } = options;

        try {
            // Initialize if needed
            if (!this.metadata) {
                const initialized = await this.initialize();
                if (!initialized) {
                    throw new Error('Sample audio service not available');
                }
            }

            // Find audio file for question
            const key = this.normalizeQuestion(question);
            const audioInfo = this.audioMap.get(key);

            if (!audioInfo) {
                console.warn('No pre-generated audio found for:', question);
                if (onError) onError(new Error('No audio available'));
                return false;
            }

            // Stop any currently playing audio
            this.stop();

            // Create audio player
            this.audioPlayer = new Audio(audioInfo.filename);

            if (onStart) {
                this.audioPlayer.addEventListener('play', onStart, { once: true });
            }

            if (onEnd) {
                this.audioPlayer.addEventListener('ended', onEnd, { once: true });
            }

            if (onError) {
                this.audioPlayer.addEventListener('error', (e) => {
                    onError(new Error('Audio playback failed'));
                }, { once: true });
            }

            // Play audio
            await this.audioPlayer.play();
            return true;

        } catch (error) {
            console.error('Error playing sample answer:', error);
            if (onError) onError(error);
            return false;
        }
    }

    stop() {
        if (this.audioPlayer) {
            this.audioPlayer.pause();
            this.audioPlayer.currentTime = 0;
            this.audioPlayer = null;
        }
    }

    isPlaying() {
        return this.audioPlayer && !this.audioPlayer.paused;
    }

    hasAudioFor(question) {
        if (!this.metadata) return false;
        const key = this.normalizeQuestion(question);
        return this.audioMap.has(key);
    }

    getAudioInfo(question) {
        if (!this.metadata) return null;
        const key = this.normalizeQuestion(question);
        return this.audioMap.get(key) || null;
    }
}

// Create singleton instance
window.sampleAudioService = new SampleAudioService();
