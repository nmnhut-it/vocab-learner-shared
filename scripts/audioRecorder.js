/**
 * Audio Recorder Utility
 * Handles browser audio recording with MediaRecorder API
 */

const AUDIO_MIME_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/wav'];

class AudioRecorder {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.stream = null;
        this.recordingStartTime = null;
    }

    async initialize() {
        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error('Audio recording not supported in this browser');
        }

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            return true;
        } catch (error) {
            throw new Error(`Microphone access denied: ${error.message}`);
        }
    }

    getSupportedMimeType() {
        return AUDIO_MIME_TYPES.find(type => MediaRecorder.isTypeSupported(type)) || '';
    }

    startRecording() {
        if (!this.stream) {
            throw new Error('Initialize recorder first');
        }

        this.audioChunks = [];
        const mimeType = this.getSupportedMimeType();

        this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });
        this.recordingStartTime = Date.now();

        this.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                this.audioChunks.push(event.data);
            }
        };

        this.mediaRecorder.start();
    }

    stopRecording() {
        return new Promise((resolve) => {
            if (!this.mediaRecorder) {
                resolve(null);
                return;
            }

            this.mediaRecorder.onstop = () => {
                const mimeType = this.getSupportedMimeType();
                const audioBlob = new Blob(this.audioChunks, { type: mimeType });
                const duration = Date.now() - this.recordingStartTime;

                resolve({
                    blob: audioBlob,
                    duration,
                    mimeType
                });
            };

            this.mediaRecorder.stop();
        });
    }

    getRecordingDuration() {
        if (!this.recordingStartTime) return 0;
        return Date.now() - this.recordingStartTime;
    }

    isRecording() {
        return this.mediaRecorder?.state === 'recording';
    }

    cleanup() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        this.mediaRecorder = null;
        this.audioChunks = [];
    }
}
