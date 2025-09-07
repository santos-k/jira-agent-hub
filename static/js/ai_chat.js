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

        // render mode element (text or markdown)
        this.renderModeElem = document.getElementById('aiRenderMode');
        if (this.renderModeElem) {
            this.renderModeElem.addEventListener('change', () => this.clearAiStatus());
        }

        // initialize resizer
        this._initResizer();
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

        // AI Logout functionality
        const aiLogoutBtn = document.getElementById('aiLogoutBtn');
        if (aiLogoutBtn) {
            aiLogoutBtn.addEventListener('click', async () => {
                try {
                    // Disable the button to prevent double-clicks
                    aiLogoutBtn.disabled = true;
                    
                    // Clear both API key and session data sequentially for better reliability
                    const clearKeyResponse = await fetch('/api/ai/clear_key', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        }
                    });
                    
                    const clearSessionResponse = await fetch('/api/ai/clear_session', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        }
                    });
                    
                    const keyResult = await clearKeyResponse.json().catch(() => ({ success: false }));
                    const sessionResult = await clearSessionResponse.json().catch(() => ({ success: false }));
                    
                    if (keyResult.success && sessionResult.success) {
                        // Clear chat messages
                        this.messageContainer.innerHTML = '';
                        this.messages = [];
                        
                        // Clear the API key input field in the modal
                        const keyInput = document.getElementById('aiKeyInput');
                        if (keyInput) {
                            keyInput.value = '';
                        }
                        
                        // Clear any status messages
                        this.clearAiStatus();
                        
                        // Close the sidebar
                        this.closeSidebar();
                        
                        // Log successful logout
                        this.sendUIEvent({ category: 'ai_chat', event: 'logout_success' });
                        
                        // Show a brief visual feedback
                        this.showTemporaryMessage('AI session ended successfully');
                    } else {
                        this.showAiStatus('Failed to clear AI session', 'danger');
                    }
                } catch (error) {
                    console.error('Error clearing AI session:', error);
                    this.showAiStatus('Error ending AI session', 'danger');
                } finally {
                    // Re-enable the button
                    aiLogoutBtn.disabled = false;
                }
            });
        }
    }

    async checkKeyAndOpen() {
        const button = this.openButton;
        
        try {
            // Add loading state to button
            button.classList.add('loading');
            button.disabled = true;
            
            // Add a small delay to ensure any logout operations have completed
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const res = await fetch('/api/ai/has_key', {
                method: 'GET',
                headers: { 'Cache-Control': 'no-cache' }
            });
            const data = await res.json().catch(() => ({}));
            
            if (!res.ok || !data.has_key) {
                // show API key modal
                this.sendUIEvent({ category: 'ai_chat', event: 'api_key_missing' });
                const modalEl = document.getElementById('aiKeyModal');
                if (!modalEl) {
                    console.error('aiKeyModal element not found!');
                    alert('AI Key modal not available');
                    return;
                }
                
                // Ensure the input field is empty for a fresh start
                const keyInput = document.getElementById('aiKeyInput');
                if (keyInput) {
                    keyInput.value = '';
                    keyInput.focus();
                }
                
                const modal = new bootstrap.Modal(modalEl);
                modal.show();
                return;
            }
            this.openSidebar();
        } catch (e) {
            console.error('Error checking API key', e);
            alert('Unable to check AI key');
        } finally {
            // Remove loading state
            button.classList.remove('loading');
            button.disabled = false;
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
            if (textDiv) {
                if (type === 'ai') this._renderAiContentToElem(textDiv, text);
                else textDiv.textContent = text;
            }
            // attach actions for ai messages (ensure actions exist)
            if (type === 'ai') {
                // remove old actions if present
                const existing = node.querySelector('.message-actions');
                if (existing) existing.remove();
                this._attachAiActions(node, text);
            }
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
            this._renderAiContentToElem(textDiv, text);
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
    
    showTemporaryMessage(message, duration = 2000) {
        // Create a temporary status message that disappears after a short time
        const status = document.getElementById('aiStatus');
        if (!status) return;
        
        status.style.display = 'block';
        status.className = 'ai-status';
        status.textContent = message;
        status.style.background = '#d1ecf1';
        status.style.color = '#0c5460';
        
        // Auto-hide after duration
        setTimeout(() => {
            status.style.display = 'none';
            status.innerHTML = '';
        }, duration);
    }

    _getRenderMode() {
        try { return (this.renderModeElem && this.renderModeElem.value) ? this.renderModeElem.value : 'markdown'; }
        catch (e) { return 'markdown'; }
    }

    // Render AI content into the message text element according to selected mode
    _renderAiContentToElem(el, text) {
        const mode = this._getRenderMode();
        if (mode === 'markdown' && window.marked && window.DOMPurify) {
            try {
                const raw = marked.parse(text || '');
                const clean = DOMPurify.sanitize(raw, {SAFE_FOR_TEMPLATES: true});
                el.innerHTML = clean;
                return;
            } catch (e) {
                console.debug('Markdown rendering failed, falling back to text', e);
            }
        }
        // Default: render as plain text
        el.textContent = text;
    }

    _initResizer() {
        const resizer = document.getElementById('aiResizer');
        const sidebar = this.sidebar;
        if (!resizer || !sidebar) return;
        // ensure CSS variable exists
        if (!sidebar.style.getPropertyValue('--ai-sidebar-width')) sidebar.style.setProperty('--ai-sidebar-width', '400px');
        let startX = 0;
        let startWidth = 0;
        const minW = 300;
        const maxW = Math.min(window.innerWidth - 100, 900);

        const onMouseMove = (e) => {
            const delta = startX - e.clientX; // dragging left increases width
            let newWidth = startWidth + delta;
            if (newWidth < minW) newWidth = minW;
            if (newWidth > maxW) newWidth = maxW;
            sidebar.style.setProperty('--ai-sidebar-width', `${newWidth}px`);
            sidebar.style.width = `${newWidth}px`;
            // when closed, right should be negative width; when open, right:0 is handled by .open
            if (!sidebar.classList.contains('open')) {
                sidebar.style.right = `calc(-1 * ${newWidth}px)`;
            }
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.cursor = '';
        };

        resizer.addEventListener('mousedown', (ev) => {
            ev.preventDefault();
            startX = ev.clientX;
            const current = parseInt(getComputedStyle(sidebar).getPropertyValue('--ai-sidebar-width')) || sidebar.offsetWidth;
            startWidth = current;
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            document.body.style.cursor = 'col-resize';
        });
    }
}

// Initialize AI Chat when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.aiChat = new AiChat();
    
    // Simple test function to verify logout functionality
    window.testAiLogout = function() {
        console.log('Testing AI logout functionality...');
        const logoutBtn = document.getElementById('aiLogoutBtn');
        if (logoutBtn) {
            console.log('AI logout button found, triggering click...');
            logoutBtn.click();
        } else {
            console.error('AI logout button not found!');
        }
    };
});
