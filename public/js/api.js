/**
 * api.js - thin wrapper around fetch() for talking to our Express/Mongo backend.
 * Cookies (httpOnly JWT) are sent automatically via credentials: 'include'.
 */
const API_BASE = '/api';

async function apiRequest(path, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let data;
  try {
    data = await res.json();
  } catch (_) {
    data = { success: false, message: 'Unexpected server response.' };
  }

  if (!res.ok) {
    const err = new Error(data.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.payload = data;
    throw err;
  }

  return data;
}

const API = {
  // Auth
  register: (payload) => apiRequest('/auth/register', { method: 'POST', body: payload }),
  login: (payload) => apiRequest('/auth/login', { method: 'POST', body: payload }),
  logout: () => apiRequest('/auth/logout', { method: 'POST' }),
  me: () => apiRequest('/auth/me'),
  updateProfile: (payload) => apiRequest('/auth/profile', { method: 'PATCH', body: payload }),
  changePassword: (payload) => apiRequest('/auth/password', { method: 'PATCH', body: payload }),

  // Chat
  saveMessage: (payload) => apiRequest('/chat/message', { method: 'POST', body: payload }),
  getChatHistory: (sessionId) => apiRequest(`/chat/history${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ''}`),
  getSessions: () => apiRequest('/chat/sessions'),
  deleteSession: (sessionId) => apiRequest(`/chat/session/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }),

  // Images
  saveImage: (payload) => apiRequest('/images', { method: 'POST', body: payload }),
  getImages: (page = 1) => apiRequest(`/images?page=${page}`),
  deleteImage: (id) => apiRequest(`/images/${id}`, { method: 'DELETE' }),
  incrementResize: () => apiRequest('/images/resize-count', { method: 'PATCH' }),

  // Admin
  getStats: () => apiRequest('/admin/stats'),
  getUsers: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/admin/users${q ? `?${q}` : ''}`);
  },
  getUserById: (id) => apiRequest(`/admin/users/${id}`),
  updateUserStatus: (id, status) => apiRequest(`/admin/users/${id}/status`, { method: 'PATCH', body: { status } }),
  updateUserRole: (id, role) => apiRequest(`/admin/users/${id}/role`, { method: 'PATCH', body: { role } }),
  deleteUser: (id) => apiRequest(`/admin/users/${id}`, { method: 'DELETE' }),
};
