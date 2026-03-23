// Gemini AI processor for vocabulary standardization

class GeminiProcessor {
    constructor() {
        this.apiKey = localStorage.getItem('gemini_api_key') || '';
    }

    setApiKey(key) {
        this.apiKey = key;
        localStorage.setItem('gemini_api_key', key);
    }

    getApiKey() {
        return this.apiKey;
    }

    hasApiKey() {
        return this.apiKey.length > 0;
    }

    async processVocabulary(rawText) {
        if (!this.apiKey) {
            throw new Error('Gemini API key not set');
        }

        const prompt = `Convert the following vocabulary list into a standardized format. Each vocabulary entry should be formatted as:

1. word/phrase: (part of speech) Vietnamese meaning /IPA pronunciation/

Important rules:
- Extract the English word or phrase
- Identify part of speech: (n) noun, (v) verb, (adj) adjective, (adv) adverb, (prep) preposition, (conj) conjunction, (pron) pronoun
- Provide Vietnamese meaning
- Add IPA pronunciation in forward slashes (use standard IPA symbols)
- If IPA is not provided in input, add the correct IPA pronunciation
- Output one entry per line
- Number each entry (1. 2. 3. etc.)
- Remove any extra formatting or explanations

Input vocabulary:
${rawText}

Output only the formatted vocabulary list:`;

        return await this._callGeminiAPI(prompt);
    }

    async enrichVocabulary(wordList, context = '') {
        if (!this.apiKey) {
            throw new Error('Gemini API key not set');
        }

        const contextSection = context.trim()
            ? `\n\nContext where these words are used:\n${context}\n\nUse this context to determine the most appropriate meaning, part of speech, and usage for each word.`
            : '';

        const prompt = `You are a vocabulary learning assistant. Given a list of English words/phrases, provide Vietnamese meaning, part of speech, and IPA pronunciation for each.

Output format for each word:
1. word/phrase: (part of speech) Vietnamese meaning /IPA pronunciation/

Important rules:
- Part of speech: (n) noun, (v) verb, (adj) adjective, (adv) adverb, (prep) preposition, (conj) conjunction, (pron) pronoun, (phrase) phrase
- Provide the most common/appropriate Vietnamese translation
- If context is provided, use it to determine the correct meaning and usage
- Use standard IPA pronunciation symbols in forward slashes
- For multi-word phrases, provide the complete phrase pronunciation
- Output one entry per line
- Number each entry (1. 2. 3. etc.)
- Do not add explanations or notes, only the formatted entries${contextSection}

English words/phrases to enrich:
${wordList}

Output only the formatted vocabulary list:`;

        return await this._callGeminiAPI(prompt);
    }

    async _callGeminiAPI(prompt) {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${this.apiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: prompt
                        }]
                    }],
                    generationConfig: {
                        temperature: 0.1,
                        maxOutputTokens: 4096,
                    }
                })
            }
        );

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'Gemini API error');
        }

        const data = await response.json();
        const processedText = data.candidates[0].content.parts[0].text;
        console.log('Gemini processed text:', processedText);
        return processedText;
    }
}

// Export for use in other scripts
window.GeminiProcessor = GeminiProcessor;