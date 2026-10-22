import express, { Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import {
  getPublishedSettings,
  getDraftSettings,
  saveDraftSettings,
  publishDraftSettings,
  resetSettingsToFactory,
} from './src/server/settingsManager.js';
import {
  verifyOwnerKey,
  createSessionToken,
  requireOwnerAuth,
  checkRateLimit,
  recordFailedAttempt,
  resetAttempts,
  verifySessionToken,
} from './src/server/authMiddleware.js';

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// Express middleware
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(cookieParser());

// Static uploads directory
const UPLOADS_DIR = path.resolve(process.cwd(), 'public/uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
app.use('/uploads', express.static(UPLOADS_DIR));

/* =====================================================================
   PUBLIC API ENDPOINTS
   ===================================================================== */

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    brand: 'MPZ HUB',
    timestamp: new Date().toISOString(),
  });
});

// Get settings: public visitors receive published settings;
// authenticated owners can request `?draft=true` to preview unsaved changes.
app.get('/api/settings', (req: Request, res: Response) => {
  try {
    const isDraftRequested = req.query.draft === 'true';
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const cookieToken = req.cookies?.mpz_owner_session;
    const isOwner = verifySessionToken(bearerToken || cookieToken);

    if (isDraftRequested && isOwner) {
      const draft = getDraftSettings();
      res.json({ settings: draft, isDraft: true });
    } else {
      const published = getPublishedSettings();
      res.json({ settings: published, isDraft: false });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to load settings';
    res.status(500).json({ error: msg });
  }
});

/* =====================================================================
   OWNER AUTHENTICATION ENDPOINTS
   ===================================================================== */

// Owner Login with rate limiting
app.post('/api/owner/login', (req: Request, res: Response) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const { allowed, remainingWaitMs } = checkRateLimit(ip);

  if (!allowed) {
    const minutes = Math.ceil(remainingWaitMs / 60000);
    res.status(429).json({
      error: `Too many failed attempts. Access locked for ${minutes} minute(s).`,
      locked: true,
      retryAfterMinutes: minutes,
    });
    return;
  }

  const { ownerKey } = req.body;
  if (!ownerKey || typeof ownerKey !== 'string') {
    recordFailedAttempt(ip);
    res.status(400).json({ error: 'Owner key is required' });
    return;
  }

  const isValid = verifyOwnerKey(ownerKey.trim());
  if (!isValid) {
    recordFailedAttempt(ip);
    res.status(401).json({
      error: 'Invalid Owner Key. Verify your secret configuration.',
    });
    return;
  }

  // Success: reset rate limit & issue token
  resetAttempts(ip);
  const token = createSessionToken();

  res.cookie('mpz_owner_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000,
    path: '/',
  });

  res.json({
    success: true,
    token,
    brand: 'MPZ HUB',
    message: 'Authenticated successfully as MPZ HUB Owner',
  });
});

// Owner Logout
app.post('/api/owner/logout', (_req: Request, res: Response) => {
  res.clearCookie('mpz_owner_session', { path: '/' });
  res.json({ success: true, message: 'Logged out successfully' });
});

// Verify Owner Session
app.get('/api/owner/session', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const cookieToken = req.cookies?.mpz_owner_session;
  const token = bearerToken || cookieToken;

  if (verifySessionToken(token)) {
    res.json({
      authenticated: true,
      brand: 'MPZ HUB',
      expiresInHours: 8,
    });
  } else {
    res.status(401).json({ authenticated: false });
  }
});

/* =====================================================================
   PROTECTED OWNER DASHBOARD API ENDPOINTS
   ===================================================================== */

// Save Draft Settings
app.post('/api/owner/settings/draft', requireOwnerAuth, (req: Request, res: Response) => {
  try {
    const updated = saveDraftSettings(req.body);
    res.json({ success: true, settings: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error saving draft';
    res.status(500).json({ error: msg });
  }
});

// Publish Draft Settings to Public Site
app.post('/api/owner/settings/publish', requireOwnerAuth, (req: Request, res: Response) => {
  try {
    const published = publishDraftSettings();
    res.json({
      success: true,
      settings: published,
      message: 'Settings successfully published to MPZ HUB!',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error publishing settings';
    res.status(500).json({ error: msg });
  }
});

// Reset Settings to Factory Defaults
app.post('/api/owner/settings/reset', requireOwnerAuth, (_req: Request, res: Response) => {
  try {
    const restored = resetSettingsToFactory();
    res.json({
      success: true,
      settings: restored,
      message: 'Factory settings restored successfully',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error resetting settings';
    res.status(500).json({ error: msg });
  }
});

// Upload Image Endpoint
app.post('/api/owner/images/upload', requireOwnerAuth, (req: Request, res: Response) => {
  try {
    const { base64Data, filename, contentType } = req.body;
    if (!base64Data || !filename) {
      res.status(400).json({ error: 'Missing base64Data or filename' });
      return;
    }

    const allowedMime = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
    if (contentType && !allowedMime.includes(contentType)) {
      res.status(400).json({ error: 'Unsupported file type. Use PNG, JPEG, WebP, or SVG.' });
      return;
    }

    // Clean base64 header if present
    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    if (buffer.length > 8 * 1024 * 1024) {
      res.status(400).json({ error: 'Image size exceeds maximum limit of 8MB' });
      return;
    }

    const ext = path.extname(filename).toLowerCase() || '.png';
    const safeBaseName = path.basename(filename, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeName = `mpz_${Date.now()}_${safeBaseName}${ext}`;
    const targetFile = path.join(UPLOADS_DIR, safeName);

    fs.writeFileSync(targetFile, buffer);

    res.json({
      success: true,
      url: `/uploads/${safeName}`,
      filename: safeName,
      size: buffer.length,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to save image';
    res.status(500).json({ error: msg });
  }
});

/* =====================================================================
   SERVER INITIALIZATION & VITE MIDDLEWARES
   ===================================================================== */

async function startServer() {
  if (!isProd) {
    // Development mode: Vite dev server middleware
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production mode: Serve built static files
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`[MPZ HUB] Full-stack server running on port ${PORT} (${isProd ? 'production' : 'development'})`);
  });
}

startServer().catch((err) => {
  console.error('[MPZ HUB] Fatal server error:', err);
  process.exit(1);
});
