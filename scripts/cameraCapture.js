/**
 * Camera Capture Utility
 * Handles device camera access and photo capture for student identification
 */

const CAMERA_CONSTRAINTS = {
    video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: 'user'
    }
};

const PHOTO_QUALITY = 0.85;
const PHOTO_FORMAT = 'image/jpeg';

class CameraCapture {
    constructor() {
        this.stream = null;
        this.videoElement = null;
        this.canvasElement = null;
    }

    async initialize(videoElement) {
        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error('Camera not supported in this browser');
        }

        this.videoElement = videoElement;

        try {
            this.stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
            this.videoElement.srcObject = this.stream;
            await this.videoElement.play();
            return true;
        } catch (error) {
            throw new Error(`Camera access denied: ${error.message}`);
        }
    }

    capturePhoto() {
        if (!this.videoElement || !this.stream) {
            throw new Error('Camera not initialized');
        }

        if (!this.canvasElement) {
            this.canvasElement = document.createElement('canvas');
        }

        const video = this.videoElement;
        this.canvasElement.width = video.videoWidth;
        this.canvasElement.height = video.videoHeight;

        const context = this.canvasElement.getContext('2d');
        context.drawImage(video, 0, 0);

        return this.canvasElement.toDataURL(PHOTO_FORMAT, PHOTO_QUALITY);
    }

    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        if (this.videoElement) {
            this.videoElement.srcObject = null;
        }
    }

    isActive() {
        return this.stream !== null && this.stream.active;
    }
}
