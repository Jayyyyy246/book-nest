import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  jwtSecret: process.env.JWT_SECRET || 'booknest-campus-secure-token-2026',
  jwtExpiresIn: '7d',
  nodeEnv: process.env.NODE_ENV || 'development',
  dataDir: path.resolve(process.cwd(), 'data'),
  dbPath: path.resolve(process.cwd(), 'data', 'booknest.db'),
  uploadLimit: '10mb',
  openLibraryBaseUrl: 'https://openlibrary.org/api/books',
  defaultPageLimit: 50,
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  appUrl: process.env.APP_URL || 'http://localhost:3000',
};

