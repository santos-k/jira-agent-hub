document.addEventListener('DOMContentLoaded', function () {
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
            const selInfo = document.getElementById('selectedInfo');
            if (selInfo) selInfo.innerHTML = `<div class="alert alert-danger">Failed to select ticket: ${data.message || res.status}</div>`;
            return;
          }
          // update selectedInfo UI
          const selInfo = document.getElementById('selectedInfo');
          if (selInfo) {
            const selected = data.selected || { key, url, summary };
            let infoHtml = `<div class="alert alert-info d-flex justify-content-between align-items-center">`;
            infoHtml += `<span>Selected: <a href="${selected.url}" target="_blank">${selected.key}</a> — ${selected.summary || ''}</span>`;
            infoHtml += `<div class="d-flex gap-2"><button type="button" class="btn btn-sm btn-outline-danger ms-2" id="deselectBtn">Deselect</button><button type="button" class="btn btn-sm btn-outline-primary ms-2" id="generateScenariosBtn">Generate Test Scenarios</button></div>`;
            infoHtml += `</div>`;
            if (selected.description_html) {
              const descWrapper = `<div class="card mt-2"><div class="card-body"><h6 class="card-title">Description</h6><div class="adf-desc"></div></div></div>`;
              selInfo.innerHTML = infoHtml + descWrapper;
              const descDiv = selInfo.querySelector('.adf-desc');
              if (descDiv) descDiv.innerHTML = selected.description_html;
            } else if (selected.description) {
              const descWrapper = `<div class="card mt-2"><div class="card-body"><h6 class="card-title">Description</h6><div class="adf-desc" style="white-space: pre-wrap;"></div></div></div>`;
              selInfo.innerHTML = infoHtml + descWrapper;
              const descDiv = selInfo.querySelector('.adf-desc');
              if (descDiv) descDiv.textContent = selected.description;
            } else {
              selInfo.innerHTML = infoHtml;
            }
            // Remove any previous scenarios section
            const oldList = selInfo.querySelector('#testScenariosList');
            if (oldList && oldList.parentElement && oldList.parentElement.parentElement) {
              oldList.parentElement.parentElement.remove();
            }
            attachDeselectHandler();
            attachGenerateScenariosHandler();
          }
         })
        .catch(err => {
          const selInfo = document.getElementById('selectedInfo');
          if (selInfo) selInfo.innerHTML = `<div class="alert alert-danger">Network error: ${err.message}</div>`;
        });
      });
    });
  }

  // Deselect button handler
  function attachDeselectHandler() {
    const deselectBtn = document.getElementById('deselectBtn');
    if (deselectBtn) {
      deselectBtn.addEventListener('click', function () {
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
            data.scenarios.forEach(s => {
              const li = document.createElement('li');
              li.textContent = s;
              // Add copy/edit/regenerate actions
              li.innerHTML += ' <button class="btn btn-xs btn-link copyScenarioBtn" title="Copy">📋</button>';
              li.innerHTML += ' <button class="btn btn-xs btn-link editScenarioBtn" title="Edit">✏️</button>';
              testScenariosList.appendChild(li);
            });
          }
          // Update history section
          const scenarioHistoryList = document.getElementById('scenarioHistoryList');
          if (scenarioHistoryList && data.history) {
            const histLi = document.createElement('li');
            histLi.innerHTML = `<span class="text-muted">${data.history.prompt}</span><ol>${data.history.scenarios.map(s => `<li>${s}</li>`).join('')}</ol>`;
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
      if (e.target.classList.contains('copyScenarioBtn')) {
        const text = e.target.parentElement.firstChild.textContent;
        navigator.clipboard.writeText(text);
        e.target.textContent = '✅';
        setTimeout(() => { e.target.textContent = '📋'; }, 1000);
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

  attachManualPromptHandlers();

  // If results are added dynamically later, you might re-run attachSelectionHandlers()

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
        // Update selected ticket info
        const selInfo = document.getElementById('selectedInfo');
        if (selInfo) {
          const selected = data.selected;
          if (selected) {
            const infoHtml = `<div class="alert alert-info">Selected: <a href="${selected.url}" target="_blank">${selected.key}</a> — ${selected.summary || ''}</div>`;
            if (selected.description_html) {
              const descWrapper = `<div class="card mt-2"><div class="card-body"><h6 class="card-title">Description</h6><div class="adf-desc"></div></div></div>`;
              selInfo.innerHTML = infoHtml + descWrapper;
              const descDiv = selInfo.querySelector('.adf-desc');
              if (descDiv) descDiv.innerHTML = selected.description_html;
            } else if (selected.description) {
              const descWrapper = `<div class="card mt-2"><div class="card-body"><h6 class="card-title">Description</h6><div class="adf-desc" style="white-space: pre-wrap;"></div></div></div>`;
              selInfo.innerHTML = infoHtml + descWrapper;
              const descDiv = selInfo.querySelector('.adf-desc');
              if (descDiv) descDiv.textContent = selected.description;
            } else {
              selInfo.innerHTML = infoHtml;
            }
          } else {
            selInfo.innerHTML = '<div class="text-muted">No ticket selected.</div>';
          }
        }
        // Re-attach radio handlers
        attachSelectionHandlers();
        attachDeselectHandler();
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

  // Attach handler for Generate Test Scenarios button
  function attachGenerateScenariosHandler() {
    const btn = document.getElementById('generateScenariosBtn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      const selInfo = document.getElementById('selectedInfo');
      if (!selInfo) return;
      // Get description from the selected ticket
      let description = '';
      const descDiv = selInfo.querySelector('.adf-desc');
      if (descDiv) {
        description = descDiv.textContent || descDiv.innerText || '';
      }
      if (!description.trim()) {
        selInfo.insertAdjacentHTML('beforeend', '<div class="alert alert-warning mt-2">No description found for this ticket.</div>');
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Generating...';
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
        btn.textContent = 'Generate Test Scenarios';
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.scenarios) {
          selInfo.insertAdjacentHTML('beforeend', `<div class="alert alert-danger mt-2">${data.error || 'Failed to generate test scenarios.'}</div>`);
          return;
        }
        // Render scenarios below description
        let scenariosHtml = `<div class="card mt-2"><div class="card-body"><h6 class="card-title">Generated Test Scenarios</h6><ol id="testScenariosList">`;
        for (const scenario of data.scenarios) {
          scenariosHtml += `<li>${scenario}</li>`;
        }
        scenariosHtml += `</ol></div></div>`;
        // Remove any previous scenarios section
        const oldList = selInfo.querySelector('#testScenariosList');
        if (oldList && oldList.parentElement && oldList.parentElement.parentElement) {
          oldList.parentElement.parentElement.remove();
        }
        selInfo.insertAdjacentHTML('beforeend', scenariosHtml);
      })
      .catch(err => {
        btn.disabled = false;
        btn.textContent = 'Generate Test Scenarios';
        selInfo.insertAdjacentHTML('beforeend', `<div class="alert alert-danger mt-2">Network error: ${err.message}</div>`);
      });
    });
  }

  // After DOMContentLoaded, attach selection handlers
  attachSelectionHandlers();
  // If selectedInfo is present, attach generate scenarios handler
  attachGenerateScenariosHandler();

  autoDismissAlerts();
});
