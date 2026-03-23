#!/usr/bin/env node
/**
 * Download Xenova AI model files from Hugging Face
 * - TTS (Text-to-Speech): speecht5_tts, speecht5_hifigan, speaker_embeddings (~587MB)
 * - STT (Speech-to-Text): whisper-small.en (~466MB)
 *
 * Run: node scripts/downloadModel.js
 *
 * Models will be saved to: ./models/Xenova/
 */

import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pipeline } from 'stream/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODELS_BASE_DIR = join(__dirname, '..', 'models', 'Xenova');

// Models to download
const MODELS = [
    {
        name: 'speecht5_tts',
        baseUrl: 'https://huggingface.co/Xenova/speecht5_tts/resolve/main',
        files: [
            // Config files (small, required)
            'config.json',
            'tokenizer.json',
            'tokenizer_config.json',
            'special_tokens_map.json',
            'preprocessor_config.json',
            'generation_config.json',
            'spm_char.model',

            // Full precision ONNX models (fp32 - best quality)
            'onnx/encoder_model.onnx',           // 343 MB
            'onnx/decoder_model_merged.onnx',    // 244 MB
        ]
    },
    {
        name: 'speecht5_hifigan',
        baseUrl: 'https://huggingface.co/Xenova/speecht5_hifigan/resolve/main',
        files: [
            // Config file
            'config.json',

            // Full precision vocoder model (55.4 MB)
            'onnx/model.onnx',
        ]
    },
    {
        name: 'speaker_embeddings',
        baseUrl: 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main',
        files: [
            // Speaker embeddings for voice characteristics
            'speaker_embeddings.bin',
        ]
    },
    {
        name: 'whisper-small.en',
        baseUrl: 'https://huggingface.co/Xenova/whisper-small.en/resolve/main',
        files: [
            // Config files (small, required)
            'config.json',
            'tokenizer.json',
            'tokenizer_config.json',
            'generation_config.json',
            'preprocessor_config.json',
            'normalizer.json',
            'vocab.json',
            'merges.txt',

            // Full precision ONNX models (fp32 - best quality)
            'onnx/encoder_model.onnx',           // ~298 MB
            'onnx/decoder_model_merged.onnx',    // ~168 MB
        ]
    }
];

// Download a single file with progress
async function downloadFileWithProgress(url, destPath) {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const totalSize = parseInt(response.headers.get('content-length') || '0', 10);
    let downloadedSize = 0;

    const fileStream = createWriteStream(destPath);
    const reader = response.body.getReader();

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            downloadedSize += value.length;
            fileStream.write(value);

            // Show progress
            if (totalSize > 0) {
                const percent = ((downloadedSize / totalSize) * 100).toFixed(1);
                const mbDownloaded = (downloadedSize / 1024 / 1024).toFixed(2);
                const mbTotal = (totalSize / 1024 / 1024).toFixed(2);
                process.stdout.write(`\r  Progress: ${percent}% (${mbDownloaded} MB / ${mbTotal} MB)`);
            }
        }
        fileStream.end();
        if (totalSize > 0) console.log(''); // New line after progress
    } catch (error) {
        fileStream.close();
        throw error;
    }
}

// Main download function
async function downloadModel() {
    console.log('=== Downloading Xenova AI Models (TTS + STT) ===\n');
    console.log('Downloading from Hugging Face CDN\n');

    let totalDownloaded = 0;
    let totalSkipped = 0;
    let totalFiles = 0;

    // Download each model
    for (const model of MODELS) {
        console.log(`\n📦 Model: ${model.name}`);
        console.log(`${'─'.repeat(50)}\n`);

        const modelDir = join(MODELS_BASE_DIR, model.name);
        await mkdir(modelDir, { recursive: true });

        let downloadedCount = 0;
        let skippedCount = 0;

        for (const filePath of model.files) {
            totalFiles++;
            const destPath = join(modelDir, filePath);
            const destDir = dirname(destPath);

            // Create subdirectory if needed
            await mkdir(destDir, { recursive: true });

            // Skip if file already exists
            if (existsSync(destPath)) {
                console.log(`⏭️  Skipping (exists): ${filePath}`);
                skippedCount++;
                totalSkipped++;
                continue;
            }

            const url = `${model.baseUrl}/${filePath}`;

            try {
                console.log(`\n📥 Downloading: ${filePath}`);
                await downloadFileWithProgress(url, destPath);
                console.log(`✓ Downloaded: ${filePath}`);
                downloadedCount++;
                totalDownloaded++;

            } catch (error) {
                console.error(`\n❌ Error downloading ${filePath}:`, error.message);

                // If file doesn't exist in repo, try without _quantized suffix
                if (error.message.includes('404') && filePath.includes('_quantized')) {
                    console.log(`⚠️  Quantized version not found, trying standard version...`);
                    const standardPath = filePath.replace('_quantized', '');
                    const standardUrl = `${model.baseUrl}/${standardPath}`;

                    try {
                        await downloadFileWithProgress(standardUrl, destPath);
                        console.log(`✓ Downloaded: ${standardPath}`);
                        downloadedCount++;
                        totalDownloaded++;
                    } catch (err) {
                        console.error(`❌ Also failed to download ${standardPath}:`, err.message);
                    }
                }
            }
        }

        console.log(`\n  ${model.name}: ✓ ${downloadedCount} downloaded, ⏭️  ${skippedCount} skipped`);
    }

    console.log('\n' + '═'.repeat(50));
    console.log('=== Download Summary ===');
    console.log(`✓ Downloaded: ${totalDownloaded} files`);
    console.log(`⏭️  Skipped: ${totalSkipped} files`);
    console.log(`📊 Total: ${totalFiles} files`);
    console.log(`\n✅ Model files saved to: ${MODELS_BASE_DIR}`);
    console.log('\n💡 The models will be loaded from local disk on next run!\n');
}

// Run the download
downloadModel().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
