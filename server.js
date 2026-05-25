const express = require('express');
const mysql = require('mysql2/promise');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const UAParser = require('ua-parser-js');
const path = require('path');
const http = require('http');
const fs = require('fs');
const cron = require('node-cron');
require('dotenv').config();

const app = express();
app.set('trust proxy', true);
const PORT = process.env.PORT || 3091;

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const leadLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: { success: false, message: 'Too many submissions. Please try again later.' } });

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'sobha@blr2026';

const disposableDomains = new Set(['mailinator.com','guerrillamail.com','tempmail.com','throwaway.email','yopmail.com','sharklasers.com','grr.la','tempail.com','temp-mail.org','fakeinbox.com','trashmail.com','dispostable.com','maildrop.cc','mailnesia.com','10minutemail.com']);

// MySQL Connection Pool
let pool;
async function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
    });
  }
  return pool;
}

async function initDB() {
  const db = await getPool();
  await db.execute(`CREATE TABLE IF NOT EXISTS leads (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) DEFAULT '',
    phone VARCHAR(50) NOT NULL,
    country_code VARCHAR(10) DEFAULT '+91',
    device VARCHAR(50) DEFAULT 'desktop',
    browser VARCHAR(100) DEFAULT '',
    os VARCHAR(100) DEFAULT '',
    city VARCHAR(100) DEFAULT 'Unknown',
    country VARCHAR(100) DEFAULT 'Unknown',
    ip VARCHAR(50) DEFAULT '',
    referrer TEXT,
    source VARCHAR(50) DEFAULT 'website',
    utm_source VARCHAR(100) DEFAULT '',
    utm_medium VARCHAR(100) DEFAULT '',
    utm_campaign VARCHAR(100) DEFAULT '',
    is_vpn TINYINT(1) DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS settings (
    \`key\` VARCHAR(100) PRIMARY KEY,
    value TEXT
  )`);
  console.log('✅ MySQL database connected and tables ready');
}

async function dbGet(key) {
  try {
    const db = await getPool();
    const [rows] = await db.execute('SELECT value FROM settings WHERE `key` = ?', [key]);
    return rows.length ? rows[0].value : '';
  } catch { return ''; }
}

async function dbSet(key, value) {
  const db = await getPool();
  await db.execute('REPLACE INTO settings (`key`, value) VALUES (?, ?)', [key, value || '']);
}

async function getSmtpSettings() {
  return {
    host: await dbGet('smtp_host') || process.env.SMTP_HOST || '',
    port: await dbGet('smtp_port') || process.env.SMTP_PORT || '587',
    secure: await dbGet('smtp_secure') || process.env.SMTP_SECURE || 'false',
    user: await dbGet('smtp_user') || process.env.SMTP_USER || '',
    pass: await dbGet('smtp_pass') || process.env.SMTP_PASS || '',
    from: await dbGet('smtp_from') || process.env.SMTP_FROM || '',
    to: await dbGet('smtp_to') || process.env.SMTP_TO || ''
  };
}

function getClientIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers['x-real-ip'] || req.ip || req.connection?.remoteAddress;
}

function checkVPN(ip) {
  return new Promise((resolve) => {
    if (!ip || ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
      return resolve({ isVPN: false, city: 'Local', country: 'India', countryCode: 'IN' });
    }
    const cleanIP = ip.replace('::ffff:', '');
    http.get(`http://ip-api.com/json/${cleanIP}?fields=status,country,countryCode,city,proxy,hosting,query`, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { const r = JSON.parse(data); resolve({ isVPN: r.proxy || r.hosting, city: r.city || 'Unknown', country: r.country || 'Unknown', countryCode: r.countryCode || '' }); }
        catch { resolve({ isVPN: false, city: 'Unknown', country: 'Unknown', countryCode: '' }); }
      });
    }).on('error', () => resolve({ isVPN: false, city: 'Unknown', country: 'Unknown', countryCode: '' }));
  });
}

async function sendEmailNotification(lead) {
  const s = await getSmtpSettings();
  if (!s.host || !s.user || !s.pass || !s.to) {
    console.error(`[SMTP] Missing settings. Host: ${s.host}, User: ${s.user}, To: ${s.to}`);
    return;
  }
  try {
    const t = nodemailer.createTransport({ host: s.host, port: parseInt(s.port), secure: s.secure === 'true', auth: { user: s.user, pass: s.pass } });
    
    // Primary recipient gets FULL info
    console.log(`[SMTP] Sending full lead notification to primary: ${s.to}`);
    await t.sendMail({
      from: s.from || s.user,
      to: s.to,
      subject: `prajwal Lead: sobha-theoneworld.com - ${lead.name}`,
      html: `<div style="font-family:Arial;max-width:600px;margin:0 auto;background:#111;padding:24px;border-radius:12px;border:1px solid #c9a96e;">
        <h2 style="color:#c9a96e;margin-top:0;">🏠 New Lead - Sobha One World (sobha-theoneworld.com)</h2>
        <table style="width:100%;border-collapse:collapse;color:#eee;">
          <tr><td style="padding:10px;border-bottom:1px solid #333;font-weight:bold;color:#c9a96e;">Name</td><td style="padding:10px;border-bottom:1px solid #333;">${lead.name}</td></tr>
          <tr><td style="padding:10px;border-bottom:1px solid #333;font-weight:bold;color:#c9a96e;">Phone</td><td style="padding:10px;border-bottom:1px solid #333;">${lead.phone}</td></tr>
          <tr><td style="padding:10px;border-bottom:1px solid #333;font-weight:bold;color:#c9a96e;">Email</td><td style="padding:10px;border-bottom:1px solid #333;">${lead.email || 'N/A'}</td></tr>
          <tr><td style="padding:10px;border-bottom:1px solid #333;font-weight:bold;color:#c9a96e;">City</td><td style="padding:10px;border-bottom:1px solid #333;">${lead.city}</td></tr>
          <tr><td style="padding:10px;border-bottom:1px solid #333;font-weight:bold;color:#c9a96e;">Country</td><td style="padding:10px;border-bottom:1px solid #333;">${lead.country}</td></tr>
          <tr><td style="padding:10px;border-bottom:1px solid #333;font-weight:bold;color:#c9a96e;">Device</td><td style="padding:10px;border-bottom:1px solid #333;">${lead.device}</td></tr>
          <tr><td style="padding:10px;border-bottom:1px solid #333;font-weight:bold;color:#c9a96e;">Browser</td><td style="padding:10px;border-bottom:1px solid #333;">${lead.browser}</td></tr>
          <tr><td style="padding:10px;border-bottom:1px solid #333;font-weight:bold;color:#c9a96e;">IP Address</td><td style="padding:10px;border-bottom:1px solid #333;">${lead.ip}</td></tr>
          <tr><td style="padding:10px;font-weight:bold;color:#c9a96e;">Referrer</td><td style="padding:10px;">${lead.referrer || 'Direct'}</td></tr>
        </table></div>`
    });

    // CC recipient gets clean SIMPLIFIED info (Name, Phone, Email only)
    const ccEmail = await dbGet('smtp_cc') || process.env.SMTP_CC || '';
    if (ccEmail) {
      console.log(`[SMTP] Sending simplified CC lead notification to: ${ccEmail}`);
      await t.sendMail({
        from: s.from || s.user,
        to: ccEmail,
        subject: `prajwal Lead: sobha-theoneworld.com - ${lead.name}`,
        html: `<div style="font-family:Arial;max-width:600px;margin:0 auto;background:#111;padding:24px;border-radius:12px;border:1px solid #c9a96e;">
          <h2 style="color:#c9a96e;margin-top:0;">🏠 New Lead - Sobha One World</h2>
          <table style="width:100%;border-collapse:collapse;color:#eee;">
            <tr><td style="padding:10px;border-bottom:1px solid #333;font-weight:bold;color:#c9a96e;">Name</td><td style="padding:10px;border-bottom:1px solid #333;">${lead.name}</td></tr>
            <tr><td style="padding:10px;border-bottom:1px solid #333;font-weight:bold;color:#c9a96e;">Phone</td><td style="padding:10px;border-bottom:1px solid #333;">${lead.phone}</td></tr>
            <tr><td style="padding:10px;font-weight:bold;color:#c9a96e;">Email</td><td style="padding:10px;">${lead.email || 'N/A'}</td></tr>
          </table></div>`
      });
    }

    console.log(`[SMTP] Success: Notifications sent for ${lead.name}`);
  } catch (err) { console.error('[SMTP] Error:', err.message); }
}

function adminAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) return res.status(401).json({ error: 'Unauthorized' });
  const [user, pass] = Buffer.from(auth.split(' ')[1], 'base64').toString().split(':');
  if (user === ADMIN_USER && pass === ADMIN_PASS) return next();
  res.status(401).json({ error: 'Invalid credentials' });
}

// ---- ROUTES ----
app.get('/api/geo-detect', async (req, res) => {
  const ip = getClientIP(req);
  const geo = await checkVPN(ip);
  res.json({ city: geo.city, country: geo.country, countryCode: geo.countryCode, isVPN: geo.isVPN });
});

app.post('/api/leads', leadLimiter, async (req, res) => {
  try {
    const { name, email, phone, countryCode, honeypot, formLoadTime, referrer, utmSource, utmMedium, utmCampaign } = req.body;
    if (honeypot) return res.json({ success: true });
    if (formLoadTime && (Date.now() - parseInt(formLoadTime)) < 3000) return res.json({ success: true });
    if (!name || !phone) return res.status(400).json({ success: false, message: 'Name and phone number are required.' });
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 7 || cleanPhone.length > 15) return res.status(400).json({ success: false, message: 'Please enter a valid phone number.' });
    if (email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ success: false, message: 'Please enter a valid email.' });
      const domain = email.split('@')[1]?.toLowerCase();
      if (disposableDomains.has(domain)) return res.status(400).json({ success: false, message: 'Please use a valid email address.' });
    }
    const uaResult = new UAParser(req.headers['user-agent']);
    const browserName = uaResult.getBrowser().name || 'Other';
    const osName = uaResult.getOS().name || '';
    const deviceType = uaResult.getDevice().type || '';
    
    // Readable Labels Mapping
    let browser = 'Other';
    if (browserName.includes('Chrome')) browser = 'Chrome';
    else if (browserName.includes('Safari')) browser = 'Safari';
    else if (browserName.includes('Edge')) browser = 'Edge';
    else if (browserName.includes('Firefox')) browser = 'Firefox';
    else if (browserName.includes('Samsung')) browser = 'Samsung Internet';
    else if (browserName.includes('Opera')) browser = 'Opera';

    let device = 'Windows Desktop';
    if (osName === 'Android') {
      device = deviceType === 'tablet' ? 'Android Tablet' : 'Android Mobile';
    } else if (osName === 'iOS') {
      device = deviceType === 'tablet' ? 'iPad / Tablet (iOS)' : 'iPhone (iOS)';
    } else if (osName === 'Mac OS') {
      device = 'Mac Desktop';
    } else if (deviceType === 'mobile') {
      device = 'Mobile';
    } else if (deviceType === 'tablet') {
      device = 'Tablet';
    } else if (osName === 'Windows') {
      device = 'Windows Desktop';
    }

    const ip = getClientIP(req);
    const geo = await checkVPN(ip);
    
    // Strict VPN Block
    if (geo.isVPN) {
      console.warn(`[BLOCKED] VPN detected from IP: ${ip}`);
      return res.status(403).json({ success: false, message: 'VPN/Proxy detected. Please disable and try again.' });
    }

    // Rate Limit: Max 3 leads per IP if from Ads
    if (utmSource || utmMedium) {
      const db = await getPool();
      const [adsLeads] = await db.execute('SELECT COUNT(*) as count FROM leads WHERE ip = ? AND (utm_source != "" OR utm_medium != "")', [ip]);
      if (adsLeads[0].count >= 3) {
        console.warn(`[BLOCKED] Ad rate limit exceeded for IP: ${ip}`);
        return res.status(429).json({ success: false, message: 'Maximum 3 submissions allowed for ad-tracked users.' });
      }
    }

    // Phone Country Code validation mapping
    const submittedCountryCode = countryCode || '+91';
    if (geo.countryCode === 'IN' && submittedCountryCode !== '+91') {
       console.warn(`[BLOCKED] Indian IP using foreign country code ${submittedCountryCode}`);
       return res.status(400).json({ success: false, message: 'Please use a valid Indian phone number (+91).' });
    }

    const fullPhone = `${countryCode || '+91'} ${cleanPhone}`;
    const db = await getPool();
    await db.execute(
      `INSERT INTO leads (name, email, phone, country_code, device, browser, os, city, country, ip, referrer, source, utm_source, utm_medium, utm_campaign, is_vpn) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [name, email || '', fullPhone, countryCode || '+91', device, browser, osName, geo.city, geo.country, ip, referrer || '', 'website', utmSource || '', utmMedium || '', utmCampaign || '', 0]
    );
    await sendEmailNotification({ name, email, phone: fullPhone, city: geo.city, country: geo.country, device, browser, ip, referrer: referrer || '' });
    res.json({ success: true, message: 'Thank you! Our team will contact you shortly.' });
  } catch (err) { console.error('Lead error:', err); res.status(500).json({ success: false, message: 'Server error. Please try again.' }); }
});

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) return res.json({ success: true, token: Buffer.from(`${username}:${password}`).toString('base64') });
  res.status(401).json({ success: false, message: 'Invalid credentials.' });
});

app.get('/api/admin/leads', adminAuth, async (req, res) => {
  const db = await getPool();
  const [leads] = await db.execute('SELECT * FROM leads ORDER BY id DESC');
  res.json({ success: true, leads, total: leads.length });
});

app.delete('/api/admin/leads/:id', adminAuth, async (req, res) => {
  const db = await getPool();
  await db.execute('DELETE FROM leads WHERE id = ?', [parseInt(req.params.id)]);
  res.json({ success: true });
});

app.post('/api/admin/leads/bulk-delete', adminAuth, async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ success: false, message: 'No IDs provided' });
  const db = await getPool();
  const placeholders = ids.map(() => '?').join(',');
  await db.execute(`DELETE FROM leads WHERE id IN (${placeholders})`, ids);
  res.json({ success: true, message: `${ids.length} leads deleted.` });
});

app.get('/api/admin/smtp', adminAuth, async (req, res) => {
  const s = await getSmtpSettings();
  const cc = await dbGet('smtp_cc') || process.env.SMTP_CC || '';
  res.json({ success: true, smtp: { host: s.host, port: s.port, secure: s.secure, user: s.user, from: s.from, to: s.to, cc } });
});

app.post('/api/admin/smtp', adminAuth, async (req, res) => {
  const { host, port, secure, user, pass, from, to, cc } = req.body;
  await dbSet('smtp_host', host);
  await dbSet('smtp_port', port || '587');
  await dbSet('smtp_secure', secure || 'false');
  await dbSet('smtp_user', user);
  if (pass) await dbSet('smtp_pass', pass);
  await dbSet('smtp_from', from);
  await dbSet('smtp_to', to);
  await dbSet('smtp_cc', cc || '');
  res.json({ success: true, message: 'SMTP settings saved.' });
});

app.post('/api/admin/smtp/test', adminAuth, async (req, res) => {
  try {
    const s = await getSmtpSettings();
    if (!s.host || !s.user || !s.pass) return res.status(400).json({ success: false, message: 'SMTP not configured.' });
    const t = nodemailer.createTransport({ host: s.host, port: parseInt(s.port), secure: s.secure === 'true', auth: { user: s.user, pass: s.pass } });
    await t.sendMail({ from: s.from || s.user, to: s.to, subject: '✅ Sobha One World - SMTP Test', html: '<h2 style="color:#c9a96e;">SMTP is working!</h2><p>Notifications configured for sobha-theoneworld.com.</p>' });
    res.json({ success: true, message: 'Test email sent!' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.get('/api/admin/leads/export', adminAuth, async (req, res) => {
  const db = await getPool();
  const [rows] = await db.execute('SELECT * FROM leads ORDER BY id DESC');
  let csv = 'ID,Name,Email,Phone,Country Code,Device,Browser,OS,City,Country,IP,Referrer,Source,UTM Source,UTM Medium,UTM Campaign,VPN,Created At\n';
  rows.forEach(r => { csv += Object.values(r).map(v => `"${(v || '').toString().replace(/"/g, '""')}"`).join(',') + '\n'; });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=sobha-theoneworld-leads.csv');
  res.send(csv);
});

// START
async function start() {
  await initDB();
  app.listen(PORT, () => console.log(`🏠 sobha-theoneworld.com (Bangalore) running on http://localhost:${PORT}`));
  
  // Daily Health Report - Runs every day at 9:00 AM IST
  cron.schedule('0 9 * * *', async () => {
    const s = await getSmtpSettings();
    if (!s.host || !s.user || !s.to) return;
    try {
      const t = nodemailer.createTransport({ host: s.host, port: parseInt(s.port), secure: s.secure === 'true', auth: { user: s.user, pass: s.pass } });
      const db = await getPool();
      await db.execute('SELECT 1'); // Ping DB
      await t.sendMail({ from: s.from || s.user, to: s.to, subject: '✅ Sobha One World Daily Report (Bangalore)', html: '<h2 style="color:green;">✅ Server and Database are working perfectly.</h2><p>Sobha One World (sobha-theoneworld.com) health check passed.</p>' });
    } catch (err) {
      console.error('Health Check Error:', err);
      try {
        const t = nodemailer.createTransport({ host: s.host, port: parseInt(s.port), secure: s.secure === 'true', auth: { user: s.user, pass: s.pass } });
        await t.sendMail({ from: s.from || s.user, to: s.to, subject: '🚨 Sobha One World Daily Report (Bangalore)', html: `<h2 style="color:red;">🚨 Server is UP but DATABASE IS DOWN. Please check!</h2><p>Error: ${err.message}</p>` });
      } catch (emailErr) { console.error('Failed to send failure email:', emailErr); }
    }
  }, { timezone: 'Asia/Kolkata' });
}
start().catch(console.error);
