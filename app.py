"""
app.py — AI Premium Suite (Python / Flask + SQLite edition)
=============================================================
Termux-friendly alternative to the Node/Express/MongoDB backend.
Zero external database required — everything lives in a local
SQLite file (database.db), created automatically on first run.

Same API contract as the Node backend (server/app.js), so the
existing frontend in /public (index.html, dashboard.html,
admin.html + css/js) works with EITHER backend unchanged.

Run it:
    pip install -r requirements.txt
    python app.py

Then open http://localhost:5000 (or http://<phone-ip>:5000 from
another device on the same network, if hosting from Termux).

Author / Code Owner: BISHAL AI
"""

import os
import re
import sqlite3
import secrets
import functools
from datetime import datetime, timedelta

from flask import Flask, request, jsonify, session, send_from_directory, g
from werkzeug.security import generate_password_hash, check_password_hash

# ----------------------------------------------------------------
# Configuration
# ----------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "database.db")
PUBLIC_DIR = os.path.join(BASE_DIR, "public")

app = Flask(__name__, static_folder=PUBLIC_DIR, static_url_path="")
app.config["SECRET_KEY"] = os.environ.get("FLASK_SECRET_KEY") or secrets.token_hex(32)
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=7)

MAX_FAILED_ATTEMPTS = 5
LOCK_MINUTES = 15

# Very small in-memory rate limiter: {ip: [timestamps]} for auth endpoints only.
_auth_hits = {}
AUTH_WINDOW_SECONDS = 15 * 60
AUTH_MAX_HITS = 20


def rate_limited(ip):
    now = datetime.utcnow().timestamp()
    hits = [t for t in _auth_hits.get(ip, []) if now - t < AUTH_WINDOW_SECONDS]
    hits.append(now)
    _auth_hits[ip] = hits
    return len(hits) > AUTH_MAX_HITS


# ----------------------------------------------------------------
# Database helpers
# ----------------------------------------------------------------
def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user',
            status TEXT NOT NULL DEFAULT 'active',
            avatar_color TEXT NOT NULL,
            chat_messages_sent INTEGER NOT NULL DEFAULT 0,
            images_generated INTEGER NOT NULL DEFAULT 0,
            images_resized INTEGER NOT NULL DEFAULT 0,
            failed_login_attempts INTEGER NOT NULL DEFAULT 0,
            lock_until TEXT,
            last_login_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            session_id TEXT NOT NULL,
            sender TEXT NOT NULL,
            text TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS generated_images (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            prompt TEXT NOT NULL,
            style TEXT DEFAULT 'realistic',
            image_url TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_chat_user ON chat_messages(user_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_images_user ON generated_images(user_id, created_at);
        """
    )
    conn.commit()
    conn.close()


def random_color():
    return "#%06x" % secrets.randbelow(0xFFFFFF)


def user_to_safe_dict(row):
    return {
        "id": row["id"],
        "username": row["username"],
        "email": row["email"],
        "role": row["role"],
        "status": row["status"],
        "avatarColor": row["avatar_color"],
        "stats": {
            "chatMessagesSent": row["chat_messages_sent"],
            "imagesGenerated": row["images_generated"],
            "imagesResized": row["images_resized"],
        },
        "createdAt": row["created_at"],
        "lastLoginAt": row["last_login_at"],
    }


def find_user_by_id(user_id):
    db = get_db()
    return db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()


def find_user_by_login(identifier):
    db = get_db()
    return db.execute(
        "SELECT * FROM users WHERE email = ? OR username = ?",
        (identifier.lower(), identifier),
    ).fetchone()


# ----------------------------------------------------------------
# Auth decorators
# ----------------------------------------------------------------
def login_required(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        user_id = session.get("user_id")
        if not user_id:
            return jsonify(success=False, message="Not authenticated. Please log in."), 401
        user = find_user_by_id(user_id)
        if not user:
            session.clear()
            return jsonify(success=False, message="User no longer exists."), 401
        if user["status"] != "active":
            return jsonify(success=False, message=f"Account is {user['status']}. Contact support."), 403
        g.current_user = user
        return fn(*args, **kwargs)
    return wrapper


def admin_required(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        if g.current_user["role"] != "admin":
            return jsonify(success=False, message="Admin access required."), 403
        return fn(*args, **kwargs)
    return wrapper


# ----------------------------------------------------------------
# Validation helpers
# ----------------------------------------------------------------
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
USERNAME_RE = re.compile(r"^[a-zA-Z0-9_]{3,30}$")


# ==================================================================
# AUTH ROUTES
# ==================================================================
@app.post("/api/auth/register")
def register():
    ip = request.remote_addr or "unknown"
    if rate_limited(ip):
        return jsonify(success=False, message="Too many attempts. Try again later."), 429

    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not USERNAME_RE.match(username):
        return jsonify(success=False, message="Username must be 3-30 chars, letters/numbers/underscore only."), 400
    if not EMAIL_RE.match(email):
        return jsonify(success=False, message="Valid email is required."), 400
    if len(password) < 8:
        return jsonify(success=False, message="Password must be at least 8 characters."), 400

    db = get_db()
    existing = db.execute(
        "SELECT id FROM users WHERE email = ? OR username = ?", (email, username)
    ).fetchone()
    if existing:
        return jsonify(success=False, message="An account with that email or username already exists."), 409

    user_count = db.execute("SELECT COUNT(*) AS c FROM users").fetchone()["c"]
    role = "admin" if user_count == 0 else "user"

    cur = db.execute(
        """INSERT INTO users (username, email, password_hash, role, avatar_color)
           VALUES (?, ?, ?, ?, ?)""",
        (username, email, generate_password_hash(password), role, random_color()),
    )
    db.commit()
    user = find_user_by_id(cur.lastrowid)

    session.clear()
    session["user_id"] = user["id"]
    session.permanent = True

    return jsonify(success=True, message="Account created successfully.", user=user_to_safe_dict(user)), 201


@app.post("/api/auth/login")
def login():
    ip = request.remote_addr or "unknown"
    if rate_limited(ip):
        return jsonify(success=False, message="Too many attempts. Try again later."), 429

    data = request.get_json(silent=True) or {}
    identifier = (data.get("emailOrUsername") or "").strip()
    password = data.get("password") or ""

    if not identifier or not password:
        return jsonify(success=False, message="Email/username and password are required."), 400

    user = find_user_by_login(identifier)
    if not user:
        return jsonify(success=False, message="Invalid credentials."), 401

    if user["lock_until"]:
        lock_until = datetime.fromisoformat(user["lock_until"])
        if lock_until > datetime.utcnow():
            mins_left = max(1, int((lock_until - datetime.utcnow()).total_seconds() // 60))
            return jsonify(success=False, message=f"Account locked. Try again in {mins_left} minute(s)."), 423

    if user["status"] != "active":
        return jsonify(success=False, message=f"Account is {user['status']}. Contact support."), 403

    db = get_db()
    if not check_password_hash(user["password_hash"], password):
        attempts = user["failed_login_attempts"] + 1
        lock_until = None
        if attempts >= MAX_FAILED_ATTEMPTS:
            lock_until = (datetime.utcnow() + timedelta(minutes=LOCK_MINUTES)).isoformat()
            attempts = 0
        db.execute(
            "UPDATE users SET failed_login_attempts = ?, lock_until = ? WHERE id = ?",
            (attempts, lock_until, user["id"]),
        )
        db.commit()
        return jsonify(success=False, message="Invalid credentials."), 401

    db.execute(
        """UPDATE users SET failed_login_attempts = 0, lock_until = NULL,
           last_login_at = ? WHERE id = ?""",
        (datetime.utcnow().isoformat(), user["id"]),
    )
    db.commit()
    user = find_user_by_id(user["id"])

    session.clear()
    session["user_id"] = user["id"]
    session.permanent = True

    return jsonify(success=True, message="Logged in successfully.", user=user_to_safe_dict(user))


@app.post("/api/auth/logout")
def logout():
    session.clear()
    return jsonify(success=True, message="Logged out.")


@app.get("/api/auth/me")
@login_required
def me():
    return jsonify(success=True, user=user_to_safe_dict(g.current_user))


@app.patch("/api/auth/profile")
@login_required
def update_profile():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    db = get_db()
    if username and username != g.current_user["username"]:
        taken = db.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
        if taken:
            return jsonify(success=False, message="Username already taken."), 409
        db.execute("UPDATE users SET username = ? WHERE id = ?", (username, g.current_user["id"]))
        db.commit()
    user = find_user_by_id(g.current_user["id"])
    return jsonify(success=True, message="Profile updated.", user=user_to_safe_dict(user))


@app.patch("/api/auth/password")
@login_required
def change_password():
    data = request.get_json(silent=True) or {}
    current_password = data.get("currentPassword") or ""
    new_password = data.get("newPassword") or ""

    if len(new_password) < 8:
        return jsonify(success=False, message="New password must be at least 8 characters."), 400
    if not check_password_hash(g.current_user["password_hash"], current_password):
        return jsonify(success=False, message="Current password is incorrect."), 401

    db = get_db()
    db.execute(
        "UPDATE users SET password_hash = ? WHERE id = ?",
        (generate_password_hash(new_password), g.current_user["id"]),
    )
    db.commit()
    return jsonify(success=True, message="Password changed successfully.")


# ==================================================================
# CHAT ROUTES
# ==================================================================
@app.post("/api/chat/message")
@login_required
def save_message():
    data = request.get_json(silent=True) or {}
    session_id = data.get("sessionId")
    sender = data.get("sender")
    text = (data.get("text") or "")[:8000]

    if not session_id or sender not in ("user", "bot") or not text:
        return jsonify(success=False, message="sessionId, sender and text are required."), 400

    db = get_db()
    db.execute(
        "INSERT INTO chat_messages (user_id, session_id, sender, text) VALUES (?, ?, ?, ?)",
        (g.current_user["id"], session_id, sender, text),
    )
    if sender == "user":
        db.execute(
            "UPDATE users SET chat_messages_sent = chat_messages_sent + 1 WHERE id = ?",
            (g.current_user["id"],),
        )
    db.commit()
    return jsonify(success=True), 201


@app.get("/api/chat/history")
@login_required
def get_history():
    session_id = request.args.get("sessionId")
    limit = min(int(request.args.get("limit", 50)), 200)

    db = get_db()
    if session_id:
        rows = db.execute(
            """SELECT * FROM chat_messages WHERE user_id = ? AND session_id = ?
               ORDER BY created_at DESC LIMIT ?""",
            (g.current_user["id"], session_id, limit),
        ).fetchall()
    else:
        rows = db.execute(
            "SELECT * FROM chat_messages WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
            (g.current_user["id"], limit),
        ).fetchall()

    messages = [dict(r) for r in rows][::-1]
    return jsonify(success=True, count=len(messages), messages=messages)


@app.get("/api/chat/sessions")
@login_required
def get_sessions():
    db = get_db()
    rows = db.execute(
        """
        SELECT session_id,
               (SELECT text FROM chat_messages c2
                WHERE c2.session_id = c1.session_id AND c2.user_id = ?
                ORDER BY created_at DESC LIMIT 1) AS last_message,
               MAX(created_at) AS last_at,
               COUNT(*) AS count
        FROM chat_messages c1
        WHERE user_id = ?
        GROUP BY session_id
        ORDER BY last_at DESC
        LIMIT 30
        """,
        (g.current_user["id"], g.current_user["id"]),
    ).fetchall()

    sessions = [
        {"lastMessage": r["last_message"], "lastAt": r["last_at"], "count": r["count"]}
        for r in rows
    ]
    return jsonify(success=True, sessions=sessions)


@app.delete("/api/chat/session/<session_id>")
@login_required
def delete_session(session_id):
    db = get_db()
    db.execute(
        "DELETE FROM chat_messages WHERE user_id = ? AND session_id = ?",
        (g.current_user["id"], session_id),
    )
    db.commit()
    return jsonify(success=True, message="Session deleted.")


# ==================================================================
# IMAGE ROUTES
# ==================================================================
@app.post("/api/images")
@login_required
def save_image():
    data = request.get_json(silent=True) or {}
    prompt = data.get("prompt")
    style = data.get("style", "realistic")
    image_url = data.get("imageUrl")

    if not prompt or not image_url:
        return jsonify(success=False, message="prompt and imageUrl are required."), 400

    db = get_db()
    cur = db.execute(
        "INSERT INTO generated_images (user_id, prompt, style, image_url) VALUES (?, ?, ?, ?)",
        (g.current_user["id"], prompt, style, image_url),
    )
    db.execute(
        "UPDATE users SET images_generated = images_generated + 1 WHERE id = ?",
        (g.current_user["id"],),
    )
    db.commit()
    row = db.execute("SELECT * FROM generated_images WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(success=True, image=dict(row)), 201


@app.get("/api/images")
@login_required
def get_images():
    limit = min(int(request.args.get("limit", 24)), 100)
    page = max(int(request.args.get("page", 1)), 1)
    offset = (page - 1) * limit

    db = get_db()
    rows = db.execute(
        """SELECT * FROM generated_images WHERE user_id = ?
           ORDER BY created_at DESC LIMIT ? OFFSET ?""",
        (g.current_user["id"], limit, offset),
    ).fetchall()
    images = [dict(r) for r in rows]
    for img in images:
        img["imageUrl"] = img.pop("image_url")
    return jsonify(success=True, count=len(images), images=images)


@app.delete("/api/images/<int:image_id>")
@login_required
def delete_image(image_id):
    db = get_db()
    row = db.execute(
        "SELECT id FROM generated_images WHERE id = ? AND user_id = ?",
        (image_id, g.current_user["id"]),
    ).fetchone()
    if not row:
        return jsonify(success=False, message="Image not found."), 404
    db.execute("DELETE FROM generated_images WHERE id = ?", (image_id,))
    db.commit()
    return jsonify(success=True, message="Image removed.")


@app.patch("/api/images/resize-count")
@login_required
def increment_resize():
    db = get_db()
    db.execute(
        "UPDATE users SET images_resized = images_resized + 1 WHERE id = ?",
        (g.current_user["id"],),
    )
    db.commit()
    return jsonify(success=True)


# ==================================================================
# ADMIN ROUTES
# ==================================================================
@app.get("/api/admin/stats")
@login_required
@admin_required
def admin_stats():
    db = get_db()
    total_users = db.execute("SELECT COUNT(*) c FROM users").fetchone()["c"]
    active_users = db.execute("SELECT COUNT(*) c FROM users WHERE status='active'").fetchone()["c"]
    suspended_users = db.execute("SELECT COUNT(*) c FROM users WHERE status='suspended'").fetchone()["c"]
    banned_users = db.execute("SELECT COUNT(*) c FROM users WHERE status='banned'").fetchone()["c"]
    total_messages = db.execute("SELECT COUNT(*) c FROM chat_messages").fetchone()["c"]
    total_images = db.execute("SELECT COUNT(*) c FROM generated_images").fetchone()["c"]

    seven_days_ago = (datetime.utcnow() - timedelta(days=7)).isoformat()
    new_users_7d = db.execute(
        "SELECT COUNT(*) c FROM users WHERE created_at >= ?", (seven_days_ago,)
    ).fetchone()["c"]

    fourteen_days_ago = (datetime.utcnow() - timedelta(days=14)).isoformat()
    trend_rows = db.execute(
        """SELECT date(created_at) AS day, COUNT(*) AS count
           FROM users WHERE created_at >= ?
           GROUP BY day ORDER BY day ASC""",
        (fourteen_days_ago,),
    ).fetchall()
    signup_trend = [{"_id": r["day"], "count": r["count"]} for r in trend_rows]

    top_rows = db.execute(
        "SELECT username, images_generated FROM users ORDER BY images_generated DESC LIMIT 5"
    ).fetchall()
    top_generators = [
        {"username": r["username"], "stats": {"imagesGenerated": r["images_generated"]}}
        for r in top_rows
    ]

    return jsonify(
        success=True,
        stats={
            "totalUsers": total_users,
            "activeUsers": active_users,
            "suspendedUsers": suspended_users,
            "bannedUsers": banned_users,
            "totalMessages": total_messages,
            "totalImages": total_images,
            "newUsersLast7Days": new_users_7d,
            "signupTrend": signup_trend,
            "topGenerators": top_generators,
        },
    )


@app.get("/api/admin/users")
@login_required
@admin_required
def admin_get_users():
    limit = min(int(request.args.get("limit", 20)), 100)
    page = max(int(request.args.get("page", 1)), 1)
    offset = (page - 1) * limit
    search = request.args.get("search", "").strip()
    status = request.args.get("status", "").strip()
    role = request.args.get("role", "").strip()

    where = []
    params = []
    if search:
        where.append("(username LIKE ? OR email LIKE ?)")
        params += [f"%{search}%", f"%{search}%"]
    if status:
        where.append("status = ?")
        params.append(status)
    if role:
        where.append("role = ?")
        params.append(role)
    where_sql = f"WHERE {' AND '.join(where)}" if where else ""

    db = get_db()
    total = db.execute(f"SELECT COUNT(*) c FROM users {where_sql}", params).fetchone()["c"]
    rows = db.execute(
        f"SELECT * FROM users {where_sql} ORDER BY created_at DESC LIMIT ? OFFSET ?",
        params + [limit, offset],
    ).fetchall()

    users = [user_to_safe_dict(r) for r in rows]
    pages = max(1, (total + limit - 1) // limit)
    return jsonify(success=True, total=total, page=page, pages=pages, users=users)


@app.get("/api/admin/users/<int:user_id>")
@login_required
@admin_required
def admin_get_user(user_id):
    user = find_user_by_id(user_id)
    if not user:
        return jsonify(success=False, message="User not found."), 404
    db = get_db()
    msg_count = db.execute("SELECT COUNT(*) c FROM chat_messages WHERE user_id=?", (user_id,)).fetchone()["c"]
    img_count = db.execute("SELECT COUNT(*) c FROM generated_images WHERE user_id=?", (user_id,)).fetchone()["c"]
    return jsonify(success=True, user=user_to_safe_dict(user), messageCount=msg_count, imageCount=img_count)


@app.patch("/api/admin/users/<int:user_id>/status")
@login_required
@admin_required
def admin_update_status(user_id):
    data = request.get_json(silent=True) or {}
    status = data.get("status")
    if status not in ("active", "suspended", "banned"):
        return jsonify(success=False, message="Invalid status value."), 400
    if user_id == g.current_user["id"]:
        return jsonify(success=False, message="You cannot change your own status."), 400

    db = get_db()
    if not find_user_by_id(user_id):
        return jsonify(success=False, message="User not found."), 404
    db.execute("UPDATE users SET status = ? WHERE id = ?", (status, user_id))
    db.commit()
    return jsonify(success=True, message=f"User marked as {status}.", user=user_to_safe_dict(find_user_by_id(user_id)))


@app.patch("/api/admin/users/<int:user_id>/role")
@login_required
@admin_required
def admin_update_role(user_id):
    data = request.get_json(silent=True) or {}
    role = data.get("role")
    if role not in ("user", "admin"):
        return jsonify(success=False, message="Invalid role value."), 400
    if user_id == g.current_user["id"]:
        return jsonify(success=False, message="You cannot change your own role."), 400

    db = get_db()
    if not find_user_by_id(user_id):
        return jsonify(success=False, message="User not found."), 404
    db.execute("UPDATE users SET role = ? WHERE id = ?", (role, user_id))
    db.commit()
    return jsonify(success=True, message=f"Role updated to {role}.", user=user_to_safe_dict(find_user_by_id(user_id)))


@app.delete("/api/admin/users/<int:user_id>")
@login_required
@admin_required
def admin_delete_user(user_id):
    if user_id == g.current_user["id"]:
        return jsonify(success=False, message="You cannot delete your own account."), 400
    db = get_db()
    if not find_user_by_id(user_id):
        return jsonify(success=False, message="User not found."), 404
    db.execute("DELETE FROM users WHERE id = ?", (user_id,))  # cascades chat/images
    db.commit()
    return jsonify(success=True, message="User and their data deleted.")


# ==================================================================
# STATIC FRONTEND
# ==================================================================
@app.get("/api/health")
def health():
    return jsonify(success=True, message="API is healthy", time=datetime.utcnow().isoformat())


@app.get("/")
def serve_index():
    return send_from_directory(PUBLIC_DIR, "index.html")


@app.get("/<path:filename>")
def serve_static(filename):
    full_path = os.path.join(PUBLIC_DIR, filename)
    if os.path.isfile(full_path):
        return send_from_directory(PUBLIC_DIR, filename)
    # Fallback for client-side routes / unknown paths
    return send_from_directory(PUBLIC_DIR, "index.html")


# ==================================================================
# ENTRYPOINT
# ==================================================================
if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", 5000))
    host = os.environ.get("HOST", "0.0.0.0")
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    print(f"🚀 AI Premium Suite (Flask/SQLite) running on http://{host}:{port}")
    print("   Code Owner: BISHAL AI")
    app.run(host=host, port=port, debug=debug)
