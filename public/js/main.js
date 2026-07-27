// Global state
let currentStyle = 'realistic';
let originalImage = null;
let originalWidth = 0, originalHeight = 0;
let chatSessionId = null;

document.addEventListener('DOMContentLoaded', async () => {
    initializeTheme();
    initializeNavigation();
    initializeResizeTool();
    initializeScrollAnimations();
    updateStats();

    await Auth.loadSession();
    Auth.renderNavUser();
    applyAuthGates();

    initializeChat();
    initializeImageGen();

    window.addEventListener('auth:login', () => {
        applyAuthGates();
        chatSessionId = null;
        loadChatSessionIfLoggedIn();
    });

    if (Auth.isLoggedIn()) {
        chatSessionId = `session-${Date.now()}`;
    }
});

// Shows/hides the "locked" overlays on Chat and Image Gen sections based on auth state
function applyAuthGates() {
    const loggedIn = Auth.isLoggedIn();
    const chatOverlay = document.getElementById('chatLockedOverlay');
    const imageOverlay = document.getElementById('imageLockedOverlay');
    if (chatOverlay) chatOverlay.style.display = loggedIn ? 'none' : 'flex';
    if (imageOverlay) imageOverlay.style.display = loggedIn ? 'none' : 'flex';

    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendChatBtn');
    const genBtn = document.getElementById('generateImageBtn');
    if (chatInput) chatInput.disabled = !loggedIn;
    if (sendBtn) sendBtn.disabled = !loggedIn;
    if (genBtn) genBtn.disabled = !loggedIn;
}

async function loadChatSessionIfLoggedIn() {
    if (!Auth.isLoggedIn()) return;
    chatSessionId = chatSessionId || `session-${Date.now()}`;
}

// ============================================================
// Theme Management
// ============================================================
function initializeTheme() {
    const themeToggle = document.getElementById('themeToggle');
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.body.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);

    themeToggle.addEventListener('click', () => {
        const currentTheme = document.body.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.body.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeIcon(newTheme);
    });
}

function updateThemeIcon(theme) {
    const icon = document.querySelector('#themeToggle i');
    icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}

// ============================================================
// Navigation
// ============================================================
function initializeNavigation() {
    const menuToggle = document.getElementById('menuToggle');
    const navLinks = document.querySelector('.nav-links');
    const links = document.querySelectorAll('.nav-link');

    menuToggle.addEventListener('click', () => navLinks.classList.toggle('active'));

    links.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('href').substring(1);
            scrollToSection(targetId);
            navLinks.classList.remove('active');
            links.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
        });
    });

    window.addEventListener('scroll', () => {
        const sections = document.querySelectorAll('section[id]');
        let current = '';
        sections.forEach(section => {
            const sectionTop = section.offsetTop - 100;
            const sectionBottom = sectionTop + section.offsetHeight;
            if (scrollY >= sectionTop && scrollY < sectionBottom) current = section.getAttribute('id');
        });
        links.forEach(link => link.classList.toggle('active', link.getAttribute('href') === `#${current}`));
    });
}

function scrollToSection(sectionId) {
    const element = document.getElementById(sectionId);
    if (element) element.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ============================================================
// AI Chat (auth-gated, persisted to backend)
// ============================================================
function initializeChat() {
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendChatBtn');

    sendBtn.addEventListener('click', () => sendMessage());
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    async function sendMessage() {
        if (!Auth.isLoggedIn()) {
            Auth.openModal('login');
            return;
        }
        const message = chatInput.value.trim();
        if (!message) return;

        addMessage(message, 'user');
        chatInput.value = '';
        if (!chatSessionId) chatSessionId = `session-${Date.now()}`;

        saveMessageSafely(chatSessionId, 'user', message);

        const typingIndicator = addTypingIndicator();

        try {
            const response = await fetch(`https://text.pollinations.ai/${encodeURIComponent(message)}`);
            const text = await response.text();
            typingIndicator.remove();
            addMessage(text, 'bot');
            saveMessageSafely(chatSessionId, 'bot', text);
        } catch (error) {
            console.error('Chat error:', error);
            typingIndicator.remove();
            addMessage('Sorry, I encountered an error. Please try again.', 'bot');
        }
    }

    function addMessage(text, sender) {
        const messagesDiv = document.getElementById('chatMessages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}`;
        messageDiv.innerHTML = `
            <div class="message-avatar"><i class="fas ${sender === 'user' ? 'fa-user' : 'fa-robot'}"></i></div>
            <div class="message-content"><p>${escapeHtml(text)}</p></div>
        `;
        messagesDiv.appendChild(messageDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    function addTypingIndicator() {
        const messagesDiv = document.getElementById('chatMessages');
        const indicator = document.createElement('div');
        indicator.className = 'message bot';
        indicator.innerHTML = `<div class="message-avatar"><i class="fas fa-robot"></i></div><div class="message-content"><div class="loading"></div></div>`;
        messagesDiv.appendChild(indicator);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        return indicator;
    }
}

async function saveMessageSafely(sessionId, sender, text) {
    try {
        await API.saveMessage({ sessionId, sender, text: text.slice(0, 8000) });
    } catch (err) {
        console.warn('Could not save chat message:', err.message);
    }
}

// ============================================================
// Image Generation (auth-gated, persisted to backend)
// ============================================================
function initializeImageGen() {
    const styleBtns = document.querySelectorAll('.style-btn');
    styleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            styleBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentStyle = btn.getAttribute('data-style');
        });
    });

    document.getElementById('generateImageBtn').addEventListener('click', generateImage);
}

async function generateImage() {
    if (!Auth.isLoggedIn()) {
        Auth.openModal('login');
        return;
    }
    const prompt = document.getElementById('imagePrompt').value.trim();
    if (!prompt) {
        showNotification('Please enter an image description!', 'warning');
        return;
    }

    const resultDiv = document.getElementById('imageResult');
    resultDiv.innerHTML = '<div class="loading" style="margin: 50px auto;"></div>';

    try {
        const styleMap = {
            'realistic': 'realistic photo high detail',
            'anime': 'anime style vibrant colors',
            'digital art': 'digital art painting',
            'hd': 'ultra hd 8k quality',
            'cyberpunk': 'cyberpunk futuristic neon',
            'portrait': 'professional portrait detailed',
            'landscape': 'beautiful landscape scenery',
            'fantasy': 'fantasy magical epic'
        };

        const stylePrompt = styleMap[currentStyle] || currentStyle;
        const finalPrompt = `${stylePrompt}, ${prompt}, high quality, no watermark`;
        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}`;

        resultDiv.innerHTML = `
            <div class="result-placeholder">
                <img src="${url}" alt="Generated image" style="max-width: 100%; border-radius: 15px;">
                <p style="margin-top: 1rem;">✨ Generated with ${currentStyle} style</p>
                <button onclick="downloadImage('${url}')" class="btn-download" style="margin-top: 1rem;">
                    <i class="fas fa-download"></i> Download
                </button>
            </div>
        `;

        try {
            await API.saveImage({ prompt, style: currentStyle, imageUrl: url });
        } catch (err) {
            console.warn('Could not save image to history:', err.message);
        }

        showNotification('Image generated successfully!', 'success');
    } catch (error) {
        console.error('Generation error:', error);
        resultDiv.innerHTML = `<div class="result-placeholder"><i class="fas fa-exclamation-triangle"></i><p>Failed to generate image. Please try again.</p></div>`;
        showNotification('Failed to generate image', 'error');
    }
}

function downloadImage(url) {
    const link = document.createElement('a');
    link.href = url;
    link.download = `ai-image-${Date.now()}.jpg`;
    link.click();
}

// ============================================================
// Image Resize Tool (no login required)
// ============================================================
function initializeResizeTool() {
    const uploadArea = document.getElementById('uploadArea');
    const imageUpload = document.getElementById('imageUpload');
    const widthInput = document.getElementById('widthInput');
    const heightInput = document.getElementById('heightInput');
    const maintainRatio = document.getElementById('maintainRatio');
    const applyResizeBtn = document.getElementById('applyResizeBtn');
    const downloadBtn = document.getElementById('downloadResizeBtn');

    uploadArea.addEventListener('click', () => imageUpload.click());
    uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.style.borderColor = 'var(--primary)'; });
    uploadArea.addEventListener('dragleave', () => { uploadArea.style.borderColor = 'var(--border)'; });
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) handleImageUpload(file);
    });

    imageUpload.addEventListener('change', (e) => {
        if (e.target.files[0]) handleImageUpload(e.target.files[0]);
    });

    widthInput.addEventListener('input', () => {
        if (maintainRatio.checked && originalWidth && originalHeight) {
            heightInput.value = Math.round(widthInput.value / (originalWidth / originalHeight));
        }
    });
    heightInput.addEventListener('input', () => {
        if (maintainRatio.checked && originalWidth && originalHeight) {
            widthInput.value = Math.round(heightInput.value * (originalWidth / originalHeight));
        }
    });

    applyResizeBtn.addEventListener('click', applyResize);
    downloadBtn.addEventListener('click', downloadResizedImage);
}

function handleImageUpload(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            originalWidth = img.width;
            originalHeight = img.height;
            originalImage = img;
            document.getElementById('widthInput').value = originalWidth;
            document.getElementById('heightInput').value = originalHeight;
            document.getElementById('resizeControls').style.display = 'block';
            showNotification('Image uploaded successfully!', 'success');
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function applyResize() {
    if (!originalImage) return;
    const newWidth = parseInt(document.getElementById('widthInput').value);
    const newHeight = parseInt(document.getElementById('heightInput').value);

    if (isNaN(newWidth) || isNaN(newHeight) || newWidth <= 0 || newHeight <= 0) {
        showNotification('Please enter valid dimensions!', 'warning');
        return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = newWidth;
    canvas.height = newHeight;
    canvas.getContext('2d').drawImage(originalImage, 0, 0, newWidth, newHeight);

    const resizedImageUrl = canvas.toDataURL('image/jpeg', 0.9);
    document.getElementById('resizedImage').src = resizedImageUrl;
    document.getElementById('resizeResult').style.display = 'block';
    window.resizedImageData = resizedImageUrl;

    if (Auth.isLoggedIn()) API.incrementResize().catch(() => {});
    showNotification('Image resized successfully!', 'success');
}

function downloadResizedImage() {
    if (window.resizedImageData) {
        const link = document.createElement('a');
        link.href = window.resizedImageData;
        link.download = `resized-image-${Date.now()}.jpg`;
        link.click();
    }
}

// ============================================================
// Scroll Animations
// ============================================================
function initializeScrollAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

    document.querySelectorAll('.feature-card, .developer-card').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'all 0.6s ease';
        observer.observe(el);
    });
}

// ============================================================
// Utilities
// ============================================================
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
        <span>${message}</span>
    `;
    notification.style.cssText = `
        position: fixed; bottom: 20px; right: 20px; padding: 1rem 1.5rem;
        background: var(--bg-card);
        border-left: 4px solid ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#6366f1'};
        border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); z-index: 10000;
        animation: slideInRight 0.3s ease; display: flex; align-items: center; gap: 10px;
    `;
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}
window.showNotification = showNotification;

function updateStats() {
    setInterval(() => {
        const usersElement = document.getElementById('totalUsers');
        const imagesElement = document.getElementById('totalImages');
        if (usersElement && imagesElement) {
            const currentUsers = parseInt(usersElement.innerText) || 1200;
            const currentImages = parseInt(imagesElement.innerText) || 50000;
            usersElement.innerText = (currentUsers + Math.floor(Math.random() * 5)) + '+';
            imagesElement.innerText = (currentImages + Math.floor(Math.random() * 100)) + '+';
        }
    }, 30000);
}

const animStyle = document.createElement('style');
animStyle.textContent = `
    @keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    @keyframes slideOutRight { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }
`;
document.head.appendChild(animStyle);
