# BookNest — Local Development Setup Guide

This guide walks you through setting up, configuring, and running the BookNest development environment on your local machine.

---

## 1. Prerequisites

Ensure your development machine has the following tools installed:
- **Node.js**: v18.0.0 or later (Node 20+ recommended)
- **npm**: v9.0.0 or later
- **Git**: v2.30.0 or later
- Modern browser (Chrome, Edge, Firefox, or Safari) with camera support for testing the optical scanner.

---

## 2. Step-by-Step Installation

### Step 1: Clone Repository
```bash
git clone https://github.com/guravneha246/book-nest.git
cd book-nest
```

### Step 2: Install Dependencies
Install all required Node dependencies for both frontend and backend:
```bash
npm install
```

### Step 3: Configure Environment Variables
Copy the example environment configuration to `.env`:
```bash
cp .env.example .env
```
*(On Windows PowerShell: `Copy-Item .env.example .env`)*

Open `.env` in your editor and adjust any desired values:
```ini
# Port where Vite will serve the frontend
APP_URL="http://localhost:3000"

# Optional: Google Gemini API Key for live AI Reading Advisor recommendations
GEMINI_API_KEY=""

# Optional: Google OAuth credentials for Google SSO
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""

# Secret key for JWT sessions (uses built-in dev fallback in development)
JWT_SECRET="booknest-campus-secure-token-2026"
```

> **Note on AI Recommendations**: If `GEMINI_API_KEY` is not provided, BookNest will automatically activate its built-in catalog fallback engine, returning top campus titles without failing.

---

## 3. Database Initialization & Seeding

BookNest uses SQLite in Write-Ahead Logging (`WAL`) mode with an embedded database stored at `data/booknest.db`.

On the very first launch, the backend automatically initializes all tables and seeds:
- Over 300 academic and campus books across all curriculum categories.
- Pre-configured discount coupons (e.g. `WELCOME10` for 10% off).
- Demo user accounts for instant testing:
  - **Demo Student**: `user@booknest.com` / `User@123`
  - **Demo Administrator**: `admin@booknest.com` / `Admin@123`

---

## 4. Running the Development Server

Start the full-stack development environment with a single command:
```bash
npm run dev
```

This concurrently starts:
1. **Backend Express API**: Running at `http://localhost:5000`
2. **Frontend Vite Server**: Running at `http://localhost:3000` (automatically proxies `/api` to port 5000)

Open your browser and navigate to:
```text
http://localhost:3000
```

---

## 5. Development Shortcuts & Credentials

For fast manual testing, click the **"Sign In / Register"** button in the top navigation bar to open the **Animated Lamp Login**. When the lamp string is pulled, quick demo buttons are available:
- **Demo Student** (`user@booknest.com` / `User@123`): Student browsing, shopping cart, orders, wishlist.
- **Demo Admin** (`admin@booknest.com` / `Admin@123`): Unlocks the top navigation **"Admin"** link to access inventory controls, sales metrics, and order dispatch workflows.
