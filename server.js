'use strict';
require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway')
    ? { rejectUnauthorized: false }
    : false,
});

// Create table on startup if it doesn't exist
pool.query(`
  CREATE TABLE IF NOT EXISTS quotes (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`).catch(err => console.error('DB init error:', err.message));

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// GET /api/quotes — return all quotes, newest first
app.get('/api/quotes', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, data, saved_at FROM quotes ORDER BY saved_at DESC LIMIT 200'
    );
    const quotes = rows.map(r => ({ ...r.data, id: r.id, savedAt: r.saved_at }));
    res.json(quotes);
  } catch (err) {
    console.error('GET /api/quotes error:', err.message);
    res.status(500).json({ error: 'Failed to load quotes' });
  }
});

// POST /api/quotes — upsert a quote (uses id from body if provided)
app.post('/api/quotes', async (req, res) => {
  const payload = req.body;
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  const id = payload.id || `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const savedAt = payload.savedAt || new Date().toISOString();
  try {
    await pool.query(
      `INSERT INTO quotes (id, data, saved_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET data = $2, saved_at = $3`,
      [id, JSON.stringify(payload), savedAt]
    );
    res.json({ ok: true, id });
  } catch (err) {
    console.error('POST /api/quotes error:', err.message);
    res.status(500).json({ error: 'Failed to save quote' });
  }
});

// DELETE /api/quotes/:id
app.delete('/api/quotes/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM quotes WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/quotes error:', err.message);
    res.status(500).json({ error: 'Failed to delete quote' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// Catch-all → serve index.html (SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Film Logic Quote Ledger running on port ${PORT}`));
