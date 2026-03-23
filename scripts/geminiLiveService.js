// Gemini Live API Service - Real-time voice conversation
// Provides WebSocket-based bidirectional audio streaming with Gemini 2.0

class GeminiLiveService {
    constructor() {
        this.ws = null;
        this.apiKey = null;
        this.isConnected = false;
        this.isListening = false;
        this.isSpeaking = false;
        this.inputAudioContext = null;  // 16kHz for microphone
        this.outputAudioContext = null; // 24kHz for speaker
        this.mediaStream = null;
        this.audioQueue = [];
        this.isPlayingAudio = false;
        this.sessionConfig = null;

        // Token usage tracking
        this.sessionStartTime = null;
        this.totalTokens = 0;
        this.promptTokens = 0;
        this.responseTokens = 0;
        this.MAX_TOKENS_PER_MINUTE = 250000;
        this.WARN_THRESHOLD = 0.8; // 80%
        this.DISCONNECT_THRESHOLD = 0.9; // 90%
        this.lastWarningTime = 0;
        this.usageInterval = null;

        // Audio recording for playback
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.recordingBlob = null;

        // Callbacks
        this.onStatusChange = null;
        this.onError = null;
        this.onTranscript = null;
        this.onUsageUpdate = null;
    }

    // Initialize input audio context (microphone - 16kHz)
    async initInputAudio() {
        if (!this.inputAudioContext) {
            this.inputAudioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 16000
            });
        }
        return this.inputAudioContext;
    }

    // Initialize output audio context (speaker - 24kHz)
    async initOutputAudio() {
        if (!this.outputAudioContext) {
            this.outputAudioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 24000
            });
        }
        return this.outputAudioContext;
    }

    // Connect to Gemini Live API
    async connect(apiKey, config = {}) {
        this.apiKey = apiKey;

        // Build system instruction text
        const systemText = config.systemInstruction?.parts?.[0]?.text ||
            'You are a friendly AI tutor helping with English conversation practice. Speak naturally and encouragingly.';

        this.sessionConfig = {
            model: config.model || 'models/gemini-2.0-flash-exp',
            systemInstruction: {
                parts: [{ text: systemText }]
            },
            generationConfig: {
                responseModalities: 'AUDIO',
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: {
                            voiceName: config.voiceName || 'Puck'
                        }
                    }
                }
            }
        };

        // Optional: Disable automatic voice activity detection (for controlled turn-taking)
        if (config.disableVAD) {
            this.sessionConfig.realtimeInputConfig = {
                automaticActivityDetection: {
                    disabled: true
                }
            };
        }

        const WS_ENDPOINT = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;

        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(WS_ENDPOINT);

                this.ws.onopen = () => {
                    console.log('✓ Connected to Gemini Live API');
                    this.isConnected = true;
                    this._updateStatus('connected');

                    // Start session tracking
                    this.sessionStartTime = Date.now();
                    this.totalTokens = 0;
                    this.promptTokens = 0;
                    this.responseTokens = 0;
                    this._startUsageTracking();

                    // Send setup message
                    this._send({
                        setup: this.sessionConfig
                    });

                    resolve();
                };

                this.ws.onmessage = async (event) => {
                    try {
                        // Handle both text and blob data
                        let data = event.data;
                        if (data instanceof Blob) {
                            data = await data.text();
                        }
                        this._handleMessage(JSON.parse(data));
                    } catch (error) {
                        console.error('Message parsing error:', error);
                    }
                };

                this.ws.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    this._triggerError('WebSocket connection failed');
                    reject(error);
                };

                this.ws.onclose = () => {
                    console.log('WebSocket closed');
                    this.isConnected = false;
                    this._updateStatus('disconnected');
                };

            } catch (error) {
                console.error('Connection error:', error);
                reject(error);
            }
        });
    }

    // Start capturing and streaming microphone audio
    async startListening() {
        if (!this.isConnected) {
            throw new Error('Not connected to Live API');
        }

        // Use separate input context for microphone (never closes during session)
        await this.initInputAudio();

        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: 16000,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true
                }
            });

            const source = this.inputAudioContext.createMediaStreamSource(this.mediaStream);
            const processor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);

            source.connect(processor);
            processor.connect(this.inputAudioContext.destination);

            // Track if we've sent activityStart (for manual VAD mode)
            let activityStartSent = false;

            processor.onaudioprocess = (e) => {
                if (this.isListening && this.ws && this.ws.readyState === WebSocket.OPEN) {
                    const inputData = e.inputBuffer.getChannelData(0);
                    const pcm16 = this._floatTo16BitPCM(inputData);
                    const base64Audio = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)));

                    // If VAD is disabled, send activityStart on first audio chunk
                    if (this.sessionConfig.realtimeInputConfig?.automaticActivityDetection?.disabled && !activityStartSent) {
                        this._send({
                            realtimeInput: {
                                activityStart: {}
                            }
                        });
                        activityStartSent = true;
                        console.log('📍 Activity start sent');
                    }

                    this._send({
                        realtimeInput: {
                            mediaChunks: [{
                                mimeType: 'audio/pcm;rate=16000',
                                data: base64Audio
                            }]
                        }
                    });
                }
            };

            // Reset activityStart flag when listening stops
            this.resetActivityStart = () => { activityStartSent = false; };

            this.isListening = true;
            this._updateStatus('listening');
            console.log('🎤 Microphone active');

            // Start recording for playback
            this._startRecording();

        } catch (error) {
            console.error('Microphone error:', error);
            this._triggerError('Could not access microphone: ' + error.message);
            throw error;
        }
    }

    // Stop listening
    stopListening() {
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
        this.isListening = false;
        this._updateStatus('connected');
        console.log('🎤 Microphone stopped');

        // Stop recording
        this._stopRecording();
    }

    // Start recording for playback
    _startRecording() {
        try {
            if (!this.mediaStream) return;

            this.recordedChunks = [];
            this.mediaRecorder = new MediaRecorder(this.mediaStream, {
                mimeType: 'audio/webm'
            });

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                this.recordingBlob = new Blob(this.recordedChunks, {
                    type: 'audio/webm'
                });
                console.log('Recording saved:', this.recordingBlob.size, 'bytes');
            };

            this.mediaRecorder.start(100); // Collect data every 100ms
            console.log('📹 Recording started');
        } catch (error) {
            console.error('Recording error:', error);
        }
    }

    // Stop recording
    _stopRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
            console.log('📹 Recording stopped');
        }
    }

    // Get recording blob for playback
    getRecording() {
        return this.recordingBlob;
    }

    // Pause conversation (stops mic but keeps connection)
    pause() {
        if (!this.isConnected) {
            throw new Error('Not connected to Live API');
        }
        this.stopListening();
        this._updateStatus('paused');
        console.log('⏸️ Conversation paused');
    }

    // Resume conversation (restarts mic)
    async resume() {
        if (!this.isConnected) {
            throw new Error('Not connected to Live API');
        }
        await this.startListening();
        console.log('▶️ Conversation resumed');
    }

    // Handle incoming WebSocket messages
    async _handleMessage(message) {
        console.log('📩 Received:', message);

        // Setup complete
        if (message.setupComplete) {
            console.log('✓ Session setup complete');
            return;
        }

        // Server content (audio response)
        if (message.serverContent) {
            const parts = message.serverContent.modelTurn?.parts || [];

            // DEBUG: Log what we're receiving
            console.log('📦 ServerContent parts:', parts);

            for (const part of parts) {
                // Handle audio response
                if (part.inlineData?.mimeType?.includes('audio')) {
                    console.log('🔊 Received audio chunk');
                    await this._playAudio(part.inlineData.data);
                }

                // Handle text transcript
                if (part.text) {
                    console.log('📝 Transcript:', part.text);
                    this._triggerTranscript(part.text);
                }
            }

            // Turn complete - update token counts
            if (message.serverContent.turnComplete) {
                console.log('✓ Turn complete');
                this.isSpeaking = false;
                this._updateStatus('listening');

                // Resume listening for next turn (in manual VAD mode)
                this._resumeListening();
            }
        }

        // Usage metadata - REAL token counts!
        if (message.usageMetadata) {
            this.totalTokens = message.usageMetadata.totalTokenCount || 0;
            this.promptTokens = message.usageMetadata.promptTokenCount || 0;
            this.responseTokens = message.usageMetadata.responseTokenCount || 0;
            console.log('📊 Tokens:', {
                total: this.totalTokens,
                prompt: this.promptTokens,
                response: this.responseTokens
            });
        }

        // Tool call (if we add function calling later)
        if (message.toolCall) {
            console.log('🔧 Tool call:', message.toolCall);
        }
    }

    // Play audio response
    async _playAudio(base64Audio) {
        if (!this.isSpeaking) {
            this.isSpeaking = true;
            this._updateStatus('speaking');
        }

        // Decode base64 to PCM
        const binaryString = atob(base64Audio);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        // Convert PCM16 to Float32
        const pcm16 = new Int16Array(bytes.buffer);
        const float32 = new Float32Array(pcm16.length);
        for (let i = 0; i < pcm16.length; i++) {
            float32[i] = pcm16[i] / 32768.0;
        }

        // Queue audio for playback
        this.audioQueue.push(float32);

        if (!this.isPlayingAudio) {
            this._processAudioQueue();
        }
    }

    // Process audio queue
    async _processAudioQueue() {
        if (this.audioQueue.length === 0) {
            this.isPlayingAudio = false;
            return;
        }

        this.isPlayingAudio = true;
        const audioData = this.audioQueue.shift();

        // Use separate output context for speaker (safe to recreate)
        await this.initOutputAudio();

        const audioBuffer = this.outputAudioContext.createBuffer(1, audioData.length, 24000);
        audioBuffer.getChannelData(0).set(audioData);

        const source = this.outputAudioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.outputAudioContext.destination);

        source.onended = () => {
            this._processAudioQueue();
        };

        source.start();
    }

    // Convert Float32 to 16-bit PCM
    _floatTo16BitPCM(float32Array) {
        const pcm16 = new Int16Array(float32Array.length);
        for (let i = 0; i < float32Array.length; i++) {
            const s = Math.max(-1, Math.min(1, float32Array[i]));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return pcm16;
    }

    // Send message to WebSocket
    _send(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }

    // Update status callback
    _updateStatus(status) {
        if (this.onStatusChange) {
            this.onStatusChange(status);
        }
    }

    // Trigger error callback
    _triggerError(message) {
        if (this.onError) {
            this.onError(message);
        }
    }

    // Trigger transcript callback
    _triggerTranscript(text) {
        if (this.onTranscript) {
            this.onTranscript(text);
        }
    }

    // Send text message
    sendText(text) {
        if (!this.isConnected) {
            throw new Error('Not connected to Live API');
        }

        this._send({
            clientContent: {
                turns: [{
                    role: 'user',
                    parts: [{ text }]
                }],
                turnComplete: true
            }
        });
    }

    // Signal that user has finished speaking (manual turn control)
    sendTurnComplete() {
        if (!this.isConnected) {
            throw new Error('Not connected to Live API');
        }

        console.log('🔄 Signaling activity end (turn complete)');

        // Pause audio streaming to prevent interrupting AI response
        const wasListening = this.isListening;
        this.isListening = false;

        // Send activityEnd to signal user finished speaking
        this._send({
            realtimeInput: {
                activityEnd: {}
            }
        });

        // Reset activity start flag for next turn
        if (this.resetActivityStart) {
            this.resetActivityStart();
        }

        // Resume listening after AI responds (wait for turnComplete)
        this._resumeAfterTurn = wasListening;
    }

    // Resume listening after AI's turn completes
    _resumeListening() {
        if (this._resumeAfterTurn) {
            this.isListening = true;
            this._resumeAfterTurn = false;
            console.log('🎤 Resumed listening for next turn');
        }
    }

    // Start usage tracking
    _startUsageTracking() {
        if (this.usageInterval) {
            clearInterval(this.usageInterval);
        }

        this.usageInterval = setInterval(() => {
            if (!this.isConnected) return;

            // Calculate session duration
            const sessionDuration = (Date.now() - this.sessionStartTime) / 1000; // seconds
            const sessionMinutes = sessionDuration / 60;

            // Calculate tokens per minute (using REAL token counts from API)
            const tokensPerMinute = sessionMinutes > 0 ? this.totalTokens / sessionMinutes : 0;

            // Update UI
            if (this.onUsageUpdate) {
                this.onUsageUpdate({
                    tokens: this.totalTokens,
                    promptTokens: this.promptTokens,
                    responseTokens: this.responseTokens,
                    tokensPerMinute: Math.floor(tokensPerMinute),
                    duration: Math.floor(sessionDuration),
                    percentage: (tokensPerMinute / this.MAX_TOKENS_PER_MINUTE) * 100
                });
            }

            // Check thresholds
            if (tokensPerMinute >= this.MAX_TOKENS_PER_MINUTE * this.DISCONNECT_THRESHOLD) {
                console.warn('⚠️ Approaching rate limit - auto disconnecting');
                this._triggerError('Rate limit approaching - disconnecting to prevent errors');
                this.disconnect();
            } else if (tokensPerMinute >= this.MAX_TOKENS_PER_MINUTE * this.WARN_THRESHOLD) {
                const now = Date.now();
                if (now - this.lastWarningTime > 10000) { // Warn max once per 10s
                    console.warn('⚠️ Token usage high:', Math.floor(tokensPerMinute), 'tokens/min');
                    this._triggerError('Warning: High token usage - consider ending session soon');
                    this.lastWarningTime = now;
                }
            }
        }, 1000); // Update every second
    }

    // Disconnect
    disconnect() {
        this.stopListening();

        if (this.usageInterval) {
            clearInterval(this.usageInterval);
            this.usageInterval = null;
        }

        // Close both audio contexts
        if (this.inputAudioContext) {
            this.inputAudioContext.close();
            this.inputAudioContext = null;
        }

        if (this.outputAudioContext) {
            this.outputAudioContext.close();
            this.outputAudioContext = null;
        }

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        this.isConnected = false;
        this.audioQueue = [];
        this.sessionStartTime = null;
        this._updateStatus('disconnected');
    }

    // Set conversation context (for topic-based learning or role-play)
    setContext(topicSummary) {
        if (this.sessionConfig && topicSummary) {
            // Detect if this is a role-play scenario
            const isRolePlay = topicSummary.toLowerCase().includes('role') ||
                             topicSummary.toLowerCase().includes('scenario') ||
                             topicSummary.toLowerCase().includes('your role:');

            if (isRolePlay) {
                this.sessionConfig.systemInstruction = {
                    parts: [{
                        text: `You are participating in an English conversation role-play practice session.

${topicSummary}

IMPORTANT INSTRUCTIONS:
- Adopt the role specified in the scenario
- Use the context data (menu items, prices, etc.) accurately
- Follow the conversation patterns from the examples
- Encourage the student to practice similar questions/answers
- Speak naturally and at a moderate pace
- Wait for the student to respond - practice turn-taking
- If student struggles, provide gentle hints or rephrase
- Vary the practice by asking different questions within the same pattern`
                    }]
                };
            } else {
                // Regular topic-based learning
                this.sessionConfig.systemInstruction = {
                    parts: [{
                        text: `You are a friendly AI tutor helping with English conversation practice.

Topic context: ${topicSummary}

Engage the student in natural conversation about this topic. Ask follow-up questions, provide explanations when needed, and encourage them to practice speaking. Speak naturally and conversationally.`
                    }]
                };
            }
        }
    }
}

// Create singleton instance
window.geminiLiveService = new GeminiLiveService();
