# BookNest — Troubleshooting Guide

This guide provides solutions to common development issues, runtime errors, and environment edge cases.

---

## 1. Port Conflicts

### Symptom
```text
Error: listen EADDRINUSE: address already in use :::5000
```
or
```text
Port 3000 is in use, trying another one...
```

### Cause
A previous instance of the Node backend (port 5000) or Vite dev server (port 3000) is still running in the background.

### Solution
Kill the process occupying the port:

**On Windows (PowerShell):**
```powershell
Get-Process -Id (Get-NetTCPConnection -LocalPort 5000).OwningProcess | Stop-Process -Force
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process -Force
```

**On macOS / Linux:**
```bash
lsof -ti:5000 | xargs kill -9
lsof -ti:3000 | xargs kill -9
```

---

## 2. SQLite Database File Locks

### Symptom
```text
SqliteError: database is locked
```

### Cause
SQLite operates in `WAL` mode. If multiple processes hold write locks or a process terminates abnormally, a lock can persist temporarily.

### Solution
1. Ensure only one backend server process is running.
2. If persistent, close the dev server and delete temporary WAL journal files:
   ```bash
   rm -f data/booknest.db-wal data/booknest.db-shm
   ```
   *(Do NOT delete `data/booknest.db`)*

---

## 3. Optical Scanner Camera Permissions

### Symptom
The optical barcode/cover scanner shows "Camera access denied" or a black box.

### Solution
1. Verify browser permissions: Click the site info icon next to the URL bar (e.g. `http://localhost:3000`) and ensure **Camera** is set to **Allow**.
2. Note that camera access in browsers requires either `https://` or `http://localhost`. Accessing via local IP (e.g. `http://192.168.1.5:3000`) will be blocked by browser security policies unless an HTTPS certificate is used.
3. If no physical webcam is connected, use the **"Upload Book Cover"** tab or the **"Sample Academic Book"** button for instant testing.

---

## 4. Gemini AI Reading Advisor Fallbacks

### Symptom
Console logs show `[AI Advisor] Stage: mock_provider_success` or fallback recommendations are returned instead of dynamic model output.

### Cause
`GEMINI_API_KEY` is not set or has reached quota limits in `.env`.

### Solution
This is expected and intended behavior. BookNest is designed with multi-tier resilience:
- In the absence of an API key, the system automatically falls back to local campus catalog matching without throwing errors or breaking the UI.
- To enable live generative AI responses, obtain an API key from Google AI Studio and configure `GEMINI_API_KEY` in `.env`.
