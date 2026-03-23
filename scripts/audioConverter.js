/**
 * Audio Converter Utility
 * Converts audio blobs to MP3 format using FFmpeg WASM
 * Falls back to original format if FFmpeg is unavailable
 */

class AudioConverter {
    constructor() {
        this.ffmpeg = null;
        this.loaded = false;
        this.loading = false;
        this.ffmpegAvailable = false;
    }

    async initialize() {
        if (this.loaded) return this.ffmpegAvailable;
        if (this.loading) {
            // Wait for existing load to complete
            return new Promise((resolve) => {
                const checkInterval = setInterval(() => {
                    if (this.loaded || !this.loading) {
                        clearInterval(checkInterval);
                        resolve(this.ffmpegAvailable);
                    }
                }, 100);
            });
        }

        this.loading = true;

        try {
            // Try to import FFmpeg dynamically
            const ffmpegModule = await import('./ffmpeg/classes.js');
            const utilModule = await import('./ffmpeg/index.js');

            this.FFmpeg = ffmpegModule.FFmpeg;
            this.fetchFile = utilModule.fetchFile;

            this.ffmpeg = new this.FFmpeg();

            // Load FFmpeg core
            await this.ffmpeg.load({
                coreURL: 'scripts/ffmpeg/ffmpeg-core.js',
                wasmURL: 'scripts/ffmpeg/ffmpeg-core.wasm',
                workerURL: 'scripts/ffmpeg/ffmpeg-core.worker.js'
            });

            this.loaded = true;
            this.loading = false;
            this.ffmpegAvailable = true;
            console.log('AudioConverter: FFmpeg loaded successfully');
            return true;

        } catch (error) {
            console.warn('AudioConverter: FFmpeg not available, will use fallback:', error.message);
            this.loading = false;
            this.loaded = true;
            this.ffmpegAvailable = false;
            return false;
        }
    }

    /**
     * Convert audio blob to MP3 format
     * @param {Blob} audioBlob - The source audio blob (webm, ogg, etc.)
     * @param {string} inputFormat - Input format (e.g., 'webm', 'ogg')
     * @returns {Promise<{blob: Blob, format: string}>} - Converted blob and format
     */
    async convertToMp3(audioBlob, inputFormat = 'webm') {
        await this.initialize();

        // If FFmpeg not available, return original
        if (!this.ffmpegAvailable) {
            console.log('AudioConverter: Using original format (FFmpeg not available)');
            return { blob: audioBlob, format: inputFormat };
        }

        const inputFileName = `input.${inputFormat}`;
        const outputFileName = 'output.mp3';

        try {
            // Write input file to FFmpeg virtual filesystem
            const inputData = await this.fetchFile(audioBlob);
            await this.ffmpeg.writeFile(inputFileName, inputData);

            // Convert to MP3
            await this.ffmpeg.exec([
                '-i', inputFileName,
                '-codec:a', 'libmp3lame',
                '-qscale:a', '2',  // High quality
                '-ar', '44100',    // Sample rate
                '-ac', '2',        // Stereo
                outputFileName
            ]);

            // Read output file
            const outputData = await this.ffmpeg.readFile(outputFileName);

            // Cleanup
            await this.ffmpeg.deleteFile(inputFileName);
            await this.ffmpeg.deleteFile(outputFileName);

            // Create MP3 blob
            const mp3Blob = new Blob([outputData.buffer], { type: 'audio/mpeg' });
            return { blob: mp3Blob, format: 'mp3' };

        } catch (error) {
            console.error('AudioConverter: Conversion failed, using original:', error);
            return { blob: audioBlob, format: inputFormat };
        }
    }

    /**
     * Download audio file (MP3 if possible, otherwise original format)
     * @param {Blob} audioBlob - The source audio blob
     * @param {string} fileName - Desired filename (without extension)
     * @param {string} inputFormat - Input format
     */
    async downloadAudio(audioBlob, fileName = 'recording', inputFormat = 'webm') {
        try {
            // Skip FFmpeg on mobile - too resource intensive
            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

            let blob = audioBlob;
            let format = inputFormat;

            if (!isMobile) {
                const result = await this.convertToMp3(audioBlob, inputFormat);
                blob = result.blob;
                format = result.format;
            } else {
                console.log('AudioConverter: Skipping MP3 conversion on mobile');
            }

            // Create download - use different approach for iOS
            const url = URL.createObjectURL(blob);

            if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
                // iOS: Open in new tab (download not well supported)
                window.open(url, '_blank');
            } else {
                const link = document.createElement('a');
                link.href = url;
                link.download = `${fileName}.${format}`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }

            // Cleanup
            setTimeout(() => URL.revokeObjectURL(url), 5000);

            return { blob, format };
        } catch (error) {
            console.error('AudioConverter: Download failed:', error);
            // Fallback: download original
            const url = URL.createObjectURL(audioBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${fileName}.${inputFormat}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            return { blob: audioBlob, format: inputFormat };
        }
    }

    /**
     * Check if MP3 conversion is available
     */
    async isConversionAvailable() {
        await this.initialize();
        return this.ffmpegAvailable;
    }
}

// Create singleton instance
window.audioConverter = new AudioConverter();
