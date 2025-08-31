class AiChat {
    constructor() {
        this.sidebar = document.getElementById('aiChatSidebar');
        this.openButton = document.getElementById('openAiChatBtn');
        this.closeButton = document.getElementById('closeAiChat');
        this.messageContainer = document.getElementById('chatMessages');
        this.input = document.getElementById('aiChatInput');
        this.sendButton = document.getElementById('sendAiChat');

        this.setupEventListeners();
        this.messages = [];
        this.loadingMessageId = null;
    }

    // Helper to send UI events to the backend
    sendUIEvent(payload) {
        try {
            const body = JSON.stringify(payload);
            if (navigator.sendBeacon) {
                const blob = new Blob([body], { type: 'application/json' });
                navigator.sendBeacon('/log_event', blob);
            } else {
                fetch('/log_event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
            }
        } catch (e) {
            console.debug('sendUIEvent failed', e);
        }
    }

    setupEventListeners() {
        // Open/Close sidebar
        this.openButton.addEventListener('click', () => this.checkKeyAndOpen());
        this.closeButton.addEventListener('click', () => this.closeSidebar());

        // Send message on button click or Enter (without shift)
        this.sendButton.addEventListener('click', () => this.sendMessage());
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Close sidebar when clicking outside
        document.addEventListener('click', (e) => {
            if (this.sidebar.classList.contains('open') &&
                !this.sidebar.contains(e.target) &&
                e.target !== this.openButton) {
                this.closeSidebar();
            }
        });

        // API key modal form handler (if present)
        const aiKeyForm = document.getElementById('aiKeyForm');
        if (aiKeyForm) {
            aiKeyForm.addEventListener('submit', (ev) => {
                ev.preventDefault();
                const input = document.getElementById('aiKeyInput');
                const key = input.value.trim();
                if (!key) return;
                // send key to backend to store in session
                fetch('/api/ai/set_key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: key }) })
                    .then(async res => {
                        const data = await res.json().catch(() => ({}));
                        if (!res.ok) {
                            alert(data.error || 'Failed to save API key');
                            return;
                        }
                        // success: hide modal and open sidebar
                        const modalEl = document.getElementById('aiKeyModal');
                        const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
                        modal.hide();
                        this.sendUIEvent({ category: 'ai_chat', event: 'api_key_saved' });
                        this.openSidebar();
                    })
                    .catch(err => {
                        console.error('Failed to save API key', err);
                        alert('Network error saving API key');
                    });
            });
        }
    }

    async checkKeyAndOpen() {
        try {
            const res = await fetch('/api/ai/has_key');
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.has_key) {
                // show API key modal
                this.sendUIEvent({ category: 'ai_chat', event: 'api_key_missing' });
                const modalEl = document.getElementById('aiKeyModal');
                const modal = new bootstrap.Modal(modalEl);
                modal.show();
                return;
            }
            this.openSidebar();
        } catch (e) {
            console.error('Error checking API key', e);
            alert('Unable to check AI key');
        }
    }

    openSidebar() {
        this.sidebar.classList.add('open');
        this.input.focus();
        this.sendUIEvent({ category: 'ui', event: 'ai_chat_open' });
    }

    closeSidebar() {
        this.sidebar.classList.remove('open');
        this.sendUIEvent({ category: 'ui', event: 'ai_chat_close' });
    }

    async sendMessage() {
        const message = this.input.value.trim();
        if (!message) return;

        // Add user message to UI
        this.addMessage(message, 'user');
        this.input.value = '';
        this.sendUIEvent({ category: 'ai_chat', event: 'send_message', extra: { length: message.length } });

        // Show loading AI bubble
        const loadingId = this.addLoadingMessage();
        this.loadingMessageId = loadingId;
        this.sendButton.disabled = true;

        try {
            const res = await fetch('/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }) });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data.error) {
                const errMsg = data.error || `AI error (${res.status})`;
                // If the error indicates invalid API key, show status at top of sidebar
                if (errMsg === 'Invalid API Key or unauthorized') {
                    this.replaceLoadingWithMessage(loadingId, 'Invalid API Key or unauthorized', 'ai');
                    this.showAiStatus('Invalid API Key — please update your key or clear it.', 'danger', true);
                    this.sendUIEvent({ category: 'ai_chat', event: 'invalid_api_key' });
                } else {
                    this.replaceLoadingWithMessage(loadingId, errMsg, 'ai');
                }
                this.sendUIEvent({ category: 'ai_chat', event: 'response_error', extra: { error: errMsg } });
                this.sendButton.disabled = false;
                return;
            }
            const aiText = data.response || '';
            this.replaceLoadingWithMessage(loadingId, aiText, 'ai');
            this.sendUIEvent({ category: 'ai_chat', event: 'response_rendered', extra: { length: aiText.length } });
        } catch (e) {
            console.error('AI chat request failed', e);
            this.replaceLoadingWithMessage(loadingId, 'AI service unavailable', 'ai');
            this.sendUIEvent({ category: 'ai_chat', event: 'response_error', extra: { error: e.message } });
        } finally {
            this.sendButton.disabled = false;
            this.loadingMessageId = null;
        }
    }

    addLoadingMessage() {
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ai-message loading`;
        const textDiv = document.createElement('div');
        textDiv.className = 'message-text';
        textDiv.textContent = '…';
        messageDiv.appendChild(textDiv);
        this.messageContainer.appendChild(messageDiv);
        this.messageContainer.scrollTop = this.messageContainer.scrollHeight;
        // store index as id
        const id = Date.now();
        messageDiv.dataset.msgId = id;
        this.messages.push({ type: 'ai', text: '...', dom: messageDiv });
        return id;
    }

    replaceLoadingWithMessage(id, text, type) {
        // find DOM node with dataset.msgId == id
        const node = [...this.messageContainer.querySelectorAll('[data-msg-id]')].find(n => n.dataset.msgId == id);
        if (node) {
            node.className = `chat-message ${type}-message`;
            const textDiv = node.querySelector('.message-text');
            if (textDiv) textDiv.textContent = text;
            // attach actions for ai messages
            if (type === 'ai') this._attachAiActions(node, text);
        } else {
            // fallback: add new message
            this.addMessage(text, type);
        }
        this.messageContainer.scrollTop = this.messageContainer.scrollHeight;
    }

    addMessage(text, type) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${type}-message`;

        const textDiv = document.createElement('div');
        textDiv.className = 'message-text';
        if (type === 'ai') {
            // allow html for AI responses if you trust backend
            textDiv.textContent = text;
        } else {
            textDiv.textContent = text;
        }
        messageDiv.appendChild(textDiv);

        if (type === 'ai') {
            this._attachAiActions(messageDiv, text);
        }

        this.messageContainer.appendChild(messageDiv);
        this.messageContainer.scrollTop = this.messageContainer.scrollHeight;
        this.messages.push({ type, text, dom: messageDiv });
    }

    _attachAiActions(messageDiv, text) {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'message-actions';

        // Copy button
        const copyBtn = document.createElement('button');
        copyBtn.innerHTML = '<i class="bi bi-clipboard"></i>';
        copyBtn.title = 'Copy response';
        copyBtn.onclick = () => {
            navigator.clipboard.writeText(text);
            copyBtn.innerHTML = '<i class="bi bi-clipboard-check"></i>';
            // Log copy event
            this.sendUIEvent({ category: 'ai_chat', event: 'copy_response', extra: { length: text.length } });
            setTimeout(() => {
                copyBtn.innerHTML = '<i class="bi bi-clipboard"></i>';
            }, 2000);
        };

        // Regenerate button
        const regenBtn = document.createElement('button');
        regenBtn.innerHTML = '<i class="bi bi-arrow-clockwise"></i>';
        regenBtn.title = 'Regenerate response';
        regenBtn.onclick = () => this._handleRegenerate();

        actionsDiv.appendChild(copyBtn);
        actionsDiv.appendChild(regenBtn);
        messageDiv.appendChild(actionsDiv);
    }

    _handleRegenerate() {
        const lastUserMessage = [...this.messages].reverse().find(m => m.type === 'user')?.text;
        if (!lastUserMessage) return;
        this.sendUIEvent({ category: 'ai_chat', event: 'regenerate_response', extra: { lastUserLength: lastUserMessage.length } });
        // Send the same message again
        this.input.value = lastUserMessage;
        this.sendMessage();
    }

    _attachHoverLogout(button) {
        // create overlay element
        const overlay = document.createElement('div');
        overlay.className = 'ai-logout-overlay';
        overlay.style.position = 'absolute';
        overlay.style.zIndex = 1050;
        overlay.style.display = 'none';
        overlay.style.padding = '4px';
        overlay.style.background = 'rgba(0,0,0,0.8)';
        overlay.style.color = '#fff';
        overlay.style.borderRadius = '4px';
        overlay.style.fontSize = '12px';
        overlay.style.cursor = 'pointer';
        overlay.textContent = 'Sign out AI';

        document.body.appendChild(overlay);

        let hideTimeout = null;

        button.addEventListener('mouseenter', (e) => {
            if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
            const rect = button.getBoundingClientRect();
            overlay.style.left = (rect.right - overlay.offsetWidth) + 'px';
            overlay.style.top = (rect.bottom + 6) + 'px';
            overlay.style.display = 'block';
        });
        button.addEventListener('mouseleave', () => {
            hideTimeout = setTimeout(() => overlay.style.display = 'none', 250);
        });
        overlay.addEventListener('mouseenter', () => {
            if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
            overlay.style.display = 'block';
        });
        overlay.addEventListener('mouseleave', () => {
            hideTimeout = setTimeout(() => overlay.style.display = 'none', 250);
        });

        overlay.addEventListener('click', async () => {
            // Clear API key on server and update UI
            try {
                const res = await fetch('/api/ai/clear_key', { method: 'POST' });
                const data = await res.json().catch(() => ({}));
                if (!res.ok || data.error) {
                    alert(data.error || 'Failed to clear AI key');
                    return;
                }
                overlay.style.display = 'none';
                this.showAiStatus('AI key cleared', 'info');
                this.sendUIEvent({ category: 'ai_chat', event: 'api_key_cleared' });
            } catch (err) {
                console.error('Failed to clear AI key', err);
                alert('Network error while clearing AI key');
            }
        });
    }

    showAiStatus(message, level = 'info', showClearButton = false) {
        const status = document.getElementById('aiStatus');
        if (!status) return;
        status.style.display = 'block';
        status.className = 'ai-status';
        status.textContent = message;
        status.style.background = (level === 'danger') ? '#f8d7da' : (level === 'info' ? '#d1ecf1' : '#fff3cd');
        status.style.color = (level === 'danger') ? '#842029' : '#0c5460';
        // add clear key button if requested
        if (showClearButton) {
            const btn = document.createElement('button');
            btn.className = 'btn btn-sm btn-outline-danger ms-2';
            btn.textContent = 'Clear API Key';
            btn.onclick = async () => {
                try {
                    const res = await fetch('/api/ai/clear_key', { method: 'POST' });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok || data.error) {
                        alert(data.error || 'Failed to clear AI key');
                        return;
                    }
                    this.showAiStatus('AI key cleared', 'info');
                    // show modal to re-enter key
                    const modalEl = document.getElementById('aiKeyModal');
                    const modal = new bootstrap.Modal(modalEl);
                    modal.show();
                    this.sendUIEvent({ category: 'ai_chat', event: 'api_key_cleared' });
                } catch (e) {
                    console.error('Failed to clear AI key', e);
                    alert('Network error');
                }
            };
            // clear previous children
            status.innerHTML = '';
            status.appendChild(document.createTextNode(message));
            status.appendChild(btn);
        }
    }

    clearAiStatus() {
        const status = document.getElementById('aiStatus');
        if (!status) return;
        status.style.display = 'none';
        status.innerHTML = '';
    }
}

// Initialize AI Chat when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.aiChat = new AiChat();
});
