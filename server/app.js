const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');

const connectDB = require('./config/db');
const { apiLimiter } = require('./middleware/rateLimiter');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/authRoutes');
const chatRoutes = require('./routes/chatRoutes');
const imageRoutes = require('./routes/imageRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();

// Ensure DB connection on every request (safe/cached for serverless)
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    next(err);
  }
});

app.use(
  helmet({
    contentSecurityPolicy: false, // relaxed for CDN fonts/icons used by the frontend
  })
);
app.use(
  cors({
    origin: process.env.CLIENT_URL || true,
    credentials: true,
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(mongoSanitize());
if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'));

app.use('/api', apiLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/health', (req, res) => res.json({ success: true, message: 'API is healthy', time: new Date().toISOString() }));

// Serve static frontend (index.html, dashboard.html, admin.html, css/js)
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api', notFound);
app.use(errorHandler);

module.exports = app;
