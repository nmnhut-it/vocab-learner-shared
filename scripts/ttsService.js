// Shared TTS Service using Transformers.js SpeechT5
// Provides high-quality text-to-speech for list view, flashcards, and video generation

class TTSService {
    constructor() {
        this.ttsModel = null;
        this.speakerEmbeddings = null;
        this.isLoading = false;
        this.isLoaded = false;
        this.loadError = null;
        this.audioCache = new Map(); // In-memory cache
        this.progressCallbacks = [];
        this.dbName = 'TTSCacheDB';
        this.storeName = 'audioCache';
        this.db = null;
        this.initDB();
    }

    // Register a callback for progress updates
    onProgress(callback) {
        this.progressCallbacks.push(callback);
    }

    // Notify all progress callbacks
    notifyProgress(message, progress) {
        this.progressCallbacks.forEach(cb => cb(message, progress));
    }

    async initialize() {
        if (this.isLoaded) return true;
        if (this.isLoading) {
            // Wait for ongoing initialization
            return new Promise((resolve) => {
                const checkInterval = setInterval(() => {
                    if (this.isLoaded || this.loadError) {
                        clearInterval(checkInterval);
                        resolve(this.isLoaded);
                    }
                }, 100);
            });
        }

        this.isLoading = true;

        try {
            console.log('Initializing Transformers.js TTS...');
            this.notifyProgress('Loading AI TTS library...', 0.1);

            // Load Transformers.js
            const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');

            // Configure to use local models if available
            env.localModelPath = '/models/';
            env.allowLocalModels = true;
            env.allowRemoteModels = true; // Fallback to remote if local not found

            // Try to use WebGPU for GPU acceleration
            const hasWebGPU = 'gpu' in navigator;
            this.useGPU = hasWebGPU;
            console.log(`Using ${hasWebGPU ? 'WebGPU (GPU)' : 'WASM (CPU)'} backend`);

            // Check if local models exist
            const hasLocal = await this.checkLocalModels();
            if (hasLocal) {
                this.notifyProgress('Loading local AI voice model...', 0.3);
            } else {
                this.notifyProgress('Downloading AI voice model (~587MB)...', 0.3);
            }

            // Track multiple file downloads
            const fileProgress = new Map();
            let totalFiles = 0;

            // Load TTS model (full precision for best audio quality)
            this.ttsModel = await pipeline('text-to-speech', 'Xenova/speecht5_tts', {
                quantized: false,
                device: this.useGPU ? 'webgpu' : 'wasm',
                progress_callback: (progress) => {
                    if (progress.status === 'progress' && progress.file) {
                        fileProgress.set(progress.file, progress.progress || 0);
                        const files = Array.from(fileProgress.keys());
                        totalFiles = Math.max(totalFiles, files.length);
                        const avgProgress = Array.from(fileProgress.values()).reduce((a, b) => a + b, 0) / totalFiles;
                        const progressValue = 0.3 + (avgProgress / 100) * 0.5; // 30% to 80%
                        this.notifyProgress(
                            `Downloading model: ${Math.round(avgProgress)}% (${files.length} files)`,
                            progressValue
                        );
                    } else if (progress.status === 'done') {
                        this.notifyProgress('Processing model files...', 0.8);
                    }
                }
            });

            // Load speaker embeddings (try local first, then remote)
            this.notifyProgress('Loading speaker voice data...', 0.85);
            let embeddingsUrl = '/models/Xenova/speaker_embeddings/speaker_embeddings.bin';
            let response = await fetch(embeddingsUrl);

            if (!response.ok) {
                // Fallback to remote if local not found
                console.log('Local speaker embeddings not found, downloading from Hugging Face...');
                this.notifyProgress('Downloading speaker embeddings...', 0.9);
                embeddingsUrl = 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin';
                response = await fetch(embeddingsUrl);
            } else {
                console.log('Using local speaker embeddings');
            }

            const buffer = await response.arrayBuffer();
            this.speakerEmbeddings = new Float32Array(buffer);

            this.isLoaded = true;
            this.isLoading = false;
            this.notifyProgress('✓ AI voice ready!', 1.0);
            console.log('TTS model loaded successfully');
            return true;

        } catch (error) {
            console.error('Failed to initialize TTS:', error);
            this.loadError = error;
            this.isLoading = false;
            this.isLoaded = false;
            return false;
        }
    }

    async speak(text, options = {}) {
        const {
            useCache = true,
            onStart = null,
            onEnd = null,
            onError = null
        } = options;

        try {
            // Check if TTS is loaded
            if (!this.isLoaded) {
                const initialized = await this.initialize();
                if (!initialized) {
                    throw new Error('TTS not available - falling back to browser TTS');
                }
            }

            // Check cache
            const cacheKey = text.toLowerCase().trim();
            if (useCache && this.audioCache.has(cacheKey)) {
                const audioData = this.audioCache.get(cacheKey);
                await this.playAudio(audioData, onStart, onEnd);
                return;
            }

            // Call onStart BEFORE heavy operation
            if (onStart) onStart();

            // Yield to browser to update UI before heavy TTS generation
            await new Promise(resolve => setTimeout(resolve, 100));

            // Generate speech (this is CPU-intensive and may block briefly)
            console.log('Starting TTS generation for:', text.substring(0, 50) + '...');
            const output = await this.ttsModel(text, {
                speaker_embeddings: this.speakerEmbeddings
            });
            console.log('TTS generation complete, audio length:', output.audio?.length);

            // Cache the audio data
            if (useCache) {
                this.audioCache.set(cacheKey, output.audio);
            }

            // Play audio
            console.log('Starting audio playback...');
            await this.playAudio(output.audio, null, onEnd);
            console.log('Audio playback complete');

        } catch (error) {
            console.error('TTS error:', error);
            if (onError) onError(error);
            throw error;
        }
    }

    async playAudio(audioData, onStart, onEnd) {
        return new Promise((resolve, reject) => {
            try {
                // Create audio context
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const modelSampleRate = 16000; // SpeechT5 native sample rate

                // Create buffer at model's sample rate, AudioContext will resample
                const audioBuffer = audioContext.createBuffer(
                    1,
                    audioData.length,
                    modelSampleRate
                );

                audioBuffer.copyToChannel(audioData, 0);

                // Create source and connect to destination
                const source = audioContext.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(audioContext.destination);

                if (onStart) onStart();

                source.onended = () => {
                    if (onEnd) onEnd();
                    audioContext.close();
                    resolve();
                };

                source.start();

            } catch (error) {
                reject(error);
            }
        });
    }

    // Stop any currently playing audio
    stop() {
        // Note: We can't easily stop AudioContext playback once started
        // This would require tracking source nodes
        console.log('Stop requested - TTS will finish current utterance');
    }

    // Clear audio cache
    clearCache() {
        this.audioCache.clear();
    }

    // Get cache size
    getCacheSize() {
        return this.audioCache.size;
    }

    // Check if local models exist
    async checkLocalModels() {
        try {
            const response = await fetch('/models/Xenova/speecht5_tts/config.json');
            return response.ok;
        } catch (error) {
            return false;
        }
    }

    // Initialize IndexedDB for persistent caching
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

    // Get cached audio from IndexedDB
    async getCachedAudio(text) {
        if (!this.db) await this.initDB();

        const key = text.toLowerCase().trim();

        // Check in-memory cache first
        if (this.audioCache.has(key)) {
            return this.audioCache.get(key);
        }

        // Check IndexedDB
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(key);

            request.onsuccess = () => {
                if (request.result) {
                    // Load into in-memory cache
                    this.audioCache.set(key, request.result);
                }
                resolve(request.result);
            };
            request.onerror = () => resolve(null);
        });
    }

    // Save audio to IndexedDB
    async saveCachedAudio(text, audioData) {
        if (!this.db) await this.initDB();

        const key = text.toLowerCase().trim();

        // Save to in-memory cache
        this.audioCache.set(key, audioData);

        // Save to IndexedDB
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.put(audioData, key);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // Pre-generate TTS for all vocabulary words
    async preGenerateVocab(vocabList, progressCallback) {
        if (!this.isLoaded) {
            const initialized = await this.initialize();
            if (!initialized) {
                throw new Error('TTS not available');
            }
        }

        const total = vocabList.length;
        let completed = 0;

        for (const word of vocabList) {
            const text = word.english || word;

            // Check if already cached
            const cached = await this.getCachedAudio(text);
            if (!cached) {
                // Generate TTS
                const output = await this.ttsModel(text, {
                    speaker_embeddings: this.speakerEmbeddings
                });

                // Save to cache
                await this.saveCachedAudio(text, output.audio);
            }

            completed++;
            if (progressCallback) {
                progressCallback(completed, total, text);
            }
        }
    }

    // Get audio from cache (memory or IndexedDB)
    async getAudio(text) {
        // Check cache first
        let audioData = await this.getCachedAudio(text);

        if (!audioData) {
            // Generate if not cached
            if (!this.isLoaded) {
                await this.initialize();
            }

            const output = await this.ttsModel(text, {
                speaker_embeddings: this.speakerEmbeddings
            });

            audioData = output.audio;
            await this.saveCachedAudio(text, audioData);
        }

        return audioData;
    }

    // Clear persistent cache
    async clearPersistentCache() {
        if (!this.db) await this.initDB();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.clear();

            request.onsuccess = () => {
                this.audioCache.clear();
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }

    // Get cache statistics
    async getCacheStats() {
        if (!this.db) await this.initDB();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.count();

            request.onsuccess = () => {
                resolve({
                    memoryCache: this.audioCache.size,
                    persistentCache: request.result
                });
            };
            request.onerror = () => reject(request.error);
        });
    }
}

// Create singleton instance
window.ttsService = new TTSService();