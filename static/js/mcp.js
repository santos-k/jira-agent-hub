/**
 * MCP (Model Context Protocol) integration for Jira Agent Hub
 * This module provides client-side functionality for interacting with the MCP API
 */

const MCPClient = {
    /**
     * Check if MCP is enabled and connected
     * @returns {Promise<Object>} MCP status
     */
    checkStatus: async function() {
        try {
            const response = await fetch('/api/mcp/status');
            return await response.json();
        } catch (error) {
            console.error('Error checking MCP status:', error);
            return { enabled: false, connected: false };
        }
    },

    /**
     * Set up MCP using existing Jira session
     * @returns {Promise<Object>} Setup result
     */
    setupWithJiraSession: async function() {
        try {
            const response = await fetch('/api/mcp/setup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            return await response.json();
        } catch (error) {
            console.error('Error setting up MCP:', error);
            return { success: false, error: 'Failed to set up MCP' };
        }
    },

    /**
     * Set up MCP using OAuth credentials
     * @param {string} cloudId - Atlassian Cloud ID
     * @param {string} accessToken - OAuth access token
     * @returns {Promise<Object>} Setup result
     */
    setupWithOAuth: async function(cloudId, accessToken) {
        try {
            const response = await fetch('/api/mcp/setup/oauth', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    cloud_id: cloudId,
                    access_token: accessToken
                })
            });
            return await response.json();
        } catch (error) {
            console.error('Error setting up MCP with OAuth:', error);
            return { success: false, error: 'Failed to set up MCP with OAuth' };
        }
    },

    /**
     * Execute an MCP action
     * @param {string} action - Action name
     * @param {Object} params - Action parameters
     * @returns {Promise<Object>} Action result
     */
    executeAction: async function(action, params = {}) {
        try {
            const response = await fetch('/api/mcp/execute', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    action: action,
                    params: params
                })
            });
            return await response.json();
        } catch (error) {
            console.error(`Error executing MCP action ${action}:`, error);
            return { success: false, error: `Failed to execute action: ${error.message}` };
        }
    },

    /**
     * Search Jira issues using MCP
     * @param {string} query - Search query
     * @param {number} maxResults - Maximum number of results
     * @returns {Promise<Object>} Search results
     */
    searchIssues: async function(query, maxResults = 10) {
        try {
            const response = await fetch('/api/mcp/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    query: query,
                    max_results: maxResults
                })
            });
            return await response.json();
        } catch (error) {
            console.error('Error searching issues with MCP:', error);
            return { success: false, error: 'Failed to search issues' };
        }
    },

    /**
     * Get a Jira issue using MCP
     * @param {string} issueKey - Jira issue key
     * @returns {Promise<Object>} Issue details
     */
    getIssue: async function(issueKey) {
        try {
            const response = await fetch(`/api/mcp/issue/${issueKey}`);
            return await response.json();
        } catch (error) {
            console.error(`Error getting issue ${issueKey} with MCP:`, error);
            return { success: false, error: 'Failed to get issue' };
        }
    },

    /**
     * Create a Jira issue using MCP
     * @param {Object} issueData - Issue data
     * @returns {Promise<Object>} Created issue
     */
    createIssue: async function(issueData) {
        try {
            const response = await fetch('/api/mcp/issue', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(issueData)
            });
            return await response.json();
        } catch (error) {
            console.error('Error creating issue with MCP:', error);
            return { success: false, error: 'Failed to create issue' };
        }
    },

    /**
     * Update a Jira issue using MCP
     * @param {string} issueKey - Jira issue key
     * @param {Object} issueData - Issue data
     * @returns {Promise<Object>} Update result
     */
    updateIssue: async function(issueKey, issueData) {
        try {
            const response = await fetch(`/api/mcp/issue/${issueKey}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(issueData)
            });
            return await response.json();
        } catch (error) {
            console.error(`Error updating issue ${issueKey} with MCP:`, error);
            return { success: false, error: 'Failed to update issue' };
        }
    },

    /**
     * Add a comment to a Jira issue using MCP
     * @param {string} issueKey - Jira issue key
     * @param {string} comment - Comment text
     * @returns {Promise<Object>} Comment result
     */
    addComment: async function(issueKey, comment) {
        try {
            const response = await fetch(`/api/mcp/issue/${issueKey}/comment`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    comment: comment
                })
            });
            return await response.json();
        } catch (error) {
            console.error(`Error adding comment to issue ${issueKey} with MCP:`, error);
            return { success: false, error: 'Failed to add comment' };
        }
    },

    /**
     * Disconnect MCP
     * @returns {Promise<Object>} Disconnect result
     */
    disconnect: async function() {
        try {
            const response = await fetch('/api/mcp/disconnect', {
                method: 'POST'
            });
            return await response.json();
        } catch (error) {
            console.error('Error disconnecting MCP:', error);
            return { success: false, error: 'Failed to disconnect MCP' };
        }
    }
};

// Initialize MCP when the page loads
document.addEventListener('DOMContentLoaded', async () => {
    // Check if MCP is enabled
    const status = await MCPClient.checkStatus();
    
    if (status.enabled) {
        console.log('MCP integration is enabled');
        
        // Add MCP setup button to the UI if user is logged in
        if (document.querySelector('.user-info')) {
            const mcpButton = document.createElement('button');
            mcpButton.id = 'mcp-setup-btn';
            mcpButton.className = 'btn btn-sm btn-outline-secondary ms-2';
            mcpButton.innerHTML = '<i class="bi bi-plug"></i> MCP';
            mcpButton.title = 'Set up MCP integration';
            
            mcpButton.addEventListener('click', async () => {
                // Try to set up MCP with existing Jira session
                const result = await MCPClient.setupWithJiraSession();
                
                if (result.success) {
                    showToast('MCP integration set up successfully', 'success');
                    mcpButton.classList.remove('btn-outline-secondary');
                    mcpButton.classList.add('btn-success');
                } else {
                    showToast('Failed to set up MCP integration', 'error');
                }
            });
            
            // Add button after the user info
            document.querySelector('.user-info').appendChild(mcpButton);
            
            // Update button state if already connected
            if (status.connected) {
                mcpButton.classList.remove('btn-outline-secondary');
                mcpButton.classList.add('btn-success');
            }
        }
    }
});

// Helper function to show toast notifications
function showToast(message, type = 'info') {
    // Check if toast container exists, if not create it
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.className = 'position-fixed bottom-0 end-0 p-3';
        document.body.appendChild(toastContainer);
    }
    
    // Create toast element
    const toastId = 'toast-' + Date.now();
    const toast = document.createElement('div');
    toast.id = toastId;
    toast.className = `toast align-items-center ${type === 'error' ? 'bg-danger' : type === 'success' ? 'bg-success' : 'bg-info'} text-white`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    toast.setAttribute('aria-atomic', 'true');
    
    // Toast content
    toast.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">
                ${message}
            </div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
    `;
    
    // Add toast to container
    toastContainer.appendChild(toast);
    
    // Initialize and show toast
    const bsToast = new bootstrap.Toast(toast, { autohide: true, delay: 3000 });
    bsToast.show();
    
    // Remove toast after it's hidden
    toast.addEventListener('hidden.bs.toast', () => {
        toast.remove();
    });
}