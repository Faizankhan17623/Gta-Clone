import crypto from 'node:crypto';

// Inject transport/persistence for offline tests; no SMTP credentials in reports.
export function createAdminTokenSender({ env = process.env, armToken, recordError,
  createTransport, fetchImpl = globalThis.fetch, now = Date.now, timeoutMs = 30000 }) {
  let sentAt = -Infinity, sending = false;
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const retry = Math.ceil((60000 - (now() - sentAt)) / 1000);
    if (sending || retry > 0) {
      res.setHeader('Retry-After', String(Math.max(1, retry)));
      return res.status(429).json({ error: sending ? 'A token request is already in progress' : `Please wait ${retry} seconds before requesting another token` });
    }
    const port = Number(env.SMTP_PORT || 587);
    const provider = env.MAIL_PROVIDER || (env.RESEND_API_KEY ? 'resend' : 'smtp');
    if (!['smtp', 'resend'].includes(provider)) return res.status(503).json({ error: 'MAIL_PROVIDER must be smtp or resend' });
    // Only Gmail app-password display separators are removed. Spaces can be
    // meaningful in passwords for other SMTP providers.
    const pass = /^smtp\.gmail\.com$/i.test(env.SMTP_HOST || '') ? (env.SMTP_PASS || '').replace(/\s+/g, '') : env.SMTP_PASS;
    const missing = (provider === 'resend' ? ['RESEND_API_KEY', 'MAIL_FROM', 'ADMIN_EMAIL'] : ['SMTP_HOST', 'SMTP_USER', 'ADMIN_EMAIL']).filter(k => !env[k]?.trim());
    if (provider === 'smtp' && !pass?.trim()) missing.push('SMTP_PASS');
    const token = crypto.randomBytes(24).toString('base64url');
    const expiresAt = now() + 3600000;
    if (missing.length) {
      // Never turn a public "send email" button into unauthenticated admin login.
      if (env.ADMIN_TOKEN_INLINE === '1' && env.ADMIN_TOKEN && req.get('x-admin-token') === env.ADMIN_TOKEN) {
        await armToken(token, expiresAt); sentAt = now();
        return res.json({ ok: true, inline: true, token, message: 'Authenticated development token created' });
      }
      return res.status(503).json({ error: `Email is not configured. The server operator must set ${missing.join(', ')} and restart. A configured ADMIN_TOKEN can still be used with CONNECT.` });
    }
    if (provider === 'smtp' && (!Number.isInteger(port) || port < 1 || port > 65535))
      return res.status(503).json({ error: 'SMTP_PORT must be a valid port number' });
    sending = true;
    let transporter, timer;
    try {
      if (provider === 'resend') {
        // HTTPS uses port 443, supported by hosts that block outbound SMTP.
        const response = await fetchImpl('https://api.resend.com/emails', {
          method: 'POST', signal: AbortSignal.timeout(timeoutMs),
          headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json',
            'Idempotency-Key': 'admin-' + crypto.createHash('sha256').update(token).digest('hex') },
          body: JSON.stringify({ from: env.MAIL_FROM, to: [env.ADMIN_EMAIL],
            subject: 'Arena Protocol admin token', text: `Your admin token is ${token}. It expires in one hour.` }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || typeof data.id !== 'string') {
          const error = new Error('HTTPS email provider rejected the request (' + response.status + ')');
          error.code = 'EMAIL_API'; error.status = response.status; throw error;
        }
      } else {
      const factory = createTransport || (await import('nodemailer')).default.createTransport;
      transporter = factory({ host: env.SMTP_HOST.trim(), port, secure: port === 465,
        requireTLS: port !== 465, connectionTimeout: 10000, greetingTimeout: 10000,
        socketTimeout: 15000, auth: { user: env.SMTP_USER, pass } });
      await Promise.race([
        transporter.sendMail({ from: env.SMTP_USER, to: env.ADMIN_EMAIL,
          subject: 'Arena Protocol admin token', text: `Your admin token is ${token}. It expires in one hour.` }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('SMTP timed out'), { code: 'ETIMEDOUT' })), timeoutMs); }),
      ]);
      }
      await armToken(token, expiresAt); sentAt = now();
      return res.json({ ok: true, message: 'Admin token sent to the configured email. It expires in one hour.' });
    } catch (error) {
      recordError(error, 'admin-email');
      const message = error.code === 'EMAIL_API' ? 'Email API rejected the request. Check RESEND_API_KEY, verified MAIL_FROM domain, recipient restrictions and provider quota.' :
        provider === 'resend' ? 'HTTPS email request failed or timed out. Check server connectivity and the provider status, then retry.' :
        error.code === 'EAUTH' ? 'SMTP authentication failed. Check the server mail username and app password.' :
        error.code === 'ETIMEDOUT' || error.code === 'ECONNECTION' || error.code === 'ESOCKET' ? 'SMTP connection failed or timed out. Render free services block SMTP ports 25, 465 and 587. Use MAIL_PROVIDER=resend with an API key and verified sender, or an SMTP-capable host.' :
          'Email delivery failed. Check the server mail log and configuration.';
      return res.status(502).json({ error: message });
    } finally { clearTimeout(timer); transporter?.close?.(); sending = false; }
  };
}
