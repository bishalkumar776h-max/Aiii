document.addEventListener('DOMContentLoaded', async () => {
    const user = await Auth.guardPage();
    if (!user) return;

    Auth.renderNavUser();
    document.getElementById('welcomeTitle').textContent = `Welcome back, ${user.username} 👋`;
    document.getElementById('sidebarLogoutBtn').addEventListener('click', Auth.logout);

    if (user.role === 'admin') {
        document.getElementById('sidebarAdminLink').innerHTML = `
            <a class="side-link" href="/admin.html"><i class="fas fa-shield-halved"></i> Admin Panel</a>
        `;
    }

    hydrateStats(user);
    setupViewSwitching();
    loadRecentGallery();
    setupSettingsForms(user);
});

function setupViewSwitching() {
    const links = document.querySelectorAll('.side-link[data-view]');
    links.forEach((link) => {
        link.addEventListener('click', () => {
            links.forEach((l) => l.classList.remove('active'));
            link.classList.add('active');
            const view = link.dataset.view;
            ['overview', 'chats', 'gallery', 'settings'].forEach((v) => {
                document.getElementById(`view-${v}`).style.display = v === view ? 'block' : 'none';
            });
            if (view === 'chats') loadSessions();
            if (view === 'gallery') loadFullGallery();
        });
    });
}

function hydrateStats(user) {
    document.getElementById('statMessages').textContent = user.stats?.chatMessagesSent ?? 0;
    document.getElementById('statImages').textContent = user.stats?.imagesGenerated ?? 0;
    document.getElementById('statResized').textContent = user.stats?.imagesResized ?? 0;
    document.getElementById('statMemberSince').textContent = new Date(user.createdAt).toLocaleDateString(undefined, {
        month: 'short', year: 'numeric',
    });
}

async function loadRecentGallery() {
    try {
        const { images } = await API.getImages(1);
        renderGallery('recentGallery', images.slice(0, 6));
    } catch (err) {
        document.getElementById('recentGallery').innerHTML = emptyState('fa-image', 'Could not load images.');
    }
}

async function loadFullGallery() {
    const el = document.getElementById('fullGallery');
    el.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i></div>';
    try {
        const { images } = await API.getImages(1);
        renderGallery('fullGallery', images);
    } catch (err) {
        el.innerHTML = emptyState('fa-image', 'Could not load images.');
    }
}

function renderGallery(elementId, images) {
    const el = document.getElementById(elementId);
    if (!images.length) {
        el.innerHTML = emptyState('fa-image', 'No images generated yet. Head to the Image Generator to create your first one!');
        return;
    }
    el.innerHTML = images.map((img) => `
        <div class="gallery-item">
            <img src="${img.imageUrl}" alt="${escapeHtml(img.prompt)}" loading="lazy">
            <div class="gallery-overlay"><p>${escapeHtml(img.prompt).slice(0, 60)}</p></div>
        </div>
    `).join('');
}

async function loadSessions() {
    const el = document.getElementById('sessionList');
    el.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i></div>';
    try {
        const { sessions } = await API.getSessions();
        if (!sessions.length) {
            el.innerHTML = emptyState('fa-comments', 'No chat history yet. Start a conversation in AI Chat!');
            return;
        }
        el.innerHTML = sessions.map((s) => `
            <div class="session-item">
                <div class="session-preview">${escapeHtml(s.lastMessage)}</div>
                <div class="session-meta">${s.count} messages · ${new Date(s.lastAt).toLocaleString()}</div>
            </div>
        `).join('');
    } catch (err) {
        el.innerHTML = emptyState('fa-comments', 'Could not load chat history.');
    }
}

function setupSettingsForms(user) {
    document.getElementById('settingsUsername').value = user.username;
    document.getElementById('settingsEmail').value = user.email;

    document.getElementById('profileForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await API.updateProfile({ username: document.getElementById('settingsUsername').value.trim() });
            alert('Profile updated.');
        } catch (err) {
            alert(err.message);
        }
    });

    document.getElementById('passwordForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errBox = document.getElementById('passwordError');
        errBox.classList.remove('show');
        try {
            await API.changePassword({
                currentPassword: document.getElementById('currentPassword').value,
                newPassword: document.getElementById('newPassword').value,
            });
            document.getElementById('passwordForm').reset();
            alert('Password updated successfully.');
        } catch (err) {
            errBox.textContent = err.message;
            errBox.classList.add('show');
        }
    });
}

function emptyState(icon, text) {
    return `<div class="empty-state"><i class="fas ${icon}"></i><p>${text}</p></div>`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
