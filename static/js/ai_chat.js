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
    }

    setupEventListeners() {
        // Open/Close sidebar
        this.openButton.addEventListener('click', () => this.openSidebar());
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
    }

    openSidebar() {
        this.sidebar.classList.add('open');
        this.input.focus();
    }

    closeSidebar() {
        this.sidebar.classList.remove('open');
    }

    sendMessage() {
        const message = this.input.value.trim();
        if (!message) return;

        // Add user message
        this.addMessage(message, 'user');
        this.input.value = '';

        // Mock AI response for now (frontend only)
        setTimeout(() => {
            this.addMessage('This is a mock AI response. Backend integration will be implemented later.', 'ai');
        }, 1000);
    }

    addMessage(text, type) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${type}-message`;

        const textDiv = document.createElement('div');
        textDiv.className = 'message-text';
        textDiv.textContent = text;
        messageDiv.appendChild(textDiv);

        if (type === 'ai') {
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'message-actions';

            // Copy button
            const copyBtn = document.createElement('button');
            copyBtn.innerHTML = '<i class="bi bi-clipboard"></i>';
            copyBtn.title = 'Copy response';
            copyBtn.onclick = () => {
                navigator.clipboard.writeText(text);
                copyBtn.innerHTML = '<i class="bi bi-clipboard-check"></i>';
                setTimeout(() => {
                    copyBtn.innerHTML = '<i class="bi bi-clipboard"></i>';
                }, 2000);
            };

            // Regenerate button
            const regenBtn = document.createElement('button');
            regenBtn.innerHTML = '<i class="bi bi-arrow-clockwise"></i>';
            regenBtn.title = 'Regenerate response';
            regenBtn.onclick = () => this.regenerateResponse();

            actionsDiv.appendChild(copyBtn);
            actionsDiv.appendChild(regenBtn);
            messageDiv.appendChild(actionsDiv);
        }

        this.messageContainer.appendChild(messageDiv);
        this.messageContainer.scrollTop = this.messageContainer.scrollHeight;
        this.messages.push({ type, text });
    }

    regenerateResponse() {
        // Mock regeneration for now
        const lastUserMessage = [...this.messages].reverse()
            .find(m => m.type === 'user')?.text;

        if (lastUserMessage) {
            this.addMessage('This is a regenerated mock AI response. Backend integration will be implemented later.', 'ai');
        }
    }
}

// Initialize AI Chat when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.aiChat = new AiChat();
});

