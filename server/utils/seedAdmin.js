/* eslint-disable no-console */
require('dotenv').config();
const connectDB = require('../config/db');
const User = require('../models/User');

(async () => {
  try {
    await connectDB();
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    const username = process.env.ADMIN_USERNAME || 'admin';

    if (!email || !password) {
      console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD in .env before running this script.');
      process.exit(1);
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      existing.role = 'admin';
      existing.status = 'active';
      await existing.save();
      console.log(`✅ Existing user ${email} promoted to admin.`);
    } else {
      await User.create({ username, email, password, role: 'admin' });
      console.log(`✅ Admin account created: ${email}`);
    }
    process.exit(0);
  } catch (err) {
    console.error('Seeding failed:', err.message);
    process.exit(1);
  }
})();
