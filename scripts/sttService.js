// Speech-to-Text Service using Transformers.js Whisper
// Provides client-side speech recognition for conversational practice

class STTService {
    constructor() {
        this.model = null;
        this.isLoading = false;
        this.isLoaded = false;
        this.loadError = null;
        this.progressCallbacks = [];
        this.mode = 'auto'; // auto, whisper, browser, gemini

        // Web Speech API fallback
        this.recognition = null;
        this.initBrowserSTT();
    }

    // Register progress callback
    onProgress(callback) {
        this.progressCallbacks.push(callback);
    }

    // Notify all progress listeners
    notifyProgress(message, progress) {
        this.progressCallbacks.forEach(callback => callback(message, progress));
    }

    // Initialize browser Web Speech API
    initBrowserSTT() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            this.recognition = new SpeechRecognition();
            this.recognition.lang = 'en-US';
            this.recognition.continuous = false;
            this.recognition.interimResults = false;
        }
    }

    // Check if local Whisper models exist
    async checkLocalModels() {
        try {
            const response = await fetch('/models/Xenova/whisper-small.en/config.json');
            return response.ok;
        } catch (error) {
            return false;
        }
    }

    // Initialize Whisper model
    async initialize() {
        if (this.isLoaded) return true;
        if (this.isLoading) {
            await new Promise(resolve => {
                const checkInterval = setInterval(() => {
                    if (!this.isLoading) {
                        clearInterval(checkInterval);
                        resolve();
                    }
                }, 100);
            });
            return this.isLoaded;
        }

        this.isLoading = true;
        this.loadError = null;

        try {
            console.log('Initializing Transformers.js Whisper STT...');
            this.notifyProgress('Loading Whisper library...', 0.1);

            // Dynamic import of Transformers.js
            const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');

            // Configure to use local models if available
            env.localModelPath = '/models/';
            env.allowLocalModels = true;
            env.allowRemoteModels = true; // Fallback to remote if local not found

            // Configure to use WASM backend for better compatibility
            env.backends.onnx.wasm.proxy = false;

            // Check if local models exist
            const hasLocal = await this.checkLocalModels();
            if (hasLocal) {
                this.notifyProgress('Loading local Whisper model...', 0.3);
                console.log('Using local Whisper model');
            } else {
                this.notifyProgress('Downloading Whisper model (~466MB)...', 0.3);
                console.log('Downloading Whisper model from remote');
            }

            // Track multiple file downloads
            const fileProgress = new Map();
            let totalFiles = 0;

            // Load Whisper small model (better accuracy, English-only)
            this.model = await pipeline(
                'automatic-speech-recognition',
                'Xenova/whisper-small.en',
                {
                    quantized: false,
                    device: 'wasm',
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
                }
            );

            this.notifyProgress('✓ Whisper ready!', 1.0);
            this.isLoaded = true;
            this.isLoading = false;
            console.log('Whisper model loaded successfully');

            return true;

        } catch (error) {
            console.error('Failed to load Whisper model:', error);
            this.loadError = error;
            this.isLoading = false;
            this.notifyProgress('Failed to load Whisper model', 0);
            return false;
        }
    }

    // Convert audio blob to Float32Array for Whisper
    async blobToFloat32Array(blob) {
        const arrayBuffer = await blob.arrayBuffer();
        const audioContext = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: 16000
        });

        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        const float32Array = audioBuffer.getChannelData(0);

        await audioContext.close();
        return float32Array;
    }

    // Transcribe using Whisper model
    async transcribeWhisper(audioBlob) {
        if (!this.isLoaded) {
            const initialized = await this.initialize();
            if (!initialized) {
                throw new Error('Whisper model not available');
            }
        }

        try {
            console.log('Transcribing with Whisper...');
            const audioData = await this.blobToFloat32Array(audioBlob);

            const result = await this.model(audioData, {
                chunk_length_s: 30,
                stride_length_s: 5,
                language: 'english',
                task: 'transcribe'
            });

            console.log('Whisper result:', result.text);
            return result.text;

        } catch (error) {
            console.error('Whisper transcription error:', error);
            throw error;
        }
    }

    // Transcribe using Web Speech API
    async transcribeBrowser(audioBlob) {
        if (!this.recognition) {
            throw new Error('Web Speech API not available');
        }

        return new Promise((resolve, reject) => {
            const audio = new Audio(URL.createObjectURL(audioBlob));

            this.recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                console.log('Browser STT result:', transcript);
                resolve(transcript);
            };

            this.recognition.onerror = (event) => {
                console.error('Browser STT error:', event.error);
                reject(new Error(event.error));
            };

            this.recognition.onend = () => {
                audio.pause();
            };

            audio.play();
            this.recognition.start();
        });
    }

    // Transcribe using Gemini API (multimodal)
    async transcribeGemini(audioBlob, apiKey) {
        if (!apiKey) {
            throw new Error('Gemini API key required');
        }

        try {
            // Convert blob to base64
            const arrayBuffer = await audioBlob.arrayBuffer();
            const base64Audio = btoa(
                String.fromCharCode(...new Uint8Array(arrayBuffer))
            );

            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [
                                {
                                    inline_data: {
                                        mime_type: audioBlob.type || 'audio/webm',
                                        data: base64Audio
                                    }
                                },
                                { text: 'Transcribe this audio accurately. Return only the transcribed text, no additional commentary.' }
                            ]
                        }],
                        generationConfig: {
                            temperature: 0.1,
                            maxOutputTokens: 2048
                        }
                    })
                }
            );

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || 'Gemini API error');
            }

            const data = await response.json();
            const transcript = data.candidates[0].content.parts[0].text.trim();

            console.log('Gemini STT result:', transcript);
            return transcript;

        } catch (error) {
            console.error('Gemini transcription error:', error);
            throw error;
        }
    }

    // Main transcribe method with auto-fallback
    async transcribe(audioBlob, options = {}) {
        const { mode = this.mode, geminiApiKey = null } = options;

        // Auto mode: try Whisper → Browser → Gemini
        if (mode === 'auto') {
            // Try Whisper first
            if (this.isLoaded || !this.loadError) {
                try {
                    return await this.transcribeWhisper(audioBlob);
                } catch (error) {
                    console.warn('Whisper failed, trying browser STT:', error);
                }
            }

            // Try browser STT
            if (this.recognition) {
                try {
                    return await this.transcribeBrowser(audioBlob);
                } catch (error) {
                    console.warn('Browser STT failed, trying Gemini:', error);
                }
            }

            // Try Gemini as last resort
            if (geminiApiKey) {
                try {
                    return await this.transcribeGemini(audioBlob, geminiApiKey);
                } catch (error) {
                    console.warn('Gemini STT failed:', error);
                }
            }

            throw new Error('All STT methods failed');
        }

        // Specific mode
        switch (mode) {
            case 'whisper':
                return await this.transcribeWhisper(audioBlob);
            case 'browser':
                return await this.transcribeBrowser(audioBlob);
            case 'gemini':
                return await this.transcribeGemini(audioBlob, geminiApiKey);
            default:
                throw new Error(`Unknown STT mode: ${mode}`);
        }
    }

    // Check model availability
    getAvailableModes() {
        return {
            whisper: this.isLoaded,
            browser: !!this.recognition,
            gemini: true // Always available with API key
        };
    }
}

// Create singleton instance
window.sttService = new STTService();
