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
      
      // Enable/disable Clear and Refresh buttons based on whether results are displayed
      const clearBtn = document.querySelector('button[onclick*="clearForm"]');
      const refreshBtn = document.getElementById('refreshBtn');
      
      if (rows.length > 0) {
        // Enable buttons when there are results
        if (clearBtn) {
          clearBtn.disabled = false;
          clearBtn.classList.remove('disabled');
        }
        if (refreshBtn) {
          refreshBtn.disabled = false;
          refreshBtn.classList.remove('disabled');
        }
      } else {
        // Disable buttons when there are no results
        if (clearBtn) {
          clearBtn.disabled = true;
          clearBtn.classList.add('disabled');
        }
        if (refreshBtn) {
          refreshBtn.disabled = true;
          refreshBtn.classList.add('disabled');
        }
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
    // Check if this is for login (uses loginAlertPlaceholder) or general alerts (uses sticky alerts)
    const loginAlertPlaceholder = document.getElementById('loginAlertPlaceholder');
    if (loginAlertPlaceholder && loginAlertPlaceholder.innerHTML.includes(message)) {
      // This is for login alerts
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
    } else {
      // This is for general alerts - use sticky alerts
      showStickyAlert(message, type);
    }
  }

  function showStickyAlert(message, type = 'danger') {
    // Ensure message is concise and meaningful (single line, max 100 characters)
    let conciseMessage = message;
    
    // Handle common error patterns and make them more user-friendly
    if (conciseMessage.includes("Field 'customfield_11334' cannot be set")) {
      conciseMessage = 'Test Plan field not available on this ticket type.';
    } else if (conciseMessage.includes('Failed to fetch')) {
      conciseMessage = 'Connection failed. Please check your network.';
    } else if (conciseMessage.includes('Network error')) {
      conciseMessage = 'Network issue. Please try again.';
    } else if (conciseMessage.includes('Server error')) {
      conciseMessage = 'Server issue. Please try again later.';
    } else if (conciseMessage.includes('API key')) {
      conciseMessage = 'API key issue. Please check your settings.';
    } else if (conciseMessage.includes('Not connected to Jira')) {
      conciseMessage = 'Jira connection required. Please connect first.';
    } else if (conciseMessage.includes('No ticket selected')) {
      conciseMessage = 'Please select a ticket first.';
    } else if (conciseMessage.includes('No test scenarios')) {
      conciseMessage = 'No scenarios to update. Generate some first.';
    } else if (conciseMessage.includes('Update failed')) {
      conciseMessage = 'Update failed. Please try again.';
    } else if (conciseMessage.includes('Unexpected error')) {
      conciseMessage = 'Something went wrong. Please try again.';
    } else if (conciseMessage.includes('Not authenticated')) {
      conciseMessage = 'Authentication failed. Please reconnect to Jira.';
    }
    
    // Truncate if still too long
    if (conciseMessage.length > 100) {
      conciseMessage = conciseMessage.substring(0, 97) + '...';
    }
    
    // Create a new alert element
    const alertId = 'ticket-alert-' + Date.now();
    const alertHtml = `
      <div id="${alertId}" class="alert alert-${type} alert-dismissible fade show sticky-alert single-line-alert" role="alert">
        <i class="bi bi-${type === 'success' ? 'check-circle-fill' : type === 'danger' ? 'exclamation-triangle-fill' : type === 'warning' ? 'exclamation-triangle-fill' : 'info-circle-fill'}"></i>
        ${conciseMessage}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
      </div>
    `;
    
    // Add to sticky alerts container
    const stickyAlerts = document.getElementById('stickyAlerts') || document.querySelector('.sticky-alerts');
    if (stickyAlerts) {
      stickyAlerts.insertAdjacentHTML('beforeend', alertHtml);
      
      // Auto dismiss after 10 seconds
      setTimeout(function() {
        const alertElement = document.getElementById(alertId);
        if (alertElement) {
          const bsAlert = bootstrap.Alert.getOrCreateInstance(alertElement);
          bsAlert.close();
        }
      }, 10000);
    }
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

      // Add loading state to the form
      const submitBtn = loginForm.querySelector('button[type="submit"]');
      const originalBtnText = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.classList.add('loading');
      submitBtn.innerHTML = '<span class="loading-text">Connecting</span>';
      loginForm.classList.add('form-loading');

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
        })
        .finally(() => {
          // Remove loading state
          submitBtn.disabled = false;
          submitBtn.classList.remove('loading');
          submitBtn.innerHTML = originalBtnText;
          loginForm.classList.remove('form-loading');
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

        // Add loading state to the selected ticket area
        const selectedInfo = document.getElementById('selectedInfo');
        if (selectedInfo) {
          selectedInfo.innerHTML = '<div class="loading-overlay"><div class="loading-spinner"></div></div>';
        }

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

    // Add tabs directly without the collapsible wrapper
    infoHtml += `
      <!-- Tabs Navigation -->
      <ul class="nav nav-tabs mb-3" id="descriptionTabs" role="tablist">
        <li class="nav-item" role="presentation">
          <button class="nav-link active" id="description-tab" data-bs-toggle="tab" data-bs-target="#description-pane" type="button" role="tab" aria-controls="description-pane" aria-selected="true">
            <i class="bi bi-file-text"></i> Description
          </button>
        </li>
        <li class="nav-item" role="presentation">
          <button class="nav-link" id="test-scenarios-tab" data-bs-toggle="tab" data-bs-target="#test-scenarios-pane" type="button" role="tab" aria-controls="test-scenarios-pane" aria-selected="false">
            <i class="bi bi-list-check"></i> Test Plan
          </button>
        </li>
        <!-- Always show Generated Test Scenarios Tab -->
        <li class="nav-item" role="presentation">
          <button class="nav-link" id="generated-test-scenarios-tab" data-bs-toggle="tab" data-bs-target="#generated-test-scenarios-pane" type="button" role="tab" aria-controls="generated-test-scenarios-pane" aria-selected="false">
            <i class="bi bi-magic"></i> Generated Test Scenarios
          </button>
        </li>
        <!-- Always show Generated Test Cases Tab -->
        <li class="nav-item" role="presentation">
          <button class="nav-link" id="generated-test-cases-tab" data-bs-toggle="tab" data-bs-target="#generated-test-cases-pane" type="button" role="tab" aria-controls="generated-test-cases-pane" aria-selected="false">
            <i class="bi bi-file-earmark-code"></i> Generated Test Cases
          </button>
        </li>
      </ul>
      
      <!-- Tabs Content -->
      <div class="tab-content" id="descriptionTabsContentInner">
        <!-- Description Tab -->
        <div class="tab-pane fade show active" id="description-pane" role="tabpanel" aria-labelledby="description-tab">
          <div class="adf-desc"></div>
        </div>
        
        <!-- Test Scenarios Tab -->
        <div class="tab-pane fade" id="test-scenarios-pane" role="tabpanel" aria-labelledby="test-scenarios-tab">
          <div class="test-scenarios-field"></div>
        </div>
        
        <!-- Generated Test Scenarios Tab - Always show with conditional content -->
        <div class="tab-pane fade" id="generated-test-scenarios-pane" role="tabpanel" aria-labelledby="generated-test-scenarios-tab">
          <div class="d-flex justify-content-end mb-2 scenario-controls gap-2 flex-wrap">
            <button class="btn btn-sm btn-outline-secondary action-btn copyAllBtn" title="Copy all scenarios">
              <i class="bi bi-clipboard"></i>
              <span class="btn-text d-none d-md-inline ms-1">Copy All</span>
            </button>
            <button type="button" class="btn btn-sm btn-outline-secondary action-btn manual-prompt-btn" title="Execute custom prompt">
              <i class="bi bi-chat-square-text"></i>
              <span class="btn-text d-none d-md-inline ms-1">Custom Prompt</span>
            </button>
            <button type="button" class="btn btn-sm btn-success action-btn update-ticket-btn" title="Update ticket with test scenarios">
              <i class="bi bi-upload"></i>
              <span class="btn-text d-none d-md-inline ms-1">Update Ticket</span>
            </button>
          </div>
          ${selected.test_scenarios && selected.test_scenarios.length > 0 ? `
          <ol id="testScenariosList">
            ${selected.test_scenarios.map(scenario => `
              <li>
                <div class="d-flex align-items-start">
                  <div class="flex-grow-1">${scenario}</div>
                </div>
              </li>
            `).join('')}
          </ol>
          ` : `<div class="text-muted">No generated test scenarios yet. Click "Generate Test Scenarios" to create them.</div>`}
        </div>

        <!-- Generated Test Cases Tab - Always show with conditional content -->
        <div class="tab-pane fade" id="generated-test-cases-pane" role="tabpanel" aria-labelledby="generated-test-cases-tab">
          ${selected.generated_test_cases && selected.generated_test_cases.length > 0 ? `
          <ol id="testCasesList">
            ${selected.generated_test_cases.map((test_case, index) => `
              <li class="d-flex align-items-start">
                <span class="flex-grow-1">${index + 1}. ${test_case}</span>
              </li>
            `).join('')}
          </ol>
          ` : `<div class="text-muted">No generated test cases yet. Click the pencil icon next to a test scenario to generate a test case.</div>`}
        </div>
      </div>`;



    selInfo.innerHTML = infoHtml;

    const descDiv = selInfo.querySelector('.adf-desc');
    const testScenariosDiv = selInfo.querySelector('.test-scenarios-field');
    
    if (descDiv) {
      // Fix: Properly handle all description formats
      if (selected.description_html) {
        descDiv.innerHTML = selected.description_html;
      } else if (selected.description) {
        // If we only have plain text, preserve line breaks
        descDiv.textContent = selected.description;
        descDiv.style.whiteSpace = 'pre-wrap';
      } else {
        descDiv.innerHTML = '<div class="text-muted">No description available</div>';
      }
      
      // Ensure the description content is properly accessible
      descDiv.setAttribute('data-description-loaded', 'true');
    }
    
    if (testScenariosDiv) {
      if (selected.test_scenarios_field) {
        console.log('Test scenarios field data:', selected.test_scenarios_field);
        testScenariosDiv.innerHTML = selected.test_scenarios_field;
      } else {
        testScenariosDiv.innerHTML = '<div class="text-muted">No test scenarios available</div>';
      }
    }

    attachCollapseHandlers();
    attachViewHandler();
    attachDeselectHandler();
    attachGenerateScenariosHandler();
    
    // Make sure the description tab is properly initialized
    initializeDescriptionTabs();
    
    // Auto-scroll to the selected ticket section
    setTimeout(() => {
      const selectedInfoSection = document.getElementById('selectedInfo');
      if (selectedInfoSection) {
        selectedInfoSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  }

  // Function to initialize description tabs
  function initializeDescriptionTabs() {
    // Make sure Bootstrap tabs are properly initialized
    const descriptionTabs = document.getElementById('descriptionTabs');
    if (descriptionTabs) {
      // Initialize Bootstrap tabs if not already done
      const tabTriggerList = [].slice.call(descriptionTabs.querySelectorAll('[data-bs-toggle="tab"]'));
      tabTriggerList.map(function (tabTriggerEl) {
        return new bootstrap.Tab(tabTriggerEl);
      });
      
      // Make sure the description tab is active by default
      const descriptionTab = document.getElementById('description-tab');
      if (descriptionTab) {
        // Don't force activation if another tab is already active
        const activeTab = descriptionTabs.querySelector('.nav-link.active');
        if (!activeTab) {
          // Activate the description tab
          const descriptionTabInstance = new bootstrap.Tab(descriptionTab);
          descriptionTabInstance.show();
        }
      }
    }
  }

  // Function to sync test scenarios to test cases tab
  function syncScenariosToTestCases(scenarios) {
    // Find or create test cases list
    let testCasesList = document.getElementById('testCasesList');
    let testCasesPane = document.getElementById('generated-test-cases-pane');

    if (!testCasesPane) {
      console.error('Test cases pane not found');
      return;
    }

    // Clear existing placeholder text if it exists
    const placeholder = testCasesPane.querySelector('.text-muted');
    if (placeholder) {
      placeholder.remove();
    }

    // Create test cases list if it doesn't exist
    if (!testCasesList) {
      testCasesList = document.createElement('ol');
      testCasesList.id = 'testCasesList';
      testCasesPane.appendChild(testCasesList);
    }

    // Only update test cases if we don't have any in the DOM and we have scenarios
    if (testCasesList.children.length === 0 && scenarios && scenarios.length > 0) {
      testCasesList.innerHTML = '';
      // Add each scenario as a test case with the same structure as existing test cases
      scenarios.forEach((scenario, index) => {
        const li = document.createElement('li');
        li.className = 'd-flex align-items-start';
        li.innerHTML = `
          <span class="flex-grow-1">${index + 1}. ${scenario}</span>
        `;
        testCasesList.appendChild(li);
      });

      // Store the new test cases in backend session for persistence
      storeTestCasesInBackend(scenarios);
    }
  }

  // Function to store test cases in backend session for persistence
  function storeTestCasesInBackend(testCases) {
    try {
      fetch('/api/store_test_cases', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ test_cases: testCases })
      })
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          console.log(`Stored ${data.stored_count || testCases.length} test cases in backend session`);
        } else {
          console.error('Failed to store test cases in backend:', data.error);
        }
      })
      .catch(err => {
        console.error('Error storing test cases in backend:', err);
      });
    } catch (e) {
      console.error('Failed to store test cases in backend:', e);
    }
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
        // Add brief loading state
        const originalIcon = this.querySelector('i');
        const originalText = this.querySelector('.btn-text');
        
        this.disabled = true;
        this.classList.add('loading');
        if (originalIcon) originalIcon.className = 'bi bi-hourglass-split spinner';
        if (originalText) originalText.textContent = 'Deselecting...';
        
        fetch('/clear_selected', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        })
        .then(() => {
          updateSelectedTicketUI({});
          const radios = document.querySelectorAll('input[type="radio"][name="selected_ticket"]');
          radios.forEach(r => { r.checked = false; });
        })
        .catch(err => {
          updateSelectedTicketUI({ error: 'Network error: ' + err.message });
        })
        .finally(() => {
          // Remove loading state
          this.disabled = false;
          this.classList.remove('loading');
          if (originalIcon) originalIcon.className = 'bi bi-x-circle';
          if (originalText) originalText.textContent = 'Deselect';
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

        // Get description from the selected ticket - comprehensive logic for tabbed interface
        let description = '';
        
        // Method 1: Try to get description from the description tab content
        const descriptionPane = selInfo.querySelector('#description-pane');
        if (descriptionPane) {
          // Look for the adf-desc div within the description pane
          const adfDesc = descriptionPane.querySelector('.adf-desc');
          if (adfDesc) {
            // Check if it contains actual content (not the "No description available" message)
            if (adfDesc.innerHTML && !adfDesc.innerHTML.includes('No description available')) {
              description = adfDesc.textContent || adfDesc.innerText || '';
            }
            // If it only has text content, use that
            else if (adfDesc.textContent && !adfDesc.textContent.includes('No description available')) {
              description = adfDesc.textContent || '';
            }
          }
          // If no adf-desc div, try to get content directly from the pane
          else {
            const content = descriptionPane.textContent || descriptionPane.innerText || '';
            if (content && !content.includes('No description available')) {
              description = content;
            }
          }
        }
        
        // Method 2: Try to get description from the tab content directly
        if (!description.trim()) {
          const descriptionTabsContent = selInfo.querySelector('#descriptionTabsContentInner');
          if (descriptionTabsContent) {
            const activePane = descriptionTabsContent.querySelector('.tab-pane.active');
            if (activePane) {
              const adfDesc = activePane.querySelector('.adf-desc');
              if (adfDesc) {
                if (adfDesc.innerHTML && !adfDesc.innerHTML.includes('No description available')) {
                  description = adfDesc.textContent || adfDesc.innerText || '';
                } else if (adfDesc.textContent && !adfDesc.textContent.includes('No description available')) {
                  description = adfDesc.textContent || '';
                }
              }
            }
          }
        }
        
        // Method 3: Try to get description from any .adf-desc element
        if (!description.trim()) {
          const adfDescElements = selInfo.querySelectorAll('.adf-desc');
          for (const adfDesc of adfDescElements) {
            if (adfDesc.innerHTML && !adfDesc.innerHTML.includes('No description available')) {
              description = adfDesc.textContent || adfDesc.innerText || '';
              if (description.trim()) break;
            } else if (adfDesc.textContent && !adfDesc.textContent.includes('No description available')) {
              description = adfDesc.textContent || '';
              if (description.trim()) break;
            }
          }
        }
        
        // Method 4: Try to get description from session data in the card header
        if (!description.trim()) {
          const cardHeader = selInfo.querySelector('.card-header');
          if (cardHeader) {
            const ticketKey = cardHeader.querySelector('a')?.textContent;
            if (ticketKey) {
              // Try to find the ticket in the search results table to get its description
              const tableRows = document.querySelectorAll('.table-row');
              for (const row of tableRows) {
                const rowKey = row.dataset.key;
                if (rowKey === ticketKey) {
                  // Found the row, but we don't have description data in the table
                  // This is a limitation of the current implementation
                  break;
                }
              }
            }
          }
        }
        
        if (!description.trim()) {
          selInfo.insertAdjacentHTML('beforeend', '<div class="alert alert-warning mt-2">No description found for this ticket. Please ensure the ticket has a description.</div>');
          return;
        }

        btn.disabled = true;
        const originalIcon = btn.querySelector('i');
        const originalText = btn.querySelector('.btn-text');
        // Check if there are existing scenarios by looking for the generated test scenarios tab
        const hasExistingScenarios = !!document.getElementById('generated-test-scenarios-tab');
        
        // Add loading state with spinner
        if (originalIcon) originalIcon.className = 'bi bi-hourglass-split spinner';
        if (originalText) {
          originalText.textContent = hasExistingScenarios ? 'Regenerating...' : 'Generating...';
        }
        btn.classList.add('loading');

        // Remove any previous error alerts
        const oldAlerts = selInfo.querySelectorAll('.alert-warning, .alert-danger');
        oldAlerts.forEach(alert => alert.remove());

        fetch('/api/generate_test_scenarios', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ description: description.trim() })
        })
        .then(async res => {
          btn.disabled = false;
          btn.classList.remove('loading');
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

          // Check if the generated test scenarios tab exists, if not create it
          let testScenariosList = document.getElementById('testScenariosList');
          let generatedTab = document.getElementById('generated-test-scenarios-tab');
          let scenariosPane = document.getElementById('generated-test-scenarios-pane');

          // If we have the tab but not the list, look for it inside the existing pane
          if (!testScenariosList && scenariosPane) {
            // First clear any placeholder text that might be present
            const placeholder = scenariosPane.querySelector('.text-muted');
            if (placeholder) {
              placeholder.remove();
            }

            testScenariosList = scenariosPane.querySelector('ol');
            // If still no list, create one
            if (!testScenariosList) {
              testScenariosList = document.createElement('ol');
              testScenariosList.id = 'testScenariosList';

              // Find where to insert the list (after controls if they exist)
              const controls = scenariosPane.querySelector('.scenario-controls');
              if (controls) {
                scenariosPane.insertBefore(testScenariosList, controls.nextSibling);
              } else {
                scenariosPane.appendChild(testScenariosList);
              }
            }
          }
          // If no testScenariosList and no pane, we need to create them - this shouldn't happen
          // with the current UI design but handle it just in case
          else if (!testScenariosList && !scenariosPane) {
            // Create the generated test scenarios tab dynamically
            const tabList = document.getElementById('descriptionTabs');
            const tabContent = document.getElementById('descriptionTabsContentInner');
            
            // Add tab to navigation if it doesn't exist
            if (!generatedTab && tabList) {
              const newTab = document.createElement('li');
              newTab.className = 'nav-item';
              newTab.setAttribute('role', 'presentation');
              newTab.innerHTML = `
                <button class="nav-link" id="generated-test-scenarios-tab" data-bs-toggle="tab" data-bs-target="#generated-test-scenarios-pane" type="button" role="tab" aria-controls="generated-test-scenarios-pane" aria-selected="false">
                  <i class="bi bi-magic"></i> Generated Test Scenarios
                </button>
              `;
              tabList.appendChild(newTab);
              generatedTab = newTab.querySelector('button');
            }

            // Add tab content if it doesn't exist
            if (!scenariosPane && tabContent) {
              const newTabContent = document.createElement('div');
              newTabContent.className = 'tab-pane fade';
              newTabContent.id = 'generated-test-scenarios-pane';
              newTabContent.setAttribute('role', 'tabpanel');
              newTabContent.setAttribute('aria-labelledby', 'generated-test-scenarios-tab');
              newTabContent.innerHTML = `
                <div class="d-flex justify-content-end mb-2 scenario-controls gap-2 flex-wrap">
                  <button class="btn btn-sm btn-outline-secondary action-btn copyAllBtn" title="Copy all scenarios">
                    <i class="bi bi-clipboard"></i>
                    <span class="btn-text d-none d-md-inline ms-1">Copy All</span>
                  </button>
                  <button type="button" class="btn btn-sm btn-outline-secondary action-btn manual-prompt-btn" title="Execute custom prompt">
                    <i class="bi bi-chat-square-text"></i>
                    <span class="btn-text d-none d-md-inline ms-1">Custom Prompt</span>
                  </button>
                  <button type="button" class="btn btn-sm btn-success action-btn update-ticket-btn" title="Update ticket with test scenarios">
                    <i class="bi bi-upload"></i>
                    <span class="btn-text d-none d-md-inline ms-1">Update Ticket</span>
                  </button>
                </div>
                <ol id="testScenariosList"></ol>
              `;
              tabContent.appendChild(newTabContent);

              // Get the newly created pane and list
              scenariosPane = newTabContent;
              testScenariosList = newTabContent.querySelector('#testScenariosList');
            }

            // Reattach event handlers for the new buttons
            attachManualPromptHandlers();
          } else if (testScenariosList && scenariosPane) {
            // If the list already exists, make sure to remove any placeholder text
            const placeholder = scenariosPane.querySelector('.text-muted');
            if (placeholder) {
              placeholder.remove();
            }
          }

          // Make sure the generated test scenarios tab is active
          if (generatedTab) {
            // Use Bootstrap's tab functionality to show the tab
            const tab = new bootstrap.Tab(generatedTab);
            tab.show();
          }
          
          // Filter out any introductory text that's not actually a test scenario
          const filteredScenarios = data.scenarios.filter(scenario => {
            // Skip introductory text like "Here are concise, end-to-end test scenarios..."
            return !scenario.toLowerCase().includes("here are") && 
                   !scenario.toLowerCase().includes("test scenario");
          });
          
          // Clear existing scenarios and ensure the list exists
          if (testScenariosList) {
            testScenariosList.innerHTML = '';

            // Add new scenarios with proper structure for pencil icons
            filteredScenarios.forEach(scenario => {
              const li = document.createElement('li');
              li.innerHTML = `
                <div class="d-flex align-items-start">
                  <div class="flex-grow-1">${scenario}</div>
                </div>
              `;
              testScenariosList.appendChild(li);
            });

            // Sync scenarios to test cases tab
            syncScenariosToTestCases(filteredScenarios);
          }
        })
        .catch(err => {
          btn.disabled = false;
          btn.classList.remove('loading');
          if (originalIcon) originalIcon.className = 'bi bi-magic';
          if (originalText) {
            // Check if there are existing scenarios by looking for the generated test scenarios tab
            const hasExistingScenarios = !!document.getElementById('generated-test-scenarios-tab');
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
      showStickyAlert('No ticket information available.', 'danger');
      return;
    }

    // Updated to find test scenarios list within the tab structure
    const testScenariosList = document.getElementById('testScenariosList');
    if (!testScenariosList) {
      showStickyAlert('No test scenarios found. Please generate test scenarios first.', 'warning');
      return;
    }

    // Extract scenarios from the DOM
    let scenarios = Array.from(testScenariosList.querySelectorAll('li')).map(li => li.textContent.trim()).filter(text => text);
    
    // Apply the same filtering as used in display to ensure consistency
    scenarios = scenarios.filter(scenario => {
      // Skip introductory text like "Here are concise, end-to-end test scenarios..."
      return !scenario.toLowerCase().includes("here are") && 
             !scenario.toLowerCase().includes("test scenario");
    });
    
    if (scenarios.length === 0) {
      showStickyAlert('No test scenarios available to add to the ticket.', 'warning');
      return;
    }

    // Extract ticket information
    const ticketKeyElement = selectedInfo.querySelector('a[href*="/browse/"]');
    const ticketSummaryElement = selectedInfo.querySelector('.card-header');
    
    if (!ticketKeyElement) {
      showStickyAlert('Unable to identify the selected ticket.', 'danger');
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
      // Reset modal state
      resetUpdateModal();
      
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
    
    // Automatically load the preview content when modal opens
    loadTestPlanPreviewOnOpen();
  }

  function loadTestPlanPreviewOnOpen() {
    const confirmButton = document.getElementById('confirmUpdateTicket');
    const buttonText = confirmButton.querySelector('.update-btn-text');
    const buttonIcon = confirmButton.querySelector('i');
    const modal = document.getElementById('updateTicketModal');
    
    // Add loading overlay to the entire modal
    const loadingOverlay = document.createElement('div');
    loadingOverlay.className = 'modal-loading';
    loadingOverlay.innerHTML = `
      <div class="loading-spinner loading-spinner-lg"></div>
      <div class="loading-message">Loading test plan preview...</div>
    `;
    modal.appendChild(loadingOverlay);
    
    // Show loading state on button
    confirmButton.disabled = true;
    confirmButton.classList.add('loading');
    if (buttonIcon) buttonIcon.className = 'bi bi-hourglass-split spinner';
    if (buttonText) buttonText.textContent = 'Loading Preview...';
    
    // Send update request to backend for preview
    fetch('/api/update_ticket_with_scenarios', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    })
    .then(async response => {
      const data = await response.json().catch(() => ({}));
      
      if (response.ok && data.success && data.preview) {
        // Show preview in the existing modal immediately
        showTestPlanPreviewInModal(data.current_content, data.updated_content);
        // Set up the confirm button to directly update
        setupDirectConfirmation(data.updated_content);
      } else {
        // Show error message using sticky alert system
        const errorMsg = data.error || 'Failed to prepare ticket update. Please try again.';
        showStickyAlert(errorMsg, 'danger');
        
        // Reset button text for retry and set up retry handler
        if (buttonText) buttonText.textContent = 'Retry Loading';
        setupDirectConfirmation(null); // null indicates retry mode
      }
    })
    .catch(error => {
      console.error('Load preview error:', error);
      showStickyAlert('Network error occurred while loading preview. Please try again.', 'danger');
      
      // Set up retry handler
      setupDirectConfirmation(null); // null indicates retry mode
    })
    .finally(() => {
      // Remove loading overlay and restore button state
      if (loadingOverlay && loadingOverlay.parentNode) {
        loadingOverlay.remove();
      }
      
      confirmButton.disabled = false;
      confirmButton.classList.remove('loading');
      if (buttonIcon) buttonIcon.className = 'bi bi-check-circle';
      if (buttonText && !buttonText.textContent.includes('Retry')) {
        buttonText.textContent = 'Confirm Update';
      }
    });
  }

  function resetUpdateModal() {
    // Hide the preview section
    const previewSection = document.getElementById('testPlanPreview');
    if (previewSection) {
      previewSection.style.display = 'none';
    }
    
    // Reset button state
    const confirmButton = document.getElementById('confirmUpdateTicket');
    if (confirmButton) {
      confirmButton.disabled = false;
      const icon = confirmButton.querySelector('i');
      const text = confirmButton.querySelector('.update-btn-text');
      if (icon) icon.className = 'bi bi-check-circle';
      if (text) text.textContent = 'Confirm Update';
      
      // Remove any stored data
      delete confirmButton.dataset.updatedContent;
    }
  }

  function attachUpdateConfirmHandler() {
    // This function is now simplified since the confirm button will be set up
    // automatically after the preview loads in loadTestPlanPreviewOnOpen
    console.log('Update confirm handler attached - button will be configured after preview loads');
  }

  function setupDirectConfirmation(updatedContent) {
    const confirmButton = document.getElementById('confirmUpdateTicket');
    if (!confirmButton) return;
    
    // Remove existing event listeners by cloning the button
    const newButton = confirmButton.cloneNode(true);
    confirmButton.parentNode.replaceChild(newButton, confirmButton);
    
    // Add new event listener for direct confirmation
    newButton.addEventListener('click', function() {
      // Check if this is a retry case (no updated content)
      if (!updatedContent) {
        // If no content, this is a retry - reload the preview
        loadTestPlanPreviewOnOpen();
        return;
      }

      // Add loading overlay to modal
      const modal = document.getElementById('updateTicketModal');
      const loadingOverlay = document.createElement('div');
      loadingOverlay.className = 'modal-loading';
      loadingOverlay.innerHTML = `
        <div class="loading-spinner loading-spinner-lg"></div>
        <div class="loading-message">Updating ticket test plan...</div>
      `;
      modal.appendChild(loadingOverlay);
      
      this.disabled = true;
      this.classList.add('loading');
      const icon = this.querySelector('i');
      const text = this.querySelector('.update-btn-text');
      if (icon) icon.className = 'bi bi-hourglass-split spinner';
      if (text) text.textContent = 'Updating...';
      
      fetch('/api/confirm_update_ticket_with_scenarios', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ updated_content: updatedContent })
      })
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        
        if (!res.ok || !data.success) {
          showAlert(data.error || 'Failed to update Test Plan.', 'danger');
          return;
        }
        
        // Show success state briefly before closing
        if (icon) icon.className = 'bi bi-check-circle';
        if (text) text.textContent = 'Success!';
        loadingOverlay.querySelector('.loading-message').textContent = 'Test plan updated successfully!';
        
        setTimeout(() => {
          hideModernModal(); // Close the modal
          showAlert(data.message || 'Test Plan updated successfully!', 'success');
          
          // Refresh the page to show updated content
          setTimeout(() => {
            window.location.reload();
          }, 1000);
        }, 1000);
      })
      .catch(err => {
        showAlert('Network error: ' + err.message, 'danger');
      })
      .finally(() => {
        // Remove loading overlay and restore button state (only if not successful)
        setTimeout(() => {
          if (loadingOverlay && loadingOverlay.parentNode) {
            loadingOverlay.remove();
          }
          
          this.disabled = false;
          this.classList.remove('loading');
          if (!text || text.textContent !== 'Success!') {
            if (icon) icon.className = 'bi bi-check-circle';
            if (text) text.textContent = 'Confirm Update';
          }
        }, 500);
      });
    });
  }

  function showTestPlanPreviewInModal(currentContent, updatedContent) {
    // Get the preview section elements
    const previewSection = document.getElementById('testPlanPreview');
    const currentContentEl = document.getElementById('currentTestPlanContent');
    const updatedContentEl = document.getElementById('updatedTestPlanContent');
    const confirmButton = document.getElementById('confirmUpdateTicket');
    
    if (!previewSection || !currentContentEl || !updatedContentEl) {
      console.error('Preview elements not found in modal');
      return;
      }
    
    // Update the content
    currentContentEl.textContent = currentContent || 'No existing content';
    updatedContentEl.textContent = updatedContent;
    
    // Show the preview section
    previewSection.style.display = 'block';
    
    // Store updated content for confirmation
    confirmButton.dataset.updatedContent = updatedContent;
    
    // Update the confirm handler
    updateConfirmButtonHandler(updatedContent);
    
    // Auto-scroll to the Test Scenarios section within the updated content
    setTimeout(() => {
      // First ensure the modal is fully visible
      const modalContent = document.querySelector('.modern-modal-content');
      if (modalContent) {
        // Find the position of "Test Scenarios:" in the updated content
        const updatedContentText = updatedContentEl.textContent;
        const testScenariosIndex = updatedContentText.indexOf('Test Scenarios:');
        
        if (testScenariosIndex !== -1) {
          // Calculate the position to scroll to
          const lineHeight = 20; // Approximate line height
          const linesToTestScenarios = updatedContentText.substring(0, testScenariosIndex).split('\n').length;
          const scrollToPosition = linesToTestScenarios * lineHeight;
          
          // Scroll the updated content area to the Test Scenarios section
          updatedContentEl.scrollTo({
            top: scrollToPosition - 50, // Leave some margin at the top
            behavior: 'smooth'
          });
        }
        
        // Also scroll the modal to the preview section
        const previewPosition = previewSection.offsetTop;
        modalContent.scrollTo({
          top: previewPosition - 20, // Leave some margin at the top
          behavior: 'smooth'
        });
      }
    }, 200); // Slightly longer delay to ensure DOM is fully rendered
  }

  // Add event listeners for the edit functionality
  function attachEditTestPlanHandlers() {
    // Edit button
    const editBtn = document.getElementById('editTestPlanBtn');
    if (editBtn) {
      editBtn.addEventListener('click', function() {
        const updatedContentEl = document.getElementById('updatedTestPlanContent');
        const editSection = document.getElementById('editTestPlanSection');
        const editableTextarea = document.getElementById('editableTestPlanContent');
        
        if (updatedContentEl && editSection && editableTextarea) {
          // Populate the textarea with the current updated content
          editableTextarea.value = updatedContentEl.textContent;
          
          // Hide the preview and show the edit section
          updatedContentEl.closest('.preview-column').style.display = 'none';
          editSection.style.display = 'block';
          
          // Focus the textarea
          editableTextarea.focus();
        }
      });
    }
    
    // Cancel edit button
    const cancelBtn = document.getElementById('cancelEditTestPlanBtn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', function() {
        const updatedContentEl = document.getElementById('updatedTestPlanContent');
        const editSection = document.getElementById('editTestPlanSection');
        
        if (updatedContentEl && editSection) {
          // Hide the edit section and show the preview
          editSection.style.display = 'none';
          updatedContentEl.closest('.preview-column').style.display = 'block';
        }
      });
    }
    
    // Save edit button
    const saveBtn = document.getElementById('saveEditTestPlanBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', function() {
        const updatedContentEl = document.getElementById('updatedTestPlanContent');
        const editSection = document.getElementById('editTestPlanSection');
        const editableTextarea = document.getElementById('editableTestPlanContent');
        const confirmButton = document.getElementById('confirmUpdateTicket');
        
        if (updatedContentEl && editSection && editableTextarea && confirmButton) {
          // Get the edited content
          const editedContent = editableTextarea.value;
          
          // Update the displayed content
          updatedContentEl.textContent = editedContent;
          
          // Update the stored content for confirmation
          confirmButton.dataset.updatedContent = editedContent;
          
          // Update the confirm handler with the new content
          updateConfirmButtonHandler(editedContent);
          
          // Hide the edit section and show the preview
          editSection.style.display = 'none';
          updatedContentEl.closest('.preview-column').style.display = 'block';
        }
      });
    }
  }

  function updateConfirmButtonHandler(updatedContent) {
    const confirmButton = document.getElementById('confirmUpdateTicket');
    if (!confirmButton) return;
    
    // Remove existing event listeners by cloning the button
    const newButton = confirmButton.cloneNode(true);
    confirmButton.parentNode.replaceChild(newButton, confirmButton);
    
    // Add new event listener for confirmation
    newButton.addEventListener('click', function() {
      if (!updatedContent) {
        showStickyAlert('No updated content available.', 'danger');
        return;
      }

      // Add loading overlay to modal
      const modal = document.getElementById('updateTicketModal');
      const loadingOverlay = document.createElement('div');
      loadingOverlay.className = 'modal-loading';
      loadingOverlay.innerHTML = `
        <div class="loading-spinner loading-spinner-lg"></div>
        <div class="loading-message">Updating ticket test plan...</div>
      `;
      modal.appendChild(loadingOverlay);
      
      this.disabled = true;
      this.classList.add('loading');
      const icon = this.querySelector('i');
      const text = this.querySelector('.update-btn-text');
      if (icon) icon.className = 'bi bi-hourglass-split spinner';
      if (text) text.textContent = 'Updating...';
      
      fetch('/api/confirm_update_ticket_with_scenarios', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ updated_content: updatedContent })
      })
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        
        if (!res.ok || !data.success) {
          showStickyAlert(data.error || 'Failed to update Test Plan.', 'danger');
          return;
        }
        
        // Show success state briefly before closing
        if (icon) icon.className = 'bi bi-check-circle';
        if (text) text.textContent = 'Success!';
        loadingOverlay.querySelector('.loading-message').textContent = 'Test plan updated successfully!';
        
        setTimeout(() => {
          hideModernModal(); // Close the modal
          showStickyAlert(data.message || 'Test Plan updated successfully!', 'success');
          
          // Refresh the page to show updated content
          setTimeout(() => {
            window.location.reload();
          }, 1000);
        }, 1000);
      })
      .catch(err => {
        showStickyAlert('Network error: ' + err.message, 'danger');
      })
      .finally(() => {
        // Remove loading overlay and restore button state (only if not successful)
        setTimeout(() => {
          if (loadingOverlay && loadingOverlay.parentNode) {
            loadingOverlay.remove();
          }
          
          this.disabled = false;
          this.classList.remove('loading');
          if (!text || text.textContent !== 'Success!') {
            if (icon) icon.className = 'bi bi-check-circle';
            if (text) text.textContent = 'Confirm Update';
          }
        }, 500);
      });
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
        <span class="fw-bold">Custom Prompt Chat</span>
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
      this.style.height = (this.scrollHeight) + 'px';
    });
    textarea.addEventListener('focus', function() {
      this.style.height = 'auto';
      this.style.height = (this.scrollHeight) + 'px';
    });
    textarea.addEventListener('blur', function() {
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
      
      // Add loading message to inline chat
      const loadingMsg = document.createElement('div');
      loadingMsg.className = 'inline-chat-message ai';
      loadingMsg.innerHTML = '<div class="ai-thinking"><span></span><span></span><span></span></div> Generating scenarios...';
      messages.appendChild(loadingMsg);
      
      // Disable send button with loading state
      sendBtn.disabled = true;
      sendBtn.classList.add('loading');
      sendBtn.innerHTML = '<div class="loading-spinner loading-spinner-sm"></div>';
      
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
        sendBtn.classList.remove('loading');
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
        sendBtn.classList.remove('loading');
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
        
        // Add AI response with strict formatting rules
        const aiMsg = document.createElement('div');
        aiMsg.className = 'inline-chat-message ai';
        
        // Apply the same filtering as used in backend to ensure consistency
        // Apply the same filtering as used in backend to ensure consistency
        const filteredScenarios = data.scenarios.filter(scenario => {
          // Skip clear introductory text
          return !scenario.toLowerCase().startsWith("here are") && 
                 !scenario.toLowerCase().startsWith("in conclusion") &&
                 scenario.length > 15; // Minimum length for a meaningful scenario
        });
        
        // Format scenarios with plain integer numbering
        const formattedScenarios = filteredScenarios.map((scenario, index) => {
          // Remove any existing markers and ensure plain integer numbering format
          const cleanScenario = scenario.replace(/^(?:\d+\.|-|•|\*)\s*/, '').trim();
          return `${index + 1}. ${cleanScenario}`;
        });
        
        aiMsg.innerHTML = `<strong>Generated ${formattedScenarios.length} scenarios:</strong><br><br>` + 
          formattedScenarios.join('<br>');
        messages.appendChild(aiMsg);
        
        // Update the main scenarios list with strict formatting
        const testScenariosList = document.getElementById('testScenariosList');
        if (testScenariosList) {
          // Clear existing scenarios but keep controls
          const scenarioControls = testScenariosList.querySelector('.scenario-controls');
          testScenariosList.innerHTML = '';
          if (scenarioControls) {
            testScenariosList.appendChild(scenarioControls);
          }
          
          // Add new scenarios with strict formatting
          formattedScenarios.forEach(scenario => {
            const li = document.createElement('li');
            // Extract just the text part after the numbering
            const scenarioText = scenario.replace(/^\d+\.\s*/, '');
            li.textContent = scenarioText;
            testScenariosList.appendChild(li);
          });
          
          // Auto-scroll to the generated test scenarios section and ensure it's expanded
          // Updated to work with tab structure
          setTimeout(() => {
            // First make sure the tab is active
            const generatedTab = document.getElementById('generated-test-scenarios-tab');
            if (generatedTab) {
              // Use Bootstrap's tab functionality to show the tab
              const tab = new bootstrap.Tab(generatedTab);
              tab.show();
            }
            
            // Scroll to the tab content
            const tabContent = document.getElementById('generated-test-scenarios-pane');
            if (tabContent) {
              tabContent.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }, 100);
        }
        // Update the Generate button text to show "Regenerate Test Scenarios"
        const generateBtn = document.getElementById('generateScenariosBtn');
        if (generateBtn) {
          const btnText = generateBtn.querySelector('.btn-text');
          if (btnText) {
            btnText.textContent = 'Regenerate Test Scenarios';
          }
          // Also update the title attribute
          generateBtn.title = 'Regenerate test scenarios';
        }
        
        // Scroll to bottom
        messages.scrollTop = messages.scrollHeight;
      })
      .catch(err => {
        // Remove loading message
        loadingMsg.remove();
        
        // Re-enable send button
        sendBtn.disabled = false;
        sendBtn.classList.remove('loading');
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
          // Apply formatting with plain integer numbering
          allText += (index + 1) + '. ' + item.textContent + '\n';
        });
        
        navigator.clipboard.writeText(allText).then(() => {
          const originalIcon = button.querySelector('i');
          const originalText = button.querySelector('.btn-text');
          
          // Add brief loading state
          button.classList.add('loading');
          
          // Change to checkmark
          originalIcon.className = 'bi bi-check-circle';
          if (originalText) originalText.textContent = 'Copied';
          
          // Reset after 2 seconds
          setTimeout(() => {
            button.classList.remove('loading');
            originalIcon.className = 'bi bi-clipboard';
            if (originalText) originalText.textContent = 'Copy All';
          }, 2000);
        }).catch(err => {
          console.error('Failed to copy: ', err);
          // Show error state briefly
          const originalIcon = button.querySelector('i');
          const originalText = button.querySelector('.btn-text');
          originalIcon.className = 'bi bi-exclamation-triangle';
          if (originalText) originalText.textContent = 'Failed';
          
          setTimeout(() => {
            originalIcon.className = 'bi bi-clipboard';
            if (originalText) originalText.textContent = 'Copy All';
          }, 2000);
        });
      }
    } else if (e.target.classList.contains('manual-prompt-btn') || e.target.closest('.manual-prompt-btn')) {
      const button = e.target.classList.contains('manual-prompt-btn') ? e.target : e.target.closest('.manual-prompt-btn');
      
      // Toggle inline chat interface
      toggleInlineChat(button);
    } else if (e.target.classList.contains('editScenarioBtn')) {
      // Prevent edit functionality for standard scenario items
      // Only allow editing for items that are explicitly marked as editable
      const li = e.target.closest('li');
      if (!li || !li.classList.contains('editable-scenario')) {
        return;
      }

      const oldText = li.querySelector('.flex-grow-1').textContent;
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
      // Special handling for the updated column (date/time sorting)
      if (column === 'updated') {
        const aTimestamp = a.children[colIdx]?.querySelector('.utc-timestamp')?.getAttribute('data-timestamp') || '';
        const bTimestamp = b.children[colIdx]?.querySelector('.utc-timestamp')?.getAttribute('data-timestamp') || '';
        
        // If both have timestamps, compare them as dates
        if (aTimestamp && bTimestamp) {
          const aDate = new Date(aTimestamp);
          const bDate = new Date(bTimestamp);
          
          // Check if dates are valid
          if (!isNaN(aDate.getTime()) && !isNaN(bDate.getTime())) {
            return (aDate.getTime() - bDate.getTime()) * dirModifier;
          }
        }
        
        // Fallback to string comparison for invalid dates
        const aText = aTimestamp || '';
        const bText = bTimestamp || '';
        if (aText < bText) return -1 * dirModifier;
        if (aText > bText) return 1 * dirModifier;
        return 0;
      }
      
      // Default text-based sorting for other columns
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
    
    // Check if there's a preserved sort state
    if (window.tableSortState) {
      currentSort = window.tableSortState;
      // Apply the preserved sort immediately
      if (currentSort.column) {
        sortTableByColumn(table, currentSort.column, currentSort.asc);
        updateSortIcons(table, currentSort.column, currentSort.asc);
      }
    }
    
    table.querySelectorAll('.header-cell.sortable').forEach(header => {
      header.addEventListener('click', function () {
        const column = header.dataset.column;
        if (!column) return;
        const asc = currentSort.column === column ? !currentSort.asc : true;
        sortTableByColumn(table, column, asc);
        updateSortIcons(table, column, asc);
        currentSort = { column, asc };
        
        // Preserve sort state for refresh operations
        window.tableSortState = currentSort;
      });
    });
  }

  // Refresh button handler
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', function () {
      // Add loading state to refresh button
      const originalIcon = refreshBtn.querySelector('i');
      const originalText = refreshBtn.querySelector('.btn-text');
      const originalContent = refreshBtn.innerHTML;
      
      refreshBtn.disabled = true;
      refreshBtn.classList.add('loading');
      if (originalIcon) originalIcon.className = 'bi bi-arrow-repeat spinner';
      if (originalText) originalText.textContent = 'Refreshing...';
      
      // Add loading overlay to results table if it exists
      const resultsTable = document.getElementById('resultsTable');
      if (resultsTable) {
        resultsTable.classList.add('table-loading');
      }

      fetch('/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      })
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          // Don't show alert for refresh errors as per requirements
          return;
        }
        // Update table
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
          
          // Enable Clear and Refresh buttons since we now have results
          const clearBtn = document.querySelector('button[onclick*="clearForm"]');
          if (clearBtn) {
            clearBtn.disabled = false;
            clearBtn.classList.remove('disabled');
          }
          refreshBtn.disabled = false;
          refreshBtn.classList.remove('disabled');
        }
        // Update selected ticket info with new structure
        if (data.selected) {
          updateSelectedTicketUI(data.selected);
        } else {
          updateSelectedTicketUI({});
        }
        // Re-attach radio handlers
        attachSelectionHandlers();
        // Re-attach table sort handlers to apply preserved sort state
        attachTableSortHandlers();
        // Check if table needs scrolling
        checkTableScrolling();
        // Convert timestamps to local time
        convertTimestampsToLocalTime();
      })
      .catch(err => {
        // Don't show alert for network errors during refresh as per requirements
      })
      .finally(() => {
        // Remove loading states
        refreshBtn.disabled = false;
        refreshBtn.classList.remove('loading');
        if (originalIcon) originalIcon.className = 'bi bi-arrow-repeat';
        if (originalText) originalText.textContent = 'Refresh';
        if (resultsTable) {
          resultsTable.classList.remove('table-loading');
        }
      });
    });
  }

  // Search form handler: clear selected ticket and description on new search
  const searchForm = document.getElementById('searchForm');
  if (searchForm) {
    searchForm.addEventListener('submit', function (e) {
      // Add loading state to search form
      const submitBtn = searchForm.querySelector('button[type="submit"]');
      // Updated selector to be more specific and reliable
      const searchInput = document.getElementById('queryInput') || searchForm.querySelector('input[name="query"]');
      const originalBtnContent = submitBtn ? submitBtn.innerHTML : '';
      
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.classList.add('loading');
        const icon = submitBtn.querySelector('i');
        const text = submitBtn.querySelector('.btn-text, span');
        if (icon) icon.className = 'bi bi-hourglass-split spinner';
        if (text) text.textContent = 'Searching...';
      }
      
      if (searchInput) {
        searchInput.classList.add('search-loading');
        // Removed disabling of searchInput to ensure form data is submitted properly
        // searchInput.disabled = true;
      }
      
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
      
      // Note: The actual search response will remove loading states when the page reloads
      // or when the response is processed by the server-side rendering
    });
  }

  // Clear button handler: disable buttons when clearing results
  const clearForm = document.getElementById('clearForm');
  if (clearForm) {
    clearForm.addEventListener('submit', function () {
      // Disable Clear and Refresh buttons after clearing
      setTimeout(() => {
        const clearBtn = document.querySelector('button[onclick*="clearForm"]');
        const refreshBtn = document.getElementById('refreshBtn');
        if (clearBtn) {
          clearBtn.disabled = true;
          clearBtn.classList.add('disabled');
        }
        if (refreshBtn) {
          refreshBtn.disabled = true;
          refreshBtn.classList.add('disabled');
        }
      }, 100);
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
  attachEditTestPlanHandlers(); // Add this line
  initializeDescriptionTabs(); // Initialize description tabs
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
      
      // Format to user's local timezone with abbreviated month
      const options = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      };
      
      // Get formatted string and adjust format to "Aug 20 2025, 8:10 AM"
      const formattedString = date.toLocaleString('en-US', options);
      
      // Convert from "Aug 20, 2025, 8:10 AM" to "Aug 20 2025, 8:10 AM"
      const localTimeString = formattedString.replace(/(\w{3} \d{1,2}), (\d{4})/, '$1 $2');
      
      // Update the element with local time (format: "Aug 20 2025, 8:10 AM")
      element.textContent = localTimeString;
      element.title = `Original UTC: ${isoTimestamp}`; // Show original UTC time on hover
      
    } catch (error) {
      console.error('Error converting timestamp:', isoTimestamp, error);
      element.textContent = isoTimestamp; // Fallback to original
    }
  });
}
