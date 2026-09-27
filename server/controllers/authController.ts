import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../database/index.js';
import { generateToken, AuthRequest } from '../middleware/auth.js';
import { config } from '../config/index.js';

export const authController = {
  // POST /api/auth/register
  register: (req: Request, res: Response) => {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
    if (existing) {
      return res.status(400).json({ error: 'An account with this email address already exists.' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const result = db.prepare(`
      INSERT INTO users (name, email, password_hash, role, phone, joined_date)
      VALUES (?, ?, ?, 'user', ?, 'Today')
    `).run(name.trim(), normalizedEmail, passwordHash, phone || null);

    const newUser = db.prepare('SELECT id, name, email, role, phone, joined_date as joinedDate FROM users WHERE id = ?').get(result.lastInsertRowid) as any;
    const token = generateToken({ id: newUser.id, email: newUser.email, role: newUser.role, name: newUser.name });

    res.status(201).json({
      user: newUser,
      token
    });
  },

  // POST /api/auth/login
  login: (req: Request, res: Response) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail) as any;
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const isValid = bcrypt.compareSync(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const userSession = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      joinedDate: user.joined_date
    };

    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name
    });

    res.json({
      user: userSession,
      token
    });
  },

  // POST /api/auth/logout
  logout: (req: Request, res: Response) => {
    res.json({ message: 'Logged out successfully.' });
  },

  // GET /api/auth/me
  getMe: (req: AuthRequest, res: Response) => {
    const user = db.prepare('SELECT id, name, email, role, phone, joined_date as joinedDate FROM users WHERE id = ?').get(req.user?.id) as any;
    if (!user) {
      return res.status(404).json({ error: 'User profile not found.' });
    }
    res.json({ user });
  },

  // GET /api/auth/demo-users
  getDemoUsers: (req: Request, res: Response) => {
    res.json({
      student: {
        email: 'user@booknest.com',
        password: 'User@123',
        name: 'Aditya Chauhan (Student)'
      },
      admin: {
        email: 'admin@booknest.com',
        password: 'Admin@123',
        name: 'Campus Administrator'
      }
    });
  },

  // GET /api/auth/google
  googleAuth: (req: Request, res: Response) => {
    if (!config.googleClientId || !config.googleClientId.trim() || config.googleClientId === 'MY_GOOGLE_CLIENT_ID') {
      return res.redirect(`${config.appUrl}/?auth_error=google_oauth_unconfigured`);
    }

    const redirectUri = `${config.appUrl}/api/auth/google/callback`;
    const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    googleAuthUrl.searchParams.set('client_id', config.googleClientId);
    googleAuthUrl.searchParams.set('redirect_uri', redirectUri);
    googleAuthUrl.searchParams.set('response_type', 'code');
    googleAuthUrl.searchParams.set('scope', 'openid email profile');
    googleAuthUrl.searchParams.set('access_type', 'offline');
    googleAuthUrl.searchParams.set('prompt', 'select_account');

    res.redirect(googleAuthUrl.toString());
  },

  // GET /api/auth/google/callback
  googleCallback: async (req: Request, res: Response) => {
    const { code, error } = req.query;

    if (error) {
      return res.redirect(`${config.appUrl}/?auth_error=${encodeURIComponent(String(error))}`);
    }

    if (!code || typeof code !== 'string') {
      return res.redirect(`${config.appUrl}/?auth_error=missing_authorization_code`);
    }

    try {
      const redirectUri = `${config.appUrl}/api/auth/google/callback`;
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: config.googleClientId,
          client_secret: config.googleClientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code'
        })
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        console.error('Google token exchange error:', errText);
        return res.redirect(`${config.appUrl}/?auth_error=token_exchange_failed`);
      }

      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token;

      // Fetch user profile from Google UserInfo endpoint
      const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!userRes.ok) {
        return res.redirect(`${config.appUrl}/?auth_error=failed_fetching_profile`);
      }

      const profile = await userRes.json();
      const email = String(profile.email || '').trim().toLowerCase();
      const name = String(profile.name || email.split('@')[0] || 'Campus Scholar').trim();
      const googleId = String(profile.sub || '');
      const avatarUrl = profile.picture || null;

      if (!email) {
        return res.redirect(`${config.appUrl}/?auth_error=email_not_provided_by_google`);
      }

      // Check if user exists by email
      let user = db.prepare('SELECT id, name, email, role, phone, joined_date as joinedDate FROM users WHERE email = ?').get(email) as any;

      if (!user) {
        const dummyPasswordHash = bcrypt.hashSync(Math.random().toString(36), 10);
        const insertRes = db.prepare(`
          INSERT INTO users (name, email, password_hash, role, google_id, avatar_url, joined_date)
          VALUES (?, ?, ?, 'user', ?, ?, 'Today')
        `).run(name, email, dummyPasswordHash, googleId, avatarUrl);

        user = db.prepare('SELECT id, name, email, role, phone, joined_date as joinedDate FROM users WHERE id = ?').get(insertRes.lastInsertRowid) as any;
      } else {
        // Link google_id and update avatar
        try {
          db.prepare('UPDATE users SET google_id = COALESCE(google_id, ?), avatar_url = COALESCE(avatar_url, ?) WHERE id = ?')
            .run(googleId, avatarUrl, user.id);
        } catch {}
      }

      const token = generateToken({
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name
      });

      res.redirect(`${config.appUrl}/?token=${token}&auth_success=google`);
    } catch (err: any) {
      console.error('Google OAuth callback error:', err);
      res.redirect(`${config.appUrl}/?auth_error=${encodeURIComponent(err.message || 'unknown_oauth_error')}`);
    }
  },

  // POST /api/auth/google (Credential or Token Authentication)
  googleLogin: async (req: Request, res: Response) => {
    const { credential, email: directEmail, name: directName, googleId: directGoogleId } = req.body;

    let email = '';
    let name = '';
    let googleId = '';
    let avatarUrl: string | null = null;

    if (credential && typeof credential === 'string') {
      try {
        // Decode Google JWT credential
        const parts = credential.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
          email = String(payload.email || '').trim().toLowerCase();
          name = String(payload.name || email.split('@')[0] || 'Campus Scholar').trim();
          googleId = String(payload.sub || '');
          avatarUrl = payload.picture || null;
        }
      } catch (err) {
        return res.status(400).json({ error: 'Invalid Google credential token.' });
      }
    } else if (directEmail) {
      email = String(directEmail).trim().toLowerCase();
      name = String(directName || email.split('@')[0] || 'Campus Scholar').trim();
      googleId = String(directGoogleId || 'google_' + Date.now());
    }

    if (!email) {
      return res.status(400).json({ error: 'Valid email is required for Google sign-in.' });
    }

    let user = db.prepare('SELECT id, name, email, role, phone, joined_date as joinedDate FROM users WHERE email = ?').get(email) as any;

    if (!user) {
      const dummyPasswordHash = bcrypt.hashSync(Math.random().toString(36), 10);
      const insertRes = db.prepare(`
        INSERT INTO users (name, email, password_hash, role, google_id, avatar_url, joined_date)
        VALUES (?, ?, ?, 'user', ?, ?, 'Today')
      `).run(name, email, dummyPasswordHash, googleId, avatarUrl);

      user = db.prepare('SELECT id, name, email, role, phone, joined_date as joinedDate FROM users WHERE id = ?').get(insertRes.lastInsertRowid) as any;
    } else {
      try {
        db.prepare('UPDATE users SET google_id = COALESCE(google_id, ?), avatar_url = COALESCE(avatar_url, ?) WHERE id = ?')
          .run(googleId, avatarUrl, user.id);
      } catch {}
    }

    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name
    });

    res.json({
      user,
      token
    });
  }
};

