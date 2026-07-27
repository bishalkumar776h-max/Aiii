let usersPage = 1;

document.addEventListener('DOMContentLoaded', async () => {
    const user = await Auth.guardPage({ requireAdmin: true });
    if (!user) return;

    Auth.renderNavUser();
    document.getElementById('sidebarLogoutBtn').addEventListener('click', Auth.logout);
    setupViewSwitching();
    loadStats();

    document.getElementById('userSearch').addEventListener('input', debounce(() => { usersPage = 1; loadUsers(); }, 350));
    document.getElementById('statusFilter').addEventListener('change', () => { usersPage = 1; loadUsers(); });
    document.getElementById('roleFilter').addEventListener('change', () => { usersPage = 1; loadUsers(); });
});

function setupViewSwitching() {
    const links = document.querySelectorAll('.side-link[data-view]');
    links.forEach((link) => {
        link.addEventListener('click', () => {
            links.forEach((l) => l.classList.remove('active'));
            link.classList.add('active');
            const view = link.dataset.view;
            ['overview', 'users'].forEach((v) => {
                document.getElementById(`view-${v}`).style.display = v === view ? 'block' : 'none';
            });
            if (view === 'users') loadUsers();
        });
    });
}

async function loadStats() {
    try {
        const { stats } = await API.getStats();
        document.getElementById('statTotalUsers').textContent = stats.totalUsers;
        document.getElementById('statNewUsers').textContent = `+${stats.newUsersLast7Days} in last 7 days`;
        document.getElementById('statActiveUsers').textContent = stats.activeUsers;
        document.getElementById('statMessages').textContent = stats.totalMessages;
        document.getElementById('statImages').textContent = stats.totalImages;

        renderSignupChart(stats.signupTrend);
        renderTopGenerators(stats.topGenerators);
    } catch (err) {
        console.error(err);
    }
}

function renderSignupChart(trend) {
    const labels = trend.map((t) => t._id);
    const data = trend.map((t) => t.count);
    const ctx = document.getElementById('signupChart');
    // eslint-disable-next-line no-undef
    new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'New Signups',
                data,
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99,102,241,0.15)',
                tension: 0.35,
                fill: true,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#94a3b8' } },
                y: { beginAtZero: true, ticks: { color: '#94a3b8', precision: 0 } },
            },
        },
    });
}

function renderTopGenerators(list) {
    const tbody = document.querySelector('#topGeneratorsTable tbody');
    if (!list.length) {
        tbody.innerHTML = '<tr><td colspan="2">No data yet.</td></tr>';
        return;
    }
    tbody.innerHTML = list.map((u) => `
        <tr><td>${escapeHtml(u.username)}</td><td>${u.stats?.imagesGenerated ?? 0}</td></tr>
    `).join('');
}

async function loadUsers() {
    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = '<tr><td colspan="6">Loading...</td></tr>';
    try {
        const params = { page: usersPage, limit: 15 };
        const search = document.getElementById('userSearch').value.trim();
        const status = document.getElementById('statusFilter').value;
        const role = document.getElementById('roleFilter').value;
        if (search) params.search = search;
        if (status) params.status = status;
        if (role) params.role = role;

        const { users, page, pages } = await API.getUsers(params);
        if (!users.length) {
            tbody.innerHTML = '<tr><td colspan="6">No users found.</td></tr>';
            document.getElementById('usersPagination').innerHTML = '';
            return;
        }

        tbody.innerHTML = users.map((u) => `
            <tr data-id="${u.id}">
                <td>
                    <div class="table-user-cell">
                        <div class="table-avatar" style="background:${u.avatarColor}">${Auth.initials(u.username)}</div>
                        <div><div>${escapeHtml(u.username)}</div><div style="font-size:0.75rem;color:var(--text-secondary);">${escapeHtml(u.email)}</div></div>
                    </div>
                </td>
                <td><span class="badge badge-${u.role}">${u.role}</span></td>
                <td><span class="badge badge-${u.status}">${u.status}</span></td>
                <td>${new Date(u.createdAt).toLocaleDateString()}</td>
                <td style="font-size:0.78rem;">💬 ${u.stats?.chatMessagesSent ?? 0} · 🖼️ ${u.stats?.imagesGenerated ?? 0}</td>
                <td>
                    ${u.status !== 'active' ? `<button class="icon-btn" title="Activate" data-action="status" data-value="active"><i class="fas fa-check"></i></button>` : ''}
                    ${u.status !== 'suspended' ? `<button class="icon-btn" title="Suspend" data-action="status" data-value="suspended"><i class="fas fa-pause"></i></button>` : ''}
                    ${u.status !== 'banned' ? `<button class="icon-btn danger" title="Ban" data-action="status" data-value="banned"><i class="fas fa-ban"></i></button>` : ''}
                    ${u.role === 'user' ? `<button class="icon-btn" title="Make Admin" data-action="role" data-value="admin"><i class="fas fa-arrow-up"></i></button>` : `<button class="icon-btn" title="Remove Admin" data-action="role" data-value="user"><i class="fas fa-arrow-down"></i></button>`}
                    <button class="icon-btn danger" title="Delete" data-action="delete"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('');

        attachRowActions();
        renderPagination(page, pages);
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6">Failed to load users: ${escapeHtml(err.message)}</td></tr>`;
    }
}

function attachRowActions() {
    document.querySelectorAll('#usersTableBody button[data-action]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const row = btn.closest('tr');
            const id = row.dataset.id;
            const action = btn.dataset.action;
            const value = btn.dataset.value;

            try {
                if (action === 'status') await API.updateUserStatus(id, value);
                if (action === 'role') await API.updateUserRole(id, value);
                if (action === 'delete') {
                    if (!confirm('Delete this user and all their data permanently?')) return;
                    await API.deleteUser(id);
                }
                loadUsers();
                loadStats();
            } catch (err) {
                alert(err.message);
            }
        });
    });
}

function renderPagination(page, pages) {
    const el = document.getElementById('usersPagination');
    if (pages <= 1) { el.innerHTML = ''; return; }
    let html = '';
    for (let i = 1; i <= pages; i++) {
        html += `<button class="icon-btn" style="width:auto;padding:0.4rem 0.8rem;${i === page ? 'border-color:var(--primary);color:var(--primary);' : ''}" data-page="${i}">${i}</button>`;
    }
    el.innerHTML = html;
    el.querySelectorAll('button[data-page]').forEach((b) => {
        b.addEventListener('click', () => { usersPage = Number(b.dataset.page); loadUsers(); });
    });
}

function debounce(fn, delay) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
