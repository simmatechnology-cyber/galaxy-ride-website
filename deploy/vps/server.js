/**
 * Express adapter for running the existing Netlify Function handlers
 * (netlify/functions/*.js) as real HTTP routes on a VPS, instead of
 * Netlify's serverless platform.
 *
 * Every function in netlify/functions/ already exports the standard
 * Lambda-style signature:
 *
 *   exports.handler = async (event) => ({ statusCode, headers, body })
 *
 * and only reads `event.httpMethod` and `event.body` (a raw JSON
 * string). This adapter converts an Express request into that shape
 * and writes the returned object back onto the Express response, so
 * the function files themselves require ZERO code changes.
 *
 * Run under PM2 via deploy/vps/ecosystem.config.js. Apache reverse-
 * proxies /api/* on https://galaxyride.in to this process — see
 * deploy/vps/apache-galaxyride.conf.snippet.
 */

require('dotenv').config();
const express = require('express');

const createOrder    = require('../../netlify/functions/create-order');
const verifyPayment  = require('../../netlify/functions/verify-payment');
const paymentFailure = require('../../netlify/functions/payment-failure');
const booking         = require('../../netlify/functions/booking');

const app = express();

// Functions call JSON.parse(event.body) themselves — pass the raw body
// through unparsed rather than double-parsing it here.
app.use(express.text({ type: '*/*', limit: '1mb' }));

function toEvent(req) {
  return {
    httpMethod: req.method,
    body: typeof req.body === 'string' ? req.body : '',
  };
}

function mount(routePath, fn) {
  app.all(routePath, async (req, res) => {
    try {
      const result = await fn.handler(toEvent(req));
      res.status(result.statusCode || 200);
      if (result.headers) {
        for (const [key, value] of Object.entries(result.headers)) {
          res.set(key, value);
        }
      }
      res.send(result.body || '');
    } catch (err) {
      console.error(`[vps-server] ${routePath} threw:`, err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}

mount('/api/create-order',    createOrder);
mount('/api/verify-payment',  verifyPayment);
mount('/api/payment-failure', paymentFailure);
mount('/api/booking',         booking);

app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, '127.0.0.1', () => {
  console.log(`[vps-server] Galaxy Ride API listening on 127.0.0.1:${PORT}`);
});
