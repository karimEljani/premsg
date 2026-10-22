const express = require('express');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const DB = path.join(__dirname, 'data', 'messages.json');
fs.mkdirSync(path.dirname(DB), { recursive: true });
const load = () => { try { return JSON.parse(fs.readFileSync(DB, 'utf8')); } catch { return []; } };
const save = (m) => fs.writeFileSync(DB, JSON.stringify(m, null, 2));

app.use(express.json());

// Protection basique : l'app envoie des messages en ton nom
app.use((req, res, next) => {
  const u = process.env.APP_USER, p = process.env.APP_PASS;
  if (!u || !p) return res.status(500).send('Définis APP_USER et APP_PASS dans .env');
  const h = req.headers.authorization || '';
  const [user, pass] = Buffer.from(h.split(' ')[1] || '', 'base64').toString().split(':');
  if (user === u && pass === p) return next();
  res.set('WWW-Authenticate', 'Basic realm="Messages"').status(401).send('Auth requise');
});
app.use(express.static(path.join(__dirname, 'public')));

// ---- Envoi selon le canal ----
const senders = {
  async email(m) {
    const t = nodemailer.createTransport({
      host: process.env.SMTP_HOST, port: +process.env.SMTP_PORT || 465,
      secure: (+process.env.SMTP_PORT || 465) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await t.sendMail({ from: process.env.SMTP_USER, to: m.to, subject: m.subject || 'Message', text: m.body });
  },
  async telegram(m) {
    const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: m.to, text: m.body }),
    });
    if (!r.ok) throw new Error('Telegram: ' + (await r.text()));
  },
  async sms(m) { return twilio(m, process.env.TWILIO_FROM, m.to); },
  async whatsapp(m) {
    return twilio(m, 'whatsapp:' + process.env.TWILIO_WHATSAPP_FROM, 'whatsapp:' + m.to);
  },
};
async function twilio(m, from, to) {
  const { TWILIO_SID: sid, TWILIO_TOKEN: tok } = process.env;
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${sid}:${tok}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ From: from, To: to, Body: m.body }),
  });
  if (!r.ok) throw new Error('Twilio: ' + (await r.text()));
}

// ---- API ----
app.get('/api/messages', (req, res) => res.json(load().sort((a, b) => a.sendAt.localeCompare(b.sendAt))));

app.post('/api/messages', (req, res) => {
  const { channel, to, subject, body, sendAt } = req.body || {};
  if (!senders[channel]) return res.status(400).json({ error: 'Canal invalide' });
  if (!to || !body || !sendAt || isNaN(Date.parse(sendAt))) return res.status(400).json({ error: 'Champs manquants' });
  // CORRECTION : refuser une heure déjà passée (sinon le message part aussitôt)
  if (new Date(sendAt) <= new Date()) return res.status(400).json({ error: "L'heure choisie est déjà passée" });
  const msg = { id: crypto.randomUUID(), channel, to, subject: subject || '', body,
    sendAt: new Date(sendAt).toISOString(), status: 'pending', error: null };
  const all = load(); all.push(msg); save(all);
  res.status(201).json(msg);
});

app.delete('/api/messages/:id', (req, res) => {
  save(load().filter((m) => m.id !== req.params.id));
  res.status(204).end();
});

// ---- Planificateur : vérifie toutes les 15 s ----
let busy = false;
async function tick() {
  if (busy) return; busy = true;
  try {
    const due = load().filter((m) => m.status === 'pending' && new Date(m.sendAt) <= new Date());
    for (const m of due) {
      console.log('Envoi de', m.channel, '->', m.to);
      let status = 'sent', error = null;
      try { await senders[m.channel](m); console.log('OK envoyé'); }
      catch (e) { status = 'failed'; error = String(e.message || e); console.log('ECHEC', error); }
      // On relit le fichier avant d'écrire : évite de perdre un message ajouté pendant l'envoi
      const all = load();
      const cur = all.find((x) => x.id === m.id);
      if (cur) { cur.status = status; cur.error = error; cur.sentAt = new Date().toISOString(); save(all); }
    }
  } finally { busy = false; }
}
setInterval(tick, 15000); tick();

app.listen(process.env.PORT || 3000, () => console.log('http://localhost:' + (process.env.PORT || 3000)));
