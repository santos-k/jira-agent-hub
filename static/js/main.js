document.addEventListener('DOMContentLoaded', function () {
  // Check if table needs scrolling (more than 5 rows)
  function checkTableScrolling() {
    const tableResponsive = document.querySelector('.table-responsive.scrollable-5');
    const resultsTable = document.getElementById('resultsTable');
    
    if (tableResponsive && resultsTable) {
      const rows = resultsTable.querySelectorAll('.table-row');
      if (rows.length > 5) {
        tableResponsive.classList.add('has-many-rows');
      } else {
        tableResponsive.classList.remove('has-many-rows');
      }
    }
  }
  
  // Run on page load
  checkTableScrolling();
  
  // Auto-dismiss alerts on page load
  autoDismissAlerts();
  const loginForm = document.getElementById('loginForm');
  const loginAlertPlaceholder = document.getElementById('loginAlertPlaceholder');

  function showAlert(message, type = 'danger') {
    loginAlertPlaceholder.innerHTML = `\n      <div class="alert alert-${type} alert-dismissible fade show" role="alert">\n        ${message}\n        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>\n      </div>\n    `;
    // Auto dismiss after 3 seconds
    setTimeout(function() {
      const alertDiv = loginAlertPlaceholder.querySelector('.alert');
      if (alertDiv) {
        // Use Bootstrap's built-in dismiss
        const bsAlert = bootstrap.Alert.getOrCreateInstance(alertDiv);
        bsAlert.close();
      }
    }, 3000);
  }

  // Auto-dismiss all Bootstrap alerts (including flashed messages) after 5 seconds
  function autoDismissAlerts() {
    setTimeout(function() {
      document.querySelectorAll('.alert.fade.show').forEach(function(alertDiv) {
        try {
          const bsAlert = bootstrap.Alert.getOrCreateInstance(alertDiv);
          bsAlert.close();
        } catch (e) {
          alertDiv.classList.remove('show');
          alertDiv.classList.add('hide');
          setTimeout(function() {
            if (alertDiv.parentNode) alertDiv.parentNode.removeChild(alertDiv);
          }, 500);
        }
      });
    }, 5000); // Extended to 5 seconds for better visibility
  }

  if (loginForm) {
    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      loginAlertPlaceholder.innerHTML = '';
      const jiraUrl = document.getElementById('jiraUrl').value.trim();
      const email = document.getElementById('jiraEmail').value.trim();
      const apiToken = document.getElementById('jiraToken').value.trim();

      if (!jiraUrl || !email || !apiToken) {
        showAlert('All fields are required.', 'warning');
        return;
      }

      fetch('/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ jira_url: jiraUrl, email: email, api_token: apiToken })
      })
        .then(async res => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            const msg = data && data.message ? data.message : (`Connection failed (${res.status})`);
            showAlert(msg, 'danger');
            return;
          }
          // success
          // store last used jira url locally so the modal can be prefilled next time
          try { localStorage.setItem('last_jira_url', jiraUrl); } catch (err) { /* ignore */ }
          // close modal and reload to update navbar
          const modalEl = document.getElementById('loginModal');
          const modal = bootstrap.Modal.getInstance(modalEl);
          if (modal) modal.hide();
          window.location.reload();
        })
        .catch(err => {
          showAlert('Network error: ' + err.message, 'danger');
        });
    });
  }

  // Prefill jiraUrl when opening the Connect modal
  const loginModalEl = document.getElementById('loginModal');
  if (loginModalEl) {
    loginModalEl.addEventListener('show.bs.modal', function () {
      try {
        const last = localStorage.getItem('last_jira_url');
        if (last) {
          const jiraUrlInput = document.getElementById('jiraUrl');
          if (jiraUrlInput && !jiraUrlInput.value) jiraUrlInput.value = last;
        }
      } catch (e) {
        // ignore localStorage errors
      }
    });
  }

  // Selection handling: radio buttons in results table
  function attachSelectionHandlers() {
    const radios = document.querySelectorAll('input[type="radio"][name="selected_ticket"]');
    radios.forEach(r => {
      r.addEventListener('change', function (ev) {
        if (!this.checked) return;
        const key = this.value;
        const url = this.dataset.url;
        const summary = this.dataset.summary || '';

        fetch('/select', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ key: key, url: url, summary: summary })
        })
        .then(async res => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            updateSelectedTicketUI({ error: data.message || res.status });
            return;
          }
          updateSelectedTicketUI(data.selected || { key, url, summary });
        })
        .catch(err => {
          updateSelectedTicketUI({ error: 'Network error: ' + err.message });
        });
      });
    });

    // Make entire row clickable for selection (except links and radio buttons)
    const tableRows = document.querySelectorAll('.table-row');
    tableRows.forEach(row => {
      row.addEventListener('click', function(e) {
        // Only proceed if the click wasn't on a link, radio button, or any input element
        if (e.target.tagName !== 'A' && e.target.tagName !== 'INPUT' && e.target.type !== 'radio') {
          const radio = this.querySelector('input[type="radio"]');
          if (radio && !radio.checked) {
            radio.checked = true;
            // Trigger the change event manually
            const changeEvent = new Event('change', { bubbles: true });
            radio.dispatchEvent(changeEvent);
          }
        }
      });
      
      // Add visual feedback for clickable rows
      row.style.cursor = 'pointer';
    });
  }

  // Centralized function to update selected ticket UI and re-attach handlers
  function updateSelectedTicketUI(selected) {
    const selInfo = document.getElementById('selectedInfo');
    if (!selInfo) return;
    if (selected.error) {
      selInfo.innerHTML = `<div class="alert alert-danger">${selected.error}</div>`;
      return;
    }
    if (!selected.key) {
      selInfo.innerHTML = '<div class="text-muted">No ticket selected.</div>';
      return;
    }

    let infoHtml = `<div class="card">
      <div class="card-header d-flex justify-content-between align-items-center">
        <button class="btn btn-link text-start p-0 text-decoration-none fw-bold" type="button" data-bs-toggle="collapse" data-bs-target="#selectedInfoContent" aria-expanded="true" aria-controls="selectedInfoContent">
          <i class="bi bi-chevron-down" id="selectedInfoIcon"></i>
          Selected: <a href="${selected.url}" target="_blank">${selected.key}</a> — ${selected.summary || ''}
        </button>
        <div class="d-flex gap-2 flex-wrap">
          <button type="button" class="btn btn-sm btn-outline-info action-btn" id="viewBtn" title="View ticket in new tab">
            <i class="bi bi-box-arrow-up-right"></i>
            <span class="btn-text d-none d-md-inline ms-1">View</span>
          </button>
          <button type="button" class="btn btn-sm btn-outline-danger action-btn" id="deselectBtn" title="Deselect ticket">
            <i class="bi bi-x-circle"></i>
            <span class="btn-text d-none d-md-inline ms-1">Deselect</span>
          </button>
          <button type="button" class="btn btn-sm btn-primary action-btn" id="generateScenariosBtn" title="Generate test scenarios">
            <i class="bi bi-magic"></i>
            <span class="btn-text d-none d-md-inline ms-1">${selected.test_scenarios && selected.test_scenarios.length > 0 ? 'Regenerate Test Scenarios' : 'Generate Test Scenarios'}</span>
          </button>
        </div>
      </div>
      <div class="collapse show" id="selectedInfoContent">
        <div class="card-body">`;

    if (selected.description_html || selected.description) {
      infoHtml += `<div class="card mt-2">
        <div class="card-header d-flex justify-content-between align-items-center">
          <button class="btn btn-link text-start p-0 text-decoration-none fw-bold" type="button" data-bs-toggle="collapse" data-bs-target="#descriptionContent" aria-expanded="false" aria-controls="descriptionContent">
            <i class="bi bi-chevron-right" id="descriptionIcon"></i>
            Description
          </button>
        </div>
        <div class="collapse" id="descriptionContent">
          <div class="card-body">
            <div class="adf-desc" ${selected.description && !selected.description_html ? 'style="white-space: pre-wrap;"' : ''}></div>
          </div>
        </div>
      </div>`;
    }

    if (selected.test_scenarios && selected.test_scenarios.length > 0) {
      infoHtml += `<div class="card mt-2">
        <div class="card-header d-flex justify-content-between align-items-center">
          <button class="btn btn-link text-start p-0 text-decoration-none fw-bold" type="button" data-bs-toggle="collapse" data-bs-target="#testScenariosContent" aria-expanded="true" aria-controls="testScenariosContent">
            <i class="bi bi-chevron-down" id="testScenariosIcon"></i>
            Generated Test Scenarios
          </button>
        </div>
        <div class="collapse show" id="testScenariosContent">
          <div class="card-body">
            <div class="d-flex justify-content-end mb-2 scenario-controls gap-2 flex-wrap">
              <button class="btn btn-sm btn-outline-secondary action-btn copyAllBtn" title="Copy all scenarios">
                <i class="bi bi-clipboard"></i>
                <span class="btn-text d-none d-md-inline ms-1">Copy All</span>
              </button>
              <button type="button" class="btn btn-sm btn-outline-secondary action-btn manual-prompt-btn" title="Execute manual prompt">
                <i class="bi bi-chat-square-text"></i>
                <span class="btn-text d-none d-md-inline ms-1">Execute Manual</span>
              </button>
              <button type="button" class="btn btn-sm btn-success action-btn update-ticket-btn" title="Update ticket with test scenarios">
                <i class="bi bi-upload"></i>
                <span class="btn-text d-none d-md-inline ms-1">Update Ticket</span>
              </button>
            </div>
            <ol id="testScenariosList">`;
      selected.test_scenarios.forEach(scenario => {
        infoHtml += `<li>${scenario}</li>`;
      });
      infoHtml += `</ol></div></div></div>`;
    }

    infoHtml += `</div>
      </div>
    </div>`;

    selInfo.innerHTML = infoHtml;

    const descDiv = selInfo.querySelector('.adf-desc');
    if (descDiv) {
      if (selected.description_html) {
        descDiv.innerHTML = selected.description_html;
      } else if (selected.description) {
        descDiv.textContent = selected.description;
      }
    }

    attachCollapseHandlers();
    attachViewHandler();
    attachDeselectHandler();
    attachGenerateScenariosHandler();
  }

  // Function to handle collapse icon rotation
  function attachCollapseHandlers() {
    // Handle selectedInfo collapse
    const selectedInfoContent = document.getElementById('selectedInfoContent');
    const selectedInfoIcon = document.getElementById('selectedInfoIcon');
    if (selectedInfoContent && selectedInfoIcon) {
      selectedInfoContent.addEventListener('show.bs.collapse', function () {
        selectedInfoIcon.className = 'bi bi-chevron-down';
      });
      selectedInfoContent.addEventListener('hide.bs.collapse', function () {
        selectedInfoIcon.className = 'bi bi-chevron-right';
      });
    }

    // Handle description collapse
    const descriptionContent = document.getElementById('descriptionContent');
    const descriptionIcon = document.getElementById('descriptionIcon');
    if (descriptionContent && descriptionIcon) {
      descriptionContent.addEventListener('show.bs.collapse', function () {
        descriptionIcon.className = 'bi bi-chevron-down';
      });
      descriptionContent.addEventListener('hide.bs.collapse', function () {
        descriptionIcon.className = 'bi bi-chevron-right';
      });
    }

    // Handle testScenarios collapse
    const testScenariosContent = document.getElementById('testScenariosContent');
    const testScenariosIcon = document.getElementById('testScenariosIcon');
    if (testScenariosContent && testScenariosIcon) {
      testScenariosContent.addEventListener('show.bs.collapse', function () {
        testScenariosIcon.className = 'bi bi-chevron-down';
      });
      testScenariosContent.addEventListener('hide.bs.collapse', function () {
        testScenariosIcon.className = 'bi bi-chevron-right';
      });
    }

    // Handle scenarioHistory collapse
    const scenarioHistoryContent = document.getElementById('scenarioHistoryContent');
    const scenarioHistoryIcon = document.getElementById('scenarioHistoryIcon');
    if (scenarioHistoryContent && scenarioHistoryIcon) {
      scenarioHistoryContent.addEventListener('show.bs.collapse', function () {
        scenarioHistoryIcon.className = 'bi bi-chevron-down';
      });
      scenarioHistoryContent.addEventListener('hide.bs.collapse', function () {
        scenarioHistoryIcon.className = 'bi bi-chevron-right';
      });
    }
  }

  // View button handler
  function attachViewHandler() {
    const viewBtn = document.getElementById('viewBtn');
    if (viewBtn) {
      viewBtn.onclick = function () {
        // Get the selected ticket URL from the header link
        const selectedInfo = document.getElementById('selectedInfo');
        if (selectedInfo) {
          const ticketLink = selectedInfo.querySelector('a[href*="/browse/"]');
          if (ticketLink) {
            window.open(ticketLink.href, '_blank');
          }
        }
      };
    }
  }

  // Deselect button handler
  function attachDeselectHandler() {
    const deselectBtn = document.getElementById('deselectBtn');
    if (deselectBtn) {
      deselectBtn.onclick = function () {
        fetch('/clear_selected', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        }).then(() => {
          updateSelectedTicketUI({});
          const radios = document.querySelectorAll('input[type="radio"][name="selected_ticket"]');
          radios.forEach(r => { r.checked = false; });
        }).catch(err => {
          updateSelectedTicketUI({ error: 'Network error: ' + err.message });
        });
      };
    }
  }

  // Generate Test Scenarios button handler with robust error handling
  function attachGenerateScenariosHandler() {
    const btn = document.getElementById('generateScenariosBtn');
    if (!btn) return;
    btn.onclick = function () {
      const selInfo = document.getElementById('selectedInfo');
      if (!selInfo) return;

      // First check if AI API key is available
      fetch('/api/ai/has_key', {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      })
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.has_key) {
          selInfo.insertAdjacentHTML('beforeend', '<div class="alert alert-warning mt-2">AI API key missing. Please set your API key first.</div>');
          return;
        }

        // Get description from the selected ticket
        let description = '';
        const descDiv = selInfo.querySelector('.adf-desc');
        if (descDiv) {
          description = descDiv.textContent || descDiv.innerText || '';
        }
        if (!description.trim()) {
          selInfo.insertAdjacentHTML('beforeend', '<div class="alert alert-warning mt-2">No description found for this ticket. Please ensure the ticket has a description.</div>');
          return;
        }

        btn.disabled = true;
        const originalIcon = btn.querySelector('i');
        const originalText = btn.querySelector('.btn-text');
        const hasExistingScenarios = selInfo.querySelector('#testScenariosContent');
        
        // Keep icon static, only change text
        if (originalIcon) originalIcon.className = 'bi bi-magic';
        if (originalText) {
          originalText.textContent = hasExistingScenarios ? 'Regenerating...' : 'Generating...';
        }

        // Remove any previous error alerts
        const oldAlerts = selInfo.querySelectorAll('.alert-warning, .alert-danger');
        oldAlerts.forEach(alert => alert.remove());

        fetch('/api/generate_test_scenarios', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ description: description })
        })
        .then(async res => {
          btn.disabled = false;
          if (originalIcon) originalIcon.className = 'bi bi-magic';
          if (originalText) originalText.textContent = 'Regenerate Test Scenarios';
          
          const data = await res.json().catch(() => ({}));

          if (!res.ok || !data.scenarios) {
            let errorMsg = data.error || 'Failed to generate test scenarios.';
            if (res.status === 503) errorMsg = 'AI service is currently unavailable. Please try again later.';
            if (res.status === 403) errorMsg = 'AI API key missing or invalid. Please check your API key.';
            selInfo.insertAdjacentHTML('beforeend', `<div class="alert alert-danger mt-2">${errorMsg}</div>`);
            return;
          }

          // Create expandable scenarios section
          let scenariosHtml = `<div class="card mt-2">
            <div class="card-header d-flex justify-content-between align-items-center">
              <button class="btn btn-link text-start p-0 text-decoration-none fw-bold" type="button" data-bs-toggle="collapse" data-bs-target="#testScenariosContent" aria-expanded="true" aria-controls="testScenariosContent">
                <i class="bi bi-chevron-down" id="testScenariosIcon"></i>
                Generated Test Scenarios
              </button>
            </div>
            <div class="collapse show" id="testScenariosContent">
              <div class="card-body">
                <div class="d-flex justify-content-end mb-2 scenario-controls gap-2 flex-wrap">
                  <button class="btn btn-sm btn-outline-secondary action-btn copyAllBtn" title="Copy all scenarios">
                    <i class="bi bi-clipboard"></i>
                    <span class="d-none d-md-inline ms-1">Copy All</span>
                  </button>
                  <button type="button" class="btn btn-sm btn-outline-secondary action-btn manual-prompt-btn" title="Execute manual prompt">
                    <i class="bi bi-chat-square-text"></i>
                    <span class="d-none d-md-inline ms-1">Execute Manual</span>
                  </button>
                  <button type="button" class="btn btn-sm btn-success action-btn update-ticket-btn" title="Update ticket with test scenarios">
                    <i class="bi bi-upload"></i>
                    <span class="d-none d-md-inline ms-1">Update Ticket</span>
                  </button>
                </div>
                <ol id="testScenariosList">`;

          // Filter out any introductory text that's not actually a test scenario
          const filteredScenarios = data.scenarios.filter(scenario => {
            // Skip introductory text like "Here are concise, end-to-end test scenarios..."
            return !scenario.toLowerCase().includes("here are") && 
                   !scenario.toLowerCase().includes("test scenario");
          });
          
          for (const scenario of filteredScenarios) {
            scenariosHtml += `<li>${scenario}</li>`;
          }
          scenariosHtml += `</ol></div></div></div>`;

          // Remove any previous scenarios section
          const oldTestCard = selInfo.querySelector('#testScenariosContent');
          if (oldTestCard && oldTestCard.parentElement) {
            oldTestCard.parentElement.remove();
          }

          // Insert the scenarios section
          const cardBody = selInfo.querySelector('.card-body');
          if (cardBody) {
            cardBody.insertAdjacentHTML('beforeend', scenariosHtml);
          }

          // Attach collapse handlers for the new test scenarios section
          attachCollapseHandlers();
        })
        .catch(err => {
          btn.disabled = false;
          if (originalIcon) originalIcon.className = 'bi bi-magic';
          if (originalText) {
            const hasExistingScenarios = selInfo.querySelector('#testScenariosContent');
            originalText.textContent = hasExistingScenarios ? 'Regenerate Test Scenarios' : 'Generate Test Scenarios';
          }
          
          selInfo.insertAdjacentHTML('beforeend', `<div class="alert alert-danger mt-2">Network error: ${err.message}</div>`);
        });
      })
      .catch(err => {
        selInfo.insertAdjacentHTML('beforeend', `<div class="alert alert-danger mt-2">Error checking API key: ${err.message}</div>`);
      });
    };
  }

  // Manual Prompt handlers - now using inline chat
  function attachManualPromptHandlers() {
    // Note: Manual prompt now uses inline chat, no modal handlers needed
  }

  // Update Ticket button handler
  function attachUpdateTicketHandler() {
    // Use event delegation since buttons are added dynamically
    document.addEventListener('click', function(e) {
      if (e.target.classList.contains('update-ticket-btn') || e.target.closest('.update-ticket-btn')) {
        e.preventDefault();
        handleUpdateTicketClick();
      }
    });
  }

  function handleUpdateTicketClick() {
    // Get selected ticket and scenarios from session/DOM
    const selectedInfo = document.getElementById('selectedInfo');
    if (!selectedInfo) {
      showAlert('No ticket information available.', 'danger');
      return;
    }

    const testScenariosList = document.getElementById('testScenariosList');
    if (!testScenariosList) {
      showAlert('No test scenarios found. Please generate test scenarios first.', 'warning');
      return;
    }

    // Extract scenarios from the DOM
    const scenarios = Array.from(testScenariosList.querySelectorAll('li')).map(li => li.textContent.trim()).filter(text => text);
    
    if (scenarios.length === 0) {
      showAlert('No test scenarios available to add to the ticket.', 'warning');
      return;
    }

    // Extract ticket information
    const ticketKeyElement = selectedInfo.querySelector('a[href*="/browse/"]');
    const ticketSummaryElement = selectedInfo.querySelector('.card-header');
    
    if (!ticketKeyElement) {
      showAlert('Unable to identify the selected ticket.', 'danger');
      return;
    }

    const ticketKey = ticketKeyElement.textContent.trim();
    const ticketSummary = ticketSummaryElement ? 
      ticketSummaryElement.textContent.replace(/Selected:/g, '').replace(ticketKey, '').replace('—', '').trim() 
      : 'Unknown';

    // Populate modal with ticket and scenario information
    populateUpdateModal(ticketKey, ticketSummary, scenarios);
    
    // Show the modern modal
    showModernModal();
  }

  // Modern modal functions
  function showModernModal() {
    const modal = document.getElementById('updateTicketModal');
    if (modal) {
      modal.classList.add('show');
      document.body.style.overflow = 'hidden';
      
      // Close on backdrop click
      modal.addEventListener('click', function(e) {
        if (e.target === modal) {
          hideModernModal();
        }
      });
      
      // Close on escape key
      document.addEventListener('keydown', handleEscapeKey);
    }
  }
  
  function hideModernModal() {
    const modal = document.getElementById('updateTicketModal');
    if (modal) {
      modal.classList.remove('show');
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleEscapeKey);
    }
  }
  
  function handleEscapeKey(e) {
    if (e.key === 'Escape') {
      hideModernModal();
    }
  }
  
  // Attach close button handlers
  document.addEventListener('click', function(e) {
    if (e.target.matches('[data-bs-dismiss="modal"]') || e.target.closest('[data-bs-dismiss="modal"]')) {
      hideModernModal();
    }
  });

  function populateUpdateModal(ticketKey, ticketSummary, scenarios) {
    // Update modal content
    document.getElementById('updateTicketKey').textContent = ticketKey;
    document.getElementById('updateTicketSummary').textContent = ticketSummary;
    document.getElementById('updateScenariosCount').textContent = scenarios.length;
    
    // Populate scenarios list in modal
    const scenariosList = document.getElementById('updateScenariosList');
    scenariosList.innerHTML = '';
    scenarios.forEach(scenario => {
      const li = document.createElement('li');
      li.textContent = scenario;
      scenariosList.appendChild(li);
    });
  }

  function attachUpdateConfirmHandler() {
    const confirmButton = document.getElementById('confirmUpdateTicket');
    if (confirmButton) {
      confirmButton.addEventListener('click', function() {
        performTicketUpdate();
      });
    }
  }

  function performTicketUpdate() {
    const confirmButton = document.getElementById('confirmUpdateTicket');
    const buttonText = confirmButton.querySelector('.update-btn-text');
    const buttonIcon = confirmButton.querySelector('i');
    
    // Disable button and show loading state
    confirmButton.disabled = true;
    if (buttonIcon) buttonIcon.className = 'bi bi-hourglass-split spinner';
    if (buttonText) buttonText.textContent = 'Updating...';
    
    // Send update request to backend
    fetch('/api/update_ticket_with_scenarios', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    })
    .then(async response => {
      const data = await response.json().catch(() => ({}));
      
      // Re-enable button
      confirmButton.disabled = false;
      if (buttonIcon) buttonIcon.className = 'bi bi-upload';
      if (buttonText) buttonText.textContent = 'Update Ticket';
      
      if (response.ok && data.success) {
        // Close modal
        hideModernModal();
        
        // Show success message using existing alert system
        showAlert(data.message || 'Ticket updated successfully with test scenarios!', 'success');
        
        // Optionally refresh the selected ticket to show updated description
        // The session has been updated on the backend, so next refresh will show new content
      } else {
        // Show error message using existing alert system
        const errorMsg = data.error || 'Failed to update ticket. Please try again.';
        showAlert(errorMsg, 'danger');
      }
    })
    .catch(error => {
      // Re-enable button
      confirmButton.disabled = false;
      if (buttonIcon) buttonIcon.className = 'bi bi-upload';
      if (buttonText) buttonText.textContent = 'Update Ticket';
      
      console.error('Update ticket error:', error);
      showAlert('Network error occurred while updating ticket. Please try again.', 'danger');
    });
  }

  // Inline chat functionality
  function toggleInlineChat(triggerButton) {
    const scenariosCard = triggerButton.closest('.card');
    if (!scenariosCard) return;
    
    let chatContainer = scenariosCard.querySelector('.inline-chat');
    
    if (chatContainer) {
      // Toggle existing chat
      if (chatContainer.style.display === 'none') {
        chatContainer.style.display = 'flex';
        triggerButton.style.backgroundColor = 'var(--bs-primary)';
        triggerButton.style.color = 'white';
      } else {
        chatContainer.style.display = 'none';
        triggerButton.style.backgroundColor = '';
        triggerButton.style.color = '';
      }
    } else {
      // Create new chat interface
      chatContainer = createInlineChat();
      scenariosCard.querySelector('.card-body').appendChild(chatContainer);
      triggerButton.style.backgroundColor = 'var(--bs-primary)';
      triggerButton.style.color = 'white';
    }
  }
  
  function createInlineChat() {
    const chatContainer = document.createElement('div');
    chatContainer.className = 'inline-chat';
    chatContainer.innerHTML = `
      <div class="inline-chat-header">
        <span class="fw-bold">Manual Prompt Chat</span>
        <button type="button" class="btn-close btn-sm" onclick="this.closest('.inline-chat').style.display='none'; this.closest('.card').querySelector('.manual-prompt-btn').style.backgroundColor=''; this.closest('.card').querySelector('.manual-prompt-btn').style.color='';"></button>
      </div>
      <div class="inline-chat-messages" id="inlineChatMessages">
        <div class="inline-chat-message ai">
          Hi! I can help you generate custom test scenarios. What would you like me to focus on?
        </div>
      </div>
      <div class="inline-chat-input">
        <div class="input-group">
          <textarea id="inlineChatInput" class="form-control" rows="1" placeholder="Type your prompt here..."></textarea>
          <button class="btn btn-primary chat-send-btn" type="button" onclick="sendInlineChatMessage()">
            <i class="bi bi-send"></i>
          </button>
        </div>
      </div>
    `;
    
    // Auto-resize textarea
    const textarea = chatContainer.querySelector('#inlineChatInput');
    textarea.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 80) + 'px';
    });
    
    // Handle Enter key
    textarea.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendInlineChatMessage();
      }
    });
    
    return chatContainer;
  }
  
  window.sendInlineChatMessage = function() {
    const input = document.getElementById('inlineChatInput');
    const messages = document.getElementById('inlineChatMessages');
    const sendBtn = input.nextElementSibling;
    
    if (!input || !messages) return;
    
    const prompt = input.value.trim();
    if (!prompt) return;

    // First check if AI API key is available
    fetch('/api/ai/has_key', {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    })
    .then(async res => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.has_key) {
        const errorMsg = document.createElement('div');
        errorMsg.className = 'inline-chat-message ai';
        errorMsg.innerHTML = '<span class="text-danger">AI API key missing. Please set your API key first.</span>';
        messages.appendChild(errorMsg);
        messages.scrollTop = messages.scrollHeight;
        return;
      }

      // Add user message
      const userMsg = document.createElement('div');
      userMsg.className = 'inline-chat-message user';
      userMsg.textContent = prompt;
      messages.appendChild(userMsg);
      
      // Clear input
      input.value = '';
      input.style.height = 'auto';
      
      // Show loading
      const loadingMsg = document.createElement('div');
      loadingMsg.className = 'inline-chat-message ai';
      loadingMsg.innerHTML = '<i class="bi bi-three-dots spinner"></i> Generating scenarios...';
      messages.appendChild(loadingMsg);
      
      // Disable send button
      sendBtn.disabled = true;
      sendBtn.innerHTML = '<i class="bi bi-hourglass spinner"></i>';
      
      // Scroll to bottom
      messages.scrollTop = messages.scrollHeight;
      
      // Get description from the selected ticket
      const selInfo = document.getElementById('selectedInfo');
      let description = '';
      const descDiv = selInfo ? selInfo.querySelector('.adf-desc') : null;
      if (descDiv) {
        description = descDiv.textContent || descDiv.innerText || '';
      }
      
      if (!description.trim()) {
        loadingMsg.remove();
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<i class="bi bi-send"></i>';
        
        const errorMsg = document.createElement('div');
        errorMsg.className = 'inline-chat-message ai';
        errorMsg.innerHTML = '<span class="text-danger">No description found for this ticket. Please ensure the ticket has a description.</span>';
        messages.appendChild(errorMsg);
        messages.scrollTop = messages.scrollHeight;
        return;
      }
      
      // Send to backend
      fetch('/api/manual_prompt_scenarios', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ description: description, prompt: prompt })
      })
      .then(async res => {
        // Remove loading message
        loadingMsg.remove();
        
        // Re-enable send button
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<i class="bi bi-send"></i>';
        
        const data = await res.json().catch(() => ({}));
        
        if (!res.ok || !data.scenarios) {
          let errorMsg = data.error || 'Failed to generate scenarios.';
          if (res.status === 503) errorMsg = 'AI service is currently unavailable. Please try again later.';
          if (res.status === 403) errorMsg = 'AI API key missing or invalid. Please check your API key.';
          if (res.status === 400) errorMsg = data.error || 'Bad request. Please check your input.';
          
          const errorDiv = document.createElement('div');
          errorDiv.className = 'inline-chat-message ai';
          errorDiv.innerHTML = `<span class="text-danger">Error: ${errorMsg}</span>`;
          messages.appendChild(errorDiv);
          messages.scrollTop = messages.scrollHeight;
          return;
        }
        
        // Add AI response
        const aiMsg = document.createElement('div');
        aiMsg.className = 'inline-chat-message ai';
        aiMsg.innerHTML = `<strong>Generated ${data.scenarios.length} scenarios:</strong><br><br>` + 
          data.scenarios.map((s, i) => `${i + 1}. ${s}`).join('<br>');
        messages.appendChild(aiMsg);
        
        // Update the main scenarios list
        const testScenariosList = document.getElementById('testScenariosList');
        if (testScenariosList) {
          // Clear existing scenarios but keep controls
          const controlsDiv = testScenariosList.querySelector('.scenario-controls');
          testScenariosList.innerHTML = '';
          if (controlsDiv) {
            testScenariosList.appendChild(controlsDiv);
          }
          
          // Add new scenarios
          data.scenarios.forEach(s => {
            const li = document.createElement('li');
            li.textContent = s;
            testScenariosList.appendChild(li);
          });
        }
        
        // Update the Generate button text to show "Regenerate Test Scenarios"
        const generateBtn = document.getElementById('generateScenariosBtn');
        if (generateBtn) {
          const btnText = generateBtn.querySelector('span');
          if (btnText) {
            btnText.textContent = 'Regenerate Test Scenarios';
          }
        }
        
        // Scroll to bottom
        messages.scrollTop = messages.scrollHeight;
      })
      .catch(err => {
        // Remove loading message
        loadingMsg.remove();
        
        // Re-enable send button
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<i class="bi bi-send"></i>';
        
        const errorMsg = document.createElement('div');
        errorMsg.className = 'inline-chat-message ai';
        errorMsg.innerHTML = `<span class="text-danger">Network error: ${err.message}</span>`;
        messages.appendChild(errorMsg);
        
        // Scroll to bottom
        messages.scrollTop = messages.scrollHeight;
      });
    })
    .catch(err => {
      const errorMsg = document.createElement('div');
      errorMsg.className = 'inline-chat-message ai';
      errorMsg.innerHTML = `<span class="text-danger">Error checking API key: ${err.message}</span>`;
      messages.appendChild(errorMsg);
      messages.scrollTop = messages.scrollHeight;
    });
  };

  // Global click handler for scenario action buttons
  document.addEventListener('click', function(e) {
    if (e.target.classList.contains('copyAllBtn') || e.target.closest('.copyAllBtn')) {
      const button = e.target.classList.contains('copyAllBtn') ? e.target : e.target.closest('.copyAllBtn');
      const scenariosList = document.getElementById('testScenariosList');
      if (scenariosList) {
        // Get all list items but skip the first one if it contains the controls div
        const items = Array.from(scenariosList.querySelectorAll('li')).filter(item => {
          // Skip items that contain buttons (these are control elements, not scenarios)
          return !item.querySelector('button');
        });
        
        let allText = '';
        items.forEach((item, index) => {
          allText += (index + 1) + '. ' + item.textContent + '\n';
        });
        
        navigator.clipboard.writeText(allText).then(() => {
          const originalIcon = button.querySelector('i');
          const originalText = button.querySelector('.btn-text');
          
          // Change to checkmark
          originalIcon.className = 'bi bi-check-circle';
          if (originalText) originalText.textContent = 'Copied';
          
          // Reset after 2 seconds
          setTimeout(() => {
            originalIcon.className = 'bi bi-clipboard';
            if (originalText) originalText.textContent = 'Copy All';
          }, 2000);
        }).catch(err => {
          console.error('Failed to copy: ', err);
        });
      }
    } else if (e.target.classList.contains('manual-prompt-btn') || e.target.closest('.manual-prompt-btn')) {
      const button = e.target.classList.contains('manual-prompt-btn') ? e.target : e.target.closest('.manual-prompt-btn');
      
      // Toggle inline chat interface
      toggleInlineChat(button);
    } else if (e.target.classList.contains('editScenarioBtn')) {
      const li = e.target.parentElement;
      const oldText = li.firstChild.textContent;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = oldText;
      input.className = 'form-control form-control-sm';
      li.innerHTML = '';
      li.appendChild(input);
      input.focus();
      input.addEventListener('blur', function() {
        li.innerHTML = input.value + ' <button class="btn btn-xs btn-link copyScenarioBtn" title="Copy">📋</button> <button class="btn btn-xs btn-link editScenarioBtn" title="Edit">✏️</button>';
      });
      input.addEventListener('keydown', function(ev) {
        if (ev.key === 'Enter') {
          input.blur();
        }
      });
    }
  });

  // Table sorting for search results
  function sortTableByColumn(table, column, asc = true) {
    const dirModifier = asc ? 1 : -1;
    const tableBody = table.querySelector('.table-body');
    if (!tableBody) return;
    
    const rows = Array.from(tableBody.querySelectorAll('.table-row'));

    // Get the column index mapping
    const columnMap = {
      'key': 1,         // Ticket ID
      'issue_type': 2,  // Issue Type
      'summary': 3,     // Summary
      'assignee': 4,    // Assignee
      'status': 5,      // Status
      'updated': 6      // Last Updated
    };
    
    const colIdx = columnMap[column];
    if (colIdx === undefined) return;

    // Sort rows
    rows.sort((a, b) => {
      const aText = a.children[colIdx]?.textContent.trim().toLowerCase() || '';
      const bText = b.children[colIdx]?.textContent.trim().toLowerCase() || '';
      
      // Numeric sort for Ticket ID if possible
      if (column === 'key') {
        // Try to extract number from KEY-123
        const aNum = parseInt(aText.split('-')[1]);
        const bNum = parseInt(bText.split('-')[1]);
        if (!isNaN(aNum) && !isNaN(bNum)) {
          return (aNum - bNum) * dirModifier;
        }
      }
      if (aText < bText) return -1 * dirModifier;
      if (aText > bText) return 1 * dirModifier;
      return 0;
    });

    // Remove all rows
    while (tableBody.firstChild) {
      tableBody.removeChild(tableBody.firstChild);
    }
    // Re-add sorted rows
    tableBody.append(...rows);
  }

  function updateSortIcons(table, column, asc) {
    const headers = table.querySelectorAll('.header-cell.sortable');
    headers.forEach(header => {
      const icon = header.querySelector('.sort-icon');
      if (!icon) return;
      if (header.dataset.column === column) {
        icon.textContent = asc ? '\u25B2' : '\u25BC'; // ▲ or ▼
      } else {
        icon.textContent = '';
      }
    });
  }

  function attachTableSortHandlers() {
    const table = document.getElementById('resultsTable');
    if (!table) return;
    let currentSort = { column: null, asc: true };
    table.querySelectorAll('.header-cell.sortable').forEach(header => {
      header.addEventListener('click', function () {
        const column = header.dataset.column;
        if (!column) return;
        const asc = currentSort.column === column ? !currentSort.asc : true;
        sortTableByColumn(table, column, asc);
        updateSortIcons(table, column, asc);
        currentSort = { column, asc };
      });
    });
  }

  // Refresh button handler
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', function () {
      refreshBtn.disabled = true;
      fetch('/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      })
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        refreshBtn.disabled = false;
        if (!res.ok || !data.success) {
          showAlert(data.message || 'Failed to refresh.', 'danger');
          return;
        }
        // Update table
        const resultsTable = document.getElementById('resultsTable');
        if (resultsTable && data.results) {
          const tableBody = resultsTable.querySelector('.table-body');
          if (tableBody) {
            tableBody.innerHTML = '';
            data.results.forEach(r => {
              const selected = data.selected && data.selected.key === r.key;
              const statusClass = r.status === 'Done' || r.status === 'Closed' ? 'success' : 
                                 r.status === 'In Progress' ? 'warning' : 'info';
              const issueTypeClass = r.issue_type === 'Story' ? 'primary' : 
                                    r.issue_type === 'Bug' ? 'danger' : 
                                    r.issue_type === 'Defect' ? 'warning' : 'secondary';
              tableBody.innerHTML += `<div class="table-row" data-key="${r.key}">
                <div class="table-cell select-col"><input type="radio" name="selected_ticket" value="${r.key}" data-url="${r.url}" data-summary="${r.summary.replace(/"/g, '&quot;')}"${selected ? ' checked' : ''} class="form-check-input"></div>
                <div class="table-cell ticket-col"><a href="${r.url}" target="_blank" class="fw-semibold">${r.key}</a></div>
                <div class="table-cell issuetype-col"><span class="badge bg-${issueTypeClass}">${r.issue_type}</span></div>
                <div class="table-cell summary-col">${r.summary}</div>
                <div class="table-cell assignee-col"><span class="badge bg-secondary">${r.assignee}</span></div>
                <div class="table-cell status-col"><span class="badge bg-${statusClass}">${r.status}</span></div>
                <div class="table-cell updated-col"><small class="text-muted utc-timestamp" data-timestamp="${r.updated || ''}">${r.updated || ''}</small></div>
              </div>`;
            });
          }
        }
        // Update selected ticket info with new structure
        if (data.selected) {
          updateSelectedTicketUI(data.selected);
        } else {
          updateSelectedTicketUI({});
        }
        // Re-attach radio handlers
        attachSelectionHandlers();
        // Check if table needs scrolling
        checkTableScrolling();
        // Convert timestamps to local time
        convertTimestampsToLocalTime();
      })
      .catch(err => {
        refreshBtn.disabled = false;
        showAlert('Network error: ' + err.message, 'danger');
      });
    });
  }

  // Search form handler: clear selected ticket and description on new search
  const searchForm = document.getElementById('searchForm');
  if (searchForm) {
    searchForm.addEventListener('submit', function (e) {
      // Remove selected ticket info from UI
      const selInfo = document.getElementById('selectedInfo');
      if (selInfo) {
        selInfo.innerHTML = '<div class="text-muted">No ticket selected.</div>';
      }
      // Uncheck all radio buttons
      const radios = document.querySelectorAll('input[type="radio"][name="selected_ticket"]');
      radios.forEach(r => { r.checked = false; });
      // Remove selected ticket from session via backend
      fetch('/clear_selected', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });
    });
  }

  // Initialize handlers
  attachSelectionHandlers();
  attachViewHandler();
  attachGenerateScenariosHandler();
  attachUpdateTicketHandler();
  attachUpdateConfirmHandler();
  attachCollapseHandlers();
  attachTableSortHandlers();
  autoDismissAlerts();
  checkTableScrolling(); // Check if table needs scrolling on page load
  
  // Convert UTC timestamps to user's local timezone
  convertTimestampsToLocalTime();
});

// Function to convert UTC timestamps to user's local timezone
function convertTimestampsToLocalTime() {
  const timestampElements = document.querySelectorAll('.utc-timestamp[data-timestamp]');
  
  timestampElements.forEach(element => {
    const isoTimestamp = element.getAttribute('data-timestamp');
    if (!isoTimestamp || isoTimestamp === '') {
      element.textContent = '';
      return;
    }
    
    try {
      // Parse the ISO timestamp
      const date = new Date(isoTimestamp);
      
      // Check if the date is valid
      if (isNaN(date.getTime())) {
        console.warn('Invalid timestamp:', isoTimestamp);
        element.textContent = isoTimestamp;
        return;
      }
      
      // Format to user's local timezone without timezone abbreviation
      const options = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false, // Use 24-hour format
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      };
      
      // Get the formatted string without timezone
      const localTimeString = date.toLocaleString('en-US', options);
      
      // Update the element with local time (date and time only)
      element.textContent = localTimeString;
      element.title = `Original UTC: ${isoTimestamp}`; // Show original UTC time on hover
      
    } catch (error) {
      console.error('Error converting timestamp:', isoTimestamp, error);
      element.textContent = isoTimestamp; // Fallback to original
    }
  });
}
