import fs from 'fs';
import path from 'path';
import { SiteSettings, StoredSettingsFile } from './types.js';

const SETTINGS_FILE_PATH = path.resolve(process.cwd(), 'data/settings.json');

// Reusable safe URL validator
export function isValidUrl(rawUrl: string, allowInternalHash = true): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();
  if (allowInternalHash && (trimmed.startsWith('#') || trimmed.startsWith('/'))) {
    // Check for dangerous injection in internal URLs
    if (trimmed.toLowerCase().includes('javascript:') || trimmed.toLowerCase().includes('data:')) {
      return false;
    }
    return true;
  }
  try {
    const parsed = new URL(trimmed);
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

// Sanitize string to prevent XSS
export function sanitizeString(str: unknown, maxLen = 2000): string {
  if (typeof str !== 'string') return '';
  return str
    .slice(0, maxLen)
    .replace(/[<>]/g, '') // remove raw angle brackets
    .trim();
}

export function loadSettingsFile(): StoredSettingsFile {
  try {
    if (!fs.existsSync(SETTINGS_FILE_PATH)) {
      throw new Error('Settings file not found');
    }
    const data = fs.readFileSync(SETTINGS_FILE_PATH, 'utf-8');
    return JSON.parse(data) as StoredSettingsFile;
  } catch (err) {
    console.error('Error reading settings file, loading backup/defaults:', err);
    throw err;
  }
}

export function saveSettingsFile(data: StoredSettingsFile): void {
  const dir = path.dirname(SETTINGS_FILE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  // Write to temporary file and rename for atomic write
  const tempPath = `${SETTINGS_FILE_PATH}.tmp.${Date.now()}`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tempPath, SETTINGS_FILE_PATH);
}

export function getPublishedSettings(): SiteSettings {
  const file = loadSettingsFile();
  return file.published;
}

export function getDraftSettings(): SiteSettings {
  const file = loadSettingsFile();
  return file.draft || file.published;
}

export function saveDraftSettings(newDraft: SiteSettings): SiteSettings {
  const file = loadSettingsFile();
  // Ensure validation and sanitize
  const sanitizedDraft: SiteSettings = {
    ...newDraft,
    version: (file.published.version || 1) + 1,
    lastUpdated: new Date().toISOString(),
    buttons: (newDraft.buttons || []).map((btn) => ({
      ...btn,
      id: sanitizeString(btn.id, 50) || `btn-${Date.now()}`,
      label: sanitizeString(btn.label, 100),
      url: isValidUrl(btn.url) ? btn.url.trim() : '#',
    })),
  };

  file.draft = sanitizedDraft;
  saveSettingsFile(file);
  return sanitizedDraft;
}

export function publishDraftSettings(): SiteSettings {
  const file = loadSettingsFile();
  const draft = file.draft || file.published;
  draft.lastUpdated = new Date().toISOString();
  draft.version = (file.published.version || 1) + 1;

  file.published = draft;
  file.draft = null; // Clear draft after publishing
  saveSettingsFile(file);
  return file.published;
}

export function resetSettingsToFactory(): SiteSettings {
  const file = loadSettingsFile();
  // Keep original published base structure but reset to factory defaults
  const factoryPath = SETTINGS_FILE_PATH;
  const initial = JSON.parse(fs.readFileSync(factoryPath, 'utf-8')) as StoredSettingsFile;
  file.published = initial.published;
  file.draft = null;
  saveSettingsFile(file);
  return file.published;
}
