#!/data/data/com.termux/files/usr/bin/bash
# ============================================================
#  AI Premium Suite — Termux Setup (Python/Flask + SQLite)
#  Code Owner: BISHAL AI
#
#  Usage (inside Termux):
#     bash termux_setup.sh
# ============================================================
set -e

echo "📦 Updating Termux packages..."
pkg update -y && pkg upgrade -y

echo "🐍 Installing Python..."
pkg install -y python

echo "📚 Installing Python dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

echo ""
echo "✅ Setup complete!"
echo ""
echo "▶ To start the server, run:"
echo "     python app.py"
echo ""
echo "▶ Then open in a browser (on the same phone or same WiFi network):"
echo "     http://localhost:5000"
echo "     http://<phone-local-ip>:5000   (find IP with: ifconfig | grep inet)"
echo ""
echo "▶ First account you register automatically becomes ADMIN."
echo ""
echo "▶ To keep it running after closing Termux, use:"
echo "     pkg install tmux"
echo "     tmux new -s aisuite"
echo "     python app.py"
echo "     (press Ctrl+B then D to detach; 'tmux attach -t aisuite' to return)"
