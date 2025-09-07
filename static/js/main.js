document.addEventListener('DOMContentLoaded', function () {
  // Check if table needs scrolling (more than 5 rows)
  function checkTableScrolling() {
    const tableResponsive = document.querySelector('.table-responsive.scrollable-5');
    const resultsTable = document.getElementById('resultsTable');
    
    if (tableResponsive && resultsTable) {
      const rows = resultsTable.querySelectorAll('tbody tr');
      if (rows.length > 5) {
        tableResponsive.classList.add('has-many-rows');
      } else {
        tableResponsive.classList.remove('has-many-rows');
      }
    }
  }
  
  // Run on page load
  checkTableScrolling();
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

  // Auto-dismiss all Bootstrap alerts (including flashed messages) after 3 seconds
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
    }, 3000);
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

    // Make entire row clickable for selection (except links)
    const tableRows = document.querySelectorAll('#resultsTable tbody tr');
    tableRows.forEach(row => {
      row.addEventListener('click', function(e) {
        // Only proceed if the click wasn't on a link or the radio button itself
        if (e.target.tagName !== 'A' && e.target.tagName !== 'INPUT') {
          const radio = this.querySelector('input[type="radio"]');
          if (radio && !radio.checked) {
            radio.checked = true;
            // Trigger the change event manually
            const changeEvent = new Event('change', { bubbles: true });
            radio.dispatchEvent(changeEvent);
          }
        }
      });
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
        <div class="d-flex gap-2">
          <button type="button" class="btn btn-sm btn-outline-danger" id="deselectBtn">Deselect</button>
          <button type="button" class="btn btn-sm btn-primary" id="generateScenariosBtn">Generate Test Scenarios</button>
        </div>
      </div>
      <div class="collapse show" id="selectedInfoContent">
        <div class="card-body">`;

    if (selected.description_html || selected.description) {
      infoHtml += `<div class="card mt-2">
        <div class="card-header d-flex justify-content-between align-items-center">
          <button class="btn btn-link text-start p-0 text-decoration-none fw-bold" type="button" data-bs-toggle="collapse" data-bs-target="#descriptionContent" aria-expanded="true" aria-controls="descriptionContent">
            <i class="bi bi-chevron-down" id="descriptionIcon"></i>
            Description
          </button>
        </div>
        <div class="collapse show" id="descriptionContent">
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
            <ol id="testScenariosList">`;
      selected.test_scenarios.forEach(scenario => {
        infoHtml += `<li>${scenario}</li>`;
      });
      infoHtml += `</ol></div></div></div>`;
    }

    infoHtml += `<button type="button" class="btn btn-sm btn-outline-secondary mt-2" id="manualPromptBtn">Execute Manual Prompt</button>
        </div>
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
    attachDeselectHandler();
    attachGenerateScenariosHandler();
    attachManualPromptHandlers();
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
        btn.textContent = 'Generating...';

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
          btn.textContent = 'Regenerate Test Scenarios';
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
                <ol id="testScenariosList">`;

          scenariosHtml += `<div class="d-flex justify-content-end mb-2">
            <button class="btn btn-sm btn-outline-primary me-2 regenerateBtn" title="Regenerate scenarios">Regenerate</button>
            <button class="btn btn-sm btn-outline-secondary copyAllBtn" title="Copy all scenarios">Copy All</button>
          </div>`;
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

          // Insert before the manual prompt button
          const manualBtn = selInfo.querySelector('#manualPromptBtn');
          if (manualBtn) {
            manualBtn.insertAdjacentHTML('beforebegin', scenariosHtml);
          } else {
            const cardBody = selInfo.querySelector('.card-body');
            if (cardBody) {
              cardBody.insertAdjacentHTML('beforeend', scenariosHtml);
            }
          }

          // Attach collapse handlers for the new test scenarios section
          attachCollapseHandlers();
        })
        .catch(err => {
          btn.disabled = false;
          btn.textContent = 'Generate Test Scenarios';
          selInfo.insertAdjacentHTML('beforeend', `<div class="alert alert-danger mt-2">Network error: ${err.message}</div>`);
        });
      })
      .catch(err => {
        selInfo.insertAdjacentHTML('beforeend', `<div class="alert alert-danger mt-2">Error checking API key: ${err.message}</div>`);
      });
    };
  }

  // Manual Prompt Modal logic
  function attachManualPromptHandlers() {
    const manualPromptBtn = document.getElementById('manualPromptBtn');
    const manualPromptModal = document.getElementById('manualPromptModal');
    const manualPromptInput = document.getElementById('manualPromptInput');
    const submitManualPromptBtn = document.getElementById('submitManualPromptBtn');
    const manualPromptError = document.getElementById('manualPromptError');
    let bsManualPromptModal = null;
    if (manualPromptModal) {
      bsManualPromptModal = bootstrap.Modal.getOrCreateInstance(manualPromptModal);
    }
    if (manualPromptBtn && bsManualPromptModal) {
      manualPromptBtn.onclick = function () {
        manualPromptInput.value = '';
        manualPromptError.style.display = 'none';
        manualPromptError.textContent = '';
        submitManualPromptBtn.disabled = false;
        submitManualPromptBtn.textContent = 'Submit/Ask';
        bsManualPromptModal.show();
      };
    }
    if (submitManualPromptBtn && bsManualPromptModal) {
      submitManualPromptBtn.onclick = function () {
        const prompt = manualPromptInput.value.trim();
        if (!prompt) {
          manualPromptError.textContent = 'Prompt cannot be empty.';
          manualPromptError.style.display = 'block';
          return;
        }
        submitManualPromptBtn.disabled = true;
        submitManualPromptBtn.textContent = 'Processing...';
        manualPromptError.style.display = 'none';
        // Get ticket description
        const selInfo = document.getElementById('selectedInfo');
        let description = '';
        const descDiv = selInfo ? selInfo.querySelector('.adf-desc') : null;
        if (descDiv) {
          description = descDiv.textContent || descDiv.innerText || '';
        }
        fetch('/api/manual_prompt_scenarios', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ description: description, prompt: prompt })
        })
        .then(async res => {
          submitManualPromptBtn.disabled = false;
          submitManualPromptBtn.textContent = 'Submit/Ask';
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.scenarios) {
            manualPromptError.textContent = data.error || 'Failed to generate scenarios.';
            manualPromptError.style.display = 'block';
            return;
          }
          bsManualPromptModal.hide();
          // Update scenarios section
          const testScenariosList = document.getElementById('testScenariosList');
          if (testScenariosList) {
            testScenariosList.innerHTML = '';
            // Add Copy All and Regenerate buttons
            const controlsDiv = document.createElement('div');
            controlsDiv.className = 'd-flex justify-content-end mb-2';
            controlsDiv.innerHTML = `
              <button class="btn btn-sm btn-outline-primary me-2 regenerateBtn" title="Regenerate scenarios">Regenerate</button>
              <button class="btn btn-sm btn-outline-secondary copyAllBtn" title="Copy all scenarios">Copy All</button>
            `;
            testScenariosList.appendChild(controlsDiv);
            
            // Filter out any introductory text that's not actually a test scenario
            const filteredScenarios = data.scenarios.filter(scenario => {
              // Skip introductory text like "Here are concise, end-to-end test scenarios..."
              return !scenario.toLowerCase().includes("here are") && 
                     !scenario.toLowerCase().includes("test scenario");
            });
            
            // Add scenarios
            filteredScenarios.forEach(s => {
              const li = document.createElement('li');
              li.textContent = s;
              testScenariosList.appendChild(li);
            });
          }
          // Update history section
          const scenarioHistoryList = document.getElementById('scenarioHistoryList');
          if (scenarioHistoryList && data.history) {
            // Filter out any introductory text from history scenarios
            const filteredHistoryScenarios = data.history.scenarios.filter(scenario => {
              return !scenario.toLowerCase().includes("here are") && 
                     !scenario.toLowerCase().includes("test scenario");
            });
            
            const histLi = document.createElement('li');
            histLi.innerHTML = `<span class="text-muted">${data.history.prompt}</span><ol>${filteredHistoryScenarios.map(s => `<li>${s}</li>`).join('')}</ol>`;
            scenarioHistoryList.appendChild(histLi);
          }
        })
        .catch(err => {
          submitManualPromptBtn.disabled = false;
          submitManualPromptBtn.textContent = 'Submit/Ask';
          manualPromptError.textContent = 'Network error: ' + err.message;
          manualPromptError.style.display = 'block';
        });
      };
    }
    // Copy/Edit/Regenerate actions
    document.addEventListener('click', function(e) {
      if (e.target.classList.contains('copyAllBtn')) {
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
          navigator.clipboard.writeText(allText);
          e.target.textContent = 'Copied ✅';
          setTimeout(() => { e.target.textContent = 'Copy All'; }, 1000);
        }
      } else if (e.target.classList.contains('regenerateBtn')) {
        const generateBtn = document.getElementById('generateScenariosBtn');
        if (generateBtn) {
          generateBtn.click();
        }
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
  }

  // Table sorting for search results
  function sortTableByColumn(table, column, asc = true) {
    const dirModifier = asc ? 1 : -1;
    const tBody = table.tBodies[0];
    const rows = Array.from(tBody.querySelectorAll('tr'));

    // Get the column index
    const headerCells = Array.from(table.tHead.rows[0].cells);
    let colIdx = headerCells.findIndex(th => th.dataset.column === column);
    if (colIdx === -1) return;

    // Sort rows
    rows.sort((a, b) => {
      const aText = a.cells[colIdx].textContent.trim().toLowerCase();
      const bText = b.cells[colIdx].textContent.trim().toLowerCase();
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
    while (tBody.firstChild) {
      tBody.removeChild(tBody.firstChild);
    }
    // Re-add sorted rows
    tBody.append(...rows);
  }

  function updateSortIcons(table, column, asc) {
    const headers = table.querySelectorAll('th.sortable');
    headers.forEach(th => {
      const icon = th.querySelector('.sort-icon');
      if (!icon) return;
      if (th.dataset.column === column) {
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
    table.querySelectorAll('th.sortable').forEach(th => {
      th.addEventListener('click', function () {
        const column = th.dataset.column;
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
          const tbody = resultsTable.querySelector('tbody');
          if (tbody) {
            tbody.innerHTML = '';
            data.results.forEach(r => {
              const selected = data.selected && data.selected.key === r.key;
              tbody.innerHTML += `<tr data-key="${r.key}">
                <td><input type="radio" name="selected_ticket" value="${r.key}" data-url="${r.url}" data-summary="${r.summary.replace(/"/g, '&quot;')}"${selected ? ' checked' : ''}></td>
                <td><a href="${r.url}" target="_blank">${r.key}</a></td>
                <td>${r.summary}</td>
                <td>${r.assignee}</td>
                <td>${r.status}</td>
              </tr>`;
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
  attachGenerateScenariosHandler();
  attachCollapseHandlers();
  attachManualPromptHandlers();
  attachTableSortHandlers();
  autoDismissAlerts();
  checkTableScrolling(); // Check if table needs scrolling on page load
});
