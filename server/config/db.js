const mongoose = require('mongoose');

/**
 * Connection is cached across invocations so that Vercel's serverless
 * functions (which may reuse the same warm container) don't open a new
 * MongoDB connection on every request.
 */
let cached = global._mongooseConnection;
if (!cached) {
  cached = global._mongooseConnection = { conn: null, promise: null };
}

async function connectDB() {
  if (cached.conn) return cached.conn;

  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not defined. Add it to your .env file or Vercel project settings.');
  }

  if (!cached.promise) {
    const opts = {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 8000,
    };
    cached.promise = mongoose.connect(process.env.MONGODB_URI, opts).then((m) => m);
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null;
    throw err;
  }

  mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error:', err.message);
  });

  return cached.conn;
}

module.exports = connectDB;
