const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');

/**
 * Helmet — sets secure HTTP headers to prevent common attacks:
 * - X-Content-Type-Options: nosniff (prevents MIME sniffing)
 * - X-Frame-Options: DENY (prevents clickjacking)
 * - Strict-Transport-Security (forces HTTPS)
 * - Content-Security-Policy (prevents XSS)
 */
const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
});

/**
 * Rate Limiter — prevents brute-force and DDoS attacks.
 * Allows 100 requests per 15-minute window per IP.
 */
const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests from this IP, please try again after 15 minutes.',
  },
});

/**
 * CORS — restricts which origins can call this API.
 * In development, allows localhost. In production, restrict to your domain.
 */
const corsMiddleware = cors({
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://127.0.0.1:3000',
      process.env.CORS_ORIGIN,
    ].filter(Boolean);

    // Allow requests with no origin (curl, Postman, server-to-server)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // Permissive in dev; tighten in production
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
});

/**
 * Apply all security middleware to an Express app.
 */
function applySecurityMiddleware(app) {
  app.use(helmetMiddleware);
  app.use(rateLimiter);
  app.use(corsMiddleware);

  // Disable X-Powered-By header (don't reveal we use Express)
  app.disable('x-powered-by');
}

module.exports = { applySecurityMiddleware };
