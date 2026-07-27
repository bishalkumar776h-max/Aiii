require('dotenv').config();
const app = require('../server/app');

// Vercel treats this file as a serverless function.
// The Express app itself handles routing for everything under /api/*
module.exports = app;
