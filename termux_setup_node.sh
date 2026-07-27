#!/data/data/com.termux/files/usr/bin/bash
# ============================================================
#  AI Premium Suite — Termux Setup (Node.js + Express)
#  Code Owner: BISHAL AI
#
#  NOTE: This version needs a MongoDB connection string. Termux
#  cannot reliably run mongod itself, so use a free MongoDB Atlas
#  cluster (https://www.mongodb.com/atlas) and paste its URI into
#  .env after this script finishes.
#
#  If you don't want to set up MongoDB Atlas, use termux_setup.sh
#  (the Python/Flask + SQLite version) instead — zero external
#  database required.
#
#  Usage (inside Termux):
#     bash termux_setup_node.sh
# ============================================================
set -e

echo "📦 Updating Termux packages..."
pkg update -y && pkg upgrade -y

echo "🟢 Installing Node.js..."
pkg install -y nodejs

echo "📚 Installing npm dependencies..."
npm install

if [ ! -f .env ]; then
  cp .env.example .env
  echo "📝 Created .env from .env.example — edit it and set MONGODB_URI + JWT_SECRET."
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "▶ Edit .env first:  nano .env"
echo "▶ Then start the server:  npm start"
echo "▶ Open:  http://localhost:5000"
