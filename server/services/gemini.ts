import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY;

export const ai = apiKey && apiKey !== 'MY_GEMINI_API_KEY' ? new GoogleGenAI({ apiKey }) : null;

export interface ExtractedBookMetadata {
  title?: string;
  author?: string;
  publisher?: string;
  isbn?: string;
  rawTextLines?: string[];
  hasOcrData: boolean;
  notes?: string;
}

/**
 * Analyzes a book cover image base64 data to extract title, author, publisher, and ISBN.
 * Strictly extracts real visible text without hallucination.
 */
export async function analyzeBookCover(
  imageBase64: string,
  mimeType = 'image/jpeg'
): Promise<ExtractedBookMetadata | null> {
  if (!ai) {
    return null;
  }

  try {
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9.+_-]+;base64,/, '');

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `You are a high-precision optical book scanner and barcode OCR analyzer.
Inspect this image carefully. Extract ONLY real text and barcodes actually visible in this image.
Do NOT guess, invent, or hallucinate titles or authors.

Return a valid JSON object with the following schema:
{
  "title": string or null (the prominent book title if legible),
  "author": string or null (author name if visible),
  "publisher": string or null (publisher name or imprint if visible),
  "isbn": string or null (10 or 13 digit barcode/ISBN numbers if visible, no hyphens),
  "rawTextLines": array of string (prominent visible text lines in reading order),
  "isBook": boolean (true if image depicts a book cover, spine, or barcode, false otherwise)
}

Output ONLY the JSON object. Do not wrap in markdown tags or add conversational text.`
            },
            {
              inlineData: {
                data: cleanBase64,
                mimeType
              }
            }
          ]
        }
      ]
    });

    const rawText = response.text || '';
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      title: parsed.title ? String(parsed.title).trim() : undefined,
      author: parsed.author ? String(parsed.author).trim() : undefined,
      publisher: parsed.publisher ? String(parsed.publisher).trim() : undefined,
      isbn: parsed.isbn ? String(parsed.isbn).replace(/[^0-9X]/gi, '') : undefined,
      rawTextLines: Array.isArray(parsed.rawTextLines) ? parsed.rawTextLines.map((l: any) => String(l).trim()).filter(Boolean) : [],
      hasOcrData: Boolean(parsed.title || parsed.author || parsed.isbn || (parsed.rawTextLines && parsed.rawTextLines.length > 0)),
      notes: parsed.isBook === false ? 'Image does not appear to be a book or textbook.' : undefined
    };
  } catch (err) {
    console.error('Gemini vision analysis error:', err);
    return null;
  }
}
