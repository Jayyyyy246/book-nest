import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../database/index.js';
import { generateToken, AuthRequest } from '../middleware/auth.js';

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
  }
};
