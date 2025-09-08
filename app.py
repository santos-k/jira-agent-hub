from flask import Flask, render_template, request, redirect, url_for, session, jsonify, flash, g
from flask_session import Session

import requests
import os
from requests.auth import HTTPBasicAuth
import re
import time
import json
import logger as logutil
from ai.google_ai import GoogleAIChat
from ai.mcp_ai import MCPAIChat
import logging as _logging
logger = logutil.get_logger(__name__)
# Import MCP modules
from mcp.api import mcp_bp
from mcp.config import mcp_config
from mcp.auth import mcp_auth

# Configuration
app = Flask(__name__, template_folder="templates", static_folder="static")
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "change-me-in-production")
app.config["SESSION_TYPE"] = "filesystem"
app.config["SESSION_PERMANENT"] = False
Session(app)

# Initialize logger
logger = logutil.get_logger(__name__)
ai_logger = _logging.getLogger('ai_chat')

# Register MCP blueprint
app.register_blueprint(mcp_bp)
logger.info("MCP integration enabled")

# Request/response logging: record start time and log after response
@app.before_request
def _start_timer():
    g._start_time = time.time()

@app.after_request
def _log_request_response(response):
    try:
        duration = (time.time() - getattr(g, "_start_time", time.time()))
        payload_size = request.content_length or 0
        # response.status may not exist on stub; use getattr
        status = getattr(response, 'status', getattr(response, 'status_code', ''))
        logger.info("%s %s %s %sB %.3fs", request.method if hasattr(request, 'method') else 'N/A', request.path if hasattr(request, 'path') else 'N/A', status, payload_size, duration)
    except Exception:
        logger.exception("Error logging request/response")
    return response

# Helpers
@logutil.log_exceptions
def jira_auth_headers(email, api_token):
    auth = HTTPBasicAuth(email, api_token)
    return auth

@logutil.log_exceptions
def validate_jira_connection(jira_url, email, api_token):
    try:
        api = jira_url.rstrip("/") + "/rest/api/3/myself"
        resp = requests.get(api, auth=jira_auth_headers(email, api_token), timeout=10)
        if resp.status_code == 200:
            logger.info("Successfully validated Jira connection for %s", email)
            return resp.json()
        else:
            logger.warning("Jira validation failed with status %s: %s", resp.status_code, resp.text)
            return None
    except Exception:
        logger.exception("Exception validating Jira connection to %s", jira_url)
        return None

@logutil.log_exceptions
def search_issues(jira_url, email, api_token, jql, max_results=50):
    try:
        api = jira_url.rstrip("/") + "/rest/api/3/search"
        params = {"jql": jql, "maxResults": max_results}
        logger.debug("Searching Jira: %s params=%s", api, params)
        resp = requests.get(api, params=params, auth=jira_auth_headers(email, api_token), timeout=20)
        if resp.status_code == 200:
            logger.info("Search successful for JQL: %s", jql)
            return resp.json()
        else:
            logger.error("Jira API returned %s: %s", resp.status_code, resp.text)
            return {"error": f"Jira API returned {resp.status_code}: {resp.text}"}
    except Exception as e:
        logger.exception("Exception during search_issues for JQL: %s", jql)
        return {"error": str(e)}

@logutil.log_exceptions
def adf_to_text(node):
    """Recursively extract plain text from Atlassian Document Format (ADF)."""
    if node is None:
        return ""
    if isinstance(node, str):
        return node
    text_parts = []
    if isinstance(node, dict):
        # Text node
        if 'text' in node:
            text_parts.append(node.get('text', ''))
        # If node has content, recurse
        if 'content' in node and isinstance(node['content'], list):
            for child in node['content']:
                text_parts.append(adf_to_text(child))
    elif isinstance(node, list):
        for n in node:
            text_parts.append(adf_to_text(n))
    result = ''.join([p for p in text_parts if p])
    logger.debug("Extracted text from ADF node: %s", (result[:200] + '...') if len(result) > 200 else result)
    return result

# Routes
@app.route("/", methods=["GET"])
def index():
    search_results = session.get("search_results", [])
    return render_template("search.html", search_results=search_results)

@app.route("/connect", methods=["POST"])
def connect():
    data = request.get_json() or {}
    jira_url = data.get("jira_url", "").strip()
    email = data.get("email", "").strip()
    api_token = data.get("api_token", "").strip()

    logger.info("Connect attempt for %s to %s", email, jira_url)

    if not jira_url or not email or not api_token:
        logger.warning("Connect failed: missing fields")
        return jsonify({"success": False, "message": "All fields are required."}), 400

    user = validate_jira_connection(jira_url, email, api_token)
    if not user:
        logger.error("Failed to connect to Jira for %s", email)
        return jsonify({"success": False, "message": "Failed to connect to Jira. Check credentials and URL."}), 400

    # Save connection in session (server-side via flask-session)
    session["jira_connected"] = True
    session["jira_url"] = jira_url.rstrip("/")
    session["jira_email"] = email
    session["jira_api_token"] = api_token
    # Store user info
    display_name = user.get("displayName") or user.get("name") or ""
    email_addr = user.get("emailAddress") or email
    session["user_full_name"] = display_name
    session["user_email"] = email_addr
    initials = "".join([p[0].upper() for p in (display_name.split() if display_name else [email_addr.split('@')[0]])][:2])
    session["user_initials"] = initials

    logger.info("User %s connected to Jira", email_addr)
    return jsonify({"success": True, "user": {"displayName": display_name, "email": email_addr}})

@app.route("/logout", methods=["POST"])
def logout():
    # Clear connection-related session data
    keys = ["jira_connected", "jira_url", "jira_email", "jira_api_token", "user_full_name", "user_email", "user_initials", "search_results", "last_query", "selected_ticket"]
    
    # Clear MCP session data
    mcp_auth.clear_auth()
    for k in keys:
        session.pop(k, None)
    logger.info("User logged out and session cleared")
    return redirect(url_for("index"))

@app.route("/search", methods=["POST"])
def search():
    if not session.get("jira_connected"):
        flash("Please connect to Jira first.", "warning")
        return redirect(url_for("index"))

    query = request.form.get("query", "").strip()
    logger.debug("Search requested: %s", query)
    if not query:
        # If query is empty, fetch all tickets assigned to current user
        jql = "assignee = currentUser()"
    else:
        # Detect whether input is a list of keys or a JQL
        # Simple heuristic: commas or single tokens that look like KEY-123 -> treat as keys
        q = query
        # Normalize ticket keys to uppercase (Jira is case-insensitive for keys but keep display uppercase)
        # If it looks like a comma-separated list of keys
        if "," in q:
            keys = [k.strip().upper() for k in q.split(",") if k.strip()]
            if keys and all(" " not in k for k in keys):
                jql = f"issuekey in ({', '.join(keys)})"
            else:
                jql = q
        else:
            # single token - detect single issue key pattern like ABC-123 (case-insensitive)
            single_key_match = re.match(r"^([A-Za-z0-9]+-\d+)$", q.strip())
            if single_key_match:
                key = single_key_match.group(1).upper()
                jql = f"issuekey = {key}"
            else:
                # treat as JQL directly
                jql = q

    jira_url = session.get("jira_url")
    email = session.get("jira_email")
    api_token = session.get("jira_api_token")

    resp = search_issues(jira_url, email, api_token, jql)
    if isinstance(resp, dict) and resp.get("error"):
        logger.error("Search error: %s", resp.get("error"))
        flash(resp.get("error"), "danger")
        return redirect(url_for("index"))

    issues = resp.get("issues", [])
    results = []
    for issue in issues:
        fields = issue.get("fields", {})
        assignee = fields.get("assignee")
        assignee_name = assignee.get("displayName") if assignee else "Unassigned"
        status = fields.get("status")
        status_name = status.get("name") if status else ""
        key = issue.get("key")
        summary = fields.get("summary") or ""
        ticket_url = f"{jira_url}/browse/{key}"
        results.append({
            "key": key,
            "summary": summary,
            "assignee": assignee_name,
            "status": status_name,
            "url": ticket_url,
        })

    # Persist results in session
    session["search_results"] = results
    session["last_query"] = query
    logger.info("Search completed: %d results", len(results))
    flash(f"Found {len(results)} issue(s).", "success")
    return redirect(url_for("index"))

@app.route('/select', methods=['POST'])
def select_ticket():
    if not session.get('jira_connected'):
        logger.warning("Select ticket attempted without Jira connection")
        return jsonify({'success': False, 'message': 'Not connected to Jira.'}), 403
    data = request.get_json() or {}
    key = data.get('key')
    url = data.get('url')
    summary = data.get('summary')
    if not key:
        logger.warning("Select ticket called without key")
        return jsonify({'success': False, 'message': 'No ticket key provided.'}), 400
    # Attempt to fetch description for the selected issue from Jira
    description_text = ''
    description_html = ''
    try:
        jira_url = session.get('jira_url')
        email = session.get('jira_email')
        api_token = session.get('jira_api_token')
        if jira_url and email and api_token:
            issue_api = f"{jira_url}/rest/api/3/issue/{key}?expand=renderedFields"
            logger.debug("Fetching issue %s from %s", key, issue_api)
            r = requests.get(issue_api, auth=jira_auth_headers(email, api_token), timeout=10)
            if r.status_code == 200:
                issue_data = r.json()
                # Get plain text (ADF) for fallback
                desc = issue_data.get('fields', {}).get('description')
                if isinstance(desc, str):
                    description_text = desc
                else:
                    description_text = adf_to_text(desc)
                # Get HTML rendered description
                rendered_desc = issue_data.get('renderedFields', {}).get('description')
                if rendered_desc:
                    description_html = rendered_desc
            else:
                logger.warning("Failed to fetch issue %s: %s", key, r.status_code)
                description_text = ''
                description_html = ''
    except Exception:
        logger.exception("Exception while fetching issue %s", key)
        description_text = ''
        description_html = ''

    # store ticket info including description in session
    session['selected_ticket'] = {
        'key': key,
        'url': url,
        'summary': summary,
        'description': description_text,
        'description_html': description_html
    }
    logger.info("Ticket selected: %s", key)
    return jsonify({'success': True, 'selected': session['selected_ticket']})

@app.route("/clear", methods=["POST"])
def clear_results():
    session.pop("search_results", None)
    session.pop("last_query", None)
    session.pop("selected_ticket", None)
    logger.info("Cleared search results and selection")
    flash("Search results cleared.", "info")
    return redirect(url_for("index"))

@app.route('/refresh', methods=['POST'])
def refresh():
    if not session.get('jira_connected'):
        logger.warning("Refresh attempted without Jira connection")
        return jsonify({'success': False, 'message': 'Not connected to Jira.'}), 403
    last_query = session.get('last_query', '').strip()
    if not last_query:
        logger.warning("Refresh called with no previous query")
        return jsonify({'success': False, 'message': 'No previous search found.'}), 400
    # Re-run search logic
    q = last_query
    if "," in q:
        keys = [k.strip().upper() for k in q.split(",") if k.strip()]
        if keys and all(" " not in k for k in keys):
            jql = f"issuekey in ({', '.join(keys)})"
        else:
            jql = q
    else:
        single_key_match = re.match(r"^([A-Za-z0-9]+-\d+)$", q.strip())
        if single_key_match:
            key = single_key_match.group(1).upper()
            jql = f"issuekey = {key}"
        else:
            jql = q
    jira_url = session.get("jira_url")
    email = session.get("jira_email")
    api_token = session.get("jira_api_token")
    resp = search_issues(jira_url, email, api_token, jql)
    if isinstance(resp, dict) and resp.get("error"):
        logger.error("Refresh search error: %s", resp.get("error"))
        return jsonify({'success': False, 'message': resp.get('error')}), 500
    issues = resp.get("issues", [])
    results = []
    for issue in issues:
        fields = issue.get("fields", {})
        assignee = fields.get("assignee")
        assignee_name = assignee.get("displayName") if assignee else "Unassigned"
        status = fields.get("status")
        status_name = status.get("name") if status else ""
        key = issue.get("key")
        summary = fields.get("summary") or ""
        ticket_url = f"{jira_url}/browse/{key}"
        results.append({
            "key": key,
            "summary": summary,
            "assignee": assignee_name,
            "status": status_name,
            "url": ticket_url,
        })
    session["search_results"] = results
    # If a ticket is selected, refresh its description
    selected = session.get('selected_ticket')
    selected_info = None
    if selected and selected.get('key'):
        key = selected['key']
        url = selected['url']
        summary = selected.get('summary', '')
        description_text = ''
        description_html = ''
        try:
            issue_api = f"{jira_url}/rest/api/3/issue/{key}?expand=renderedFields"
            logger.debug("Refreshing issue %s from %s", key, issue_api)
            r = requests.get(issue_api, auth=jira_auth_headers(email, api_token), timeout=10)
            if r.status_code == 200:
                issue_data = r.json()
                desc = issue_data.get('fields', {}).get('description')
                if isinstance(desc, str):
                    description_text = desc
                else:
                    description_text = adf_to_text(desc)
                rendered_desc = issue_data.get('renderedFields', {}).get('description')
                if rendered_desc:
                    description_html = rendered_desc
            else:
                logger.warning("Failed to refresh issue %s: %s", key, r.status_code)
                description_text = ''
                description_html = ''
        except Exception:
            logger.exception("Exception while refreshing issue %s", key)
            description_text = ''
            description_html = ''
        selected_info = {
            'key': key,
            'url': url,
            'summary': summary,
            'description': description_text,
            'description_html': description_html
        }
        session['selected_ticket'] = selected_info
    logger.info("Refresh completed: %d results", len(results))
    return jsonify({'success': True, 'results': results, 'selected': selected_info})

@app.route('/clear_selected', methods=['POST'])
def clear_selected():
    session.pop('selected_ticket', None)
    logger.info("Cleared selected ticket")
    return jsonify({'success': True})

# New endpoint: UI event logging (for client-side events like theme toggles, AI chat interactions)
@app.route('/log_event', methods=['POST'])
def log_event():
    try:
        data = request.get_json() or {}
        category = data.get('category', 'ui')
        event = data.get('event', 'unknown')
        label = data.get('label')
        extra = data.get('extra')
        payload_size = len(json.dumps(data))
        logger.info("UI_EVENT %s %s %s %sB %s", category, event, label or '', payload_size, json.dumps(extra) if extra else '')
        return jsonify({'success': True}), 200
    except Exception:
        logger.exception("Failed to log UI event")
        return jsonify({'success': False}), 500

# AI API: check if API key is present in session
@app.route('/api/ai/has_key', methods=['GET'])
def api_ai_has_key():
    has = bool(session.get('genai_api_key'))
    ai_logger.debug('has_key check -> %s', has)
    return jsonify({'has_key': has}), 200

# AI API: set API key in session
@app.route('/api/ai/set_key', methods=['POST'])
def api_ai_set_key():
    try:
        data = request.get_json() or {}
        key = data.get('api_key')
        if not key:
            ai_logger.warning('Attempt to save empty API key')
            return jsonify({'error': 'API key required'}), 400
        # don't log the key itself
        session['genai_api_key'] = key
        ai_logger.info('Google GenAI API key saved in session')
        return jsonify({'success': True}), 200
    except Exception:
        ai_logger.exception('Failed to save API key')
        return jsonify({'error': 'internal error'}), 500

# AI API: send chat message
@app.route('/api/ai/chat', methods=['POST'])
def api_ai_chat():
    try:
        data = request.get_json() or {}
        message = data.get('message', '').strip()
        if not message:
            ai_logger.warning('Empty message received for /api/ai/chat')
            return jsonify({'error': 'message is required'}), 400

        api_key = session.get('genai_api_key')
        if not api_key:
            ai_logger.warning('Chat request without API key')
            return jsonify({'error': 'API key missing'}), 403

        ai_logger.info('Forwarding message to GoogleAI')
        chat = GoogleAIChat(api_key)
        # optionally start chat (GoogleAIChat will auto-start on send_message)
        resp = chat.send_message(message)

        if resp in ("Invalid API Key or unauthorized", "AI service unavailable"):
            ai_logger.error('AI backend returned error: %s', resp)
            return jsonify({'error': resp}), 503

        # persist response in session for viewing on the AI page
        try:
            session.setdefault('ai_history', [])
            session['ai_history'].append({'prompt': message, 'response': resp, 'ts': time.time()})
            session['last_ai_response'] = resp
        except Exception:
            ai_logger.exception('Failed to persist AI response to session')

        ai_logger.info('AI response ready (len=%d)', len(resp))
        return jsonify({'response': resp}), 200
    except Exception:
        ai_logger.exception('Unhandled exception in /api/ai/chat')
        return jsonify({'error': 'internal server error'}), 500

# AI API: clear API key from session (logout). Accept GET or POST to be resilient to client variations.
@app.route('/api/ai/clear_key', methods=['POST', 'GET'])
def api_ai_clear_key():
    try:
        # Remove key if exists
        existed = 'genai_api_key' in session
        session.pop('genai_api_key', None)
        ai_logger.info('Google GenAI API key cleared from session via clear_key (existed=%s)', existed)
        return jsonify({'success': True}), 200
    except Exception:
        ai_logger.exception('Failed to clear API key')
        return jsonify({'error': 'internal error'}), 500

# AI API: clear AI session data (chat history, last response, etc.)
@app.route('/api/ai/clear_session', methods=['POST'])
def api_ai_clear_session():
    try:
        # Clear AI-related session data
        ai_keys = ['ai_history', 'last_ai_response']
        cleared_count = 0
        for key in ai_keys:
            if key in session:
                session.pop(key, None)
                cleared_count += 1
        
        ai_logger.info('AI session data cleared: %d items removed', cleared_count)
        return jsonify({'success': True, 'cleared_items': cleared_count}), 200
    except Exception:
        ai_logger.exception('Failed to clear AI session')
        return jsonify({'error': 'internal error'}), 500

@app.route('/api/generate_test_scenarios', methods=['POST'])
def generate_test_scenarios():
    try:
        data = request.get_json() or {}
        description = data.get('description', '').strip()
        custom_prompt = data.get('prompt', '')
        
        # Use the common generate_scenarios_with_ai function
        scenarios, error = generate_scenarios_with_ai(description, custom_prompt)
        
        if error:
            return jsonify({'error': error}), 400 if 'required' in error.lower() else 503
            
        if not scenarios:
            return jsonify({'error': 'Failed to generate scenarios.'}), 500
            
        # Store scenarios in session
        selected = session.get('selected_ticket', {})
        selected['test_scenarios'] = scenarios
        session['selected_ticket'] = selected
        
        return jsonify({'scenarios': scenarios})
    except Exception as e:
        logger.exception(f"Error generating test scenarios: {str(e)}")
        return jsonify({'error': f'Error: {str(e)}'}), 500

@app.route('/api/manual_prompt_scenarios', methods=['POST'])
def manual_prompt_scenarios():
    try:
        data = request.get_json() or {}
        description = data.get('description', '').strip()
        prompt = data.get('prompt', '').strip()
        selected = session.get('selected_ticket', {})
        # If description is not provided, use the one from the selected ticket
        if not description:
            description = selected.get('description', '').strip()
        logger.info(f"Manual prompt request: description='{description[:100]}', prompt='{prompt[:100]}'")
        api_key = session.get('genai_api_key')
        if not selected or not selected.get('key'):
            logger.error('Manual prompt error: No selected ticket in session')
            return jsonify({'error': 'No selected ticket. Please select a ticket first.'}), 400
        if not api_key:
            # Check if MCP is enabled and can be used as fallback
            if not session.get("mcp_enabled"):
                logger.error('Manual prompt error: No AI API key in session and MCP not available')
                return jsonify({'error': 'AI API key missing.'}), 403
        if not description:
            logger.error('Manual prompt error: No description provided')
            return jsonify({'error': 'Description is required.'}), 400
        if not prompt:
            logger.error('Manual prompt error: No prompt provided')
            return jsonify({'error': 'Prompt is required.'}), 400
        scenarios, error = generate_scenarios_with_ai(description, prompt)
        if error:
            logger.error(f"Manual prompt failed: {error}")
            # Map specific errors to appropriate HTTP status codes
            if 'API key' in error.lower() or 'unauthorized' in error.lower():
                return jsonify({'error': error}), 403
            elif 'unavailable' in error.lower() or 'service' in error.lower():
                return jsonify({'error': error}), 503
            else:
                return jsonify({'error': error}), 400
        # Update scenario history in session
        history = selected.get('scenario_history', [])
        # Save previous scenarios if present
        if selected.get('test_scenarios'):
            history.append({
                'prompt': selected.get('last_prompt', 'Default'),
                'scenarios': selected['test_scenarios']
            })
        selected['test_scenarios'] = scenarios
        selected['last_prompt'] = prompt
        selected['scenario_history'] = history
        session['selected_ticket'] = selected
        # Return new scenarios and last history item
        last_history = history[-1] if history else None
        logger.info(f"Manual prompt success: {len(scenarios)} scenarios generated.")
        return jsonify({'scenarios': scenarios, 'history': last_history}), 200
    except Exception as e:
        logger.error(f"Manual prompt error: {e}")
        return jsonify({'error': 'internal error'}), 500

@logutil.log_exceptions
def text_to_adf(text):
    """Convert plain text to Atlassian Document Format (ADF).
    
    Args:
        text: Plain text to convert
        
    Returns:
        Dict: ADF-formatted document structure
    """
    if not text:
        return {
            "type": "doc",
            "version": 1,
            "content": []
        }
    
    # Split text into paragraphs
    paragraphs = text.split('\n\n')
    content = []
    
    for paragraph in paragraphs:
        paragraph = paragraph.strip()
        if not paragraph:
            continue
            
        # Check if this is a list (scenarios)
        lines = paragraph.split('\n')
        if len(lines) > 1 and any(line.strip().startswith(('1.', '2.', '-', '•', '*')) for line in lines):
            # Create a bullet list
            list_items = []
            for line in lines:
                line = line.strip()
                if not line:
                    continue
                # Remove list markers
                clean_line = re.sub(r'^(?:\d+\.|-|•|\*)\s*', '', line)
                if clean_line:
                    list_items.append({
                        "type": "listItem",
                        "content": [{
                            "type": "paragraph",
                            "content": [{
                                "type": "text",
                                "text": clean_line
                            }]
                        }]
                    })
            
            if list_items:
                content.append({
                    "type": "bulletList",
                    "content": list_items
                })
        else:
            # Regular paragraph
            content.append({
                "type": "paragraph",
                "content": [{
                    "type": "text",
                    "text": paragraph
                }]
            })
    
    return {
        "type": "doc",
        "version": 1,
        "content": content
    }

@logutil.log_exceptions
def update_jira_issue_description(issue_key, new_description):
    """Update a Jira issue's description using the Jira REST API.
    
    Args:
        issue_key: The Jira issue key (e.g., PROJECT-123)
        new_description: The new description in ADF format
        
    Returns:
        Tuple: (success: bool, error_message: str or None)
    """
    try:
        jira_url = session.get('jira_url')
        email = session.get('jira_email')
        api_token = session.get('jira_api_token')
        
        if not all([jira_url, email, api_token]):
            return False, 'Jira connection not available.'
        
        # Jira REST API endpoint for updating issue
        api_endpoint = f"{jira_url.rstrip('/')}/rest/api/3/issue/{issue_key}"
        
        # Prepare the update payload
        payload = {
            "fields": {
                "description": new_description
            }
        }
        
        # Make the API request
        response = requests.put(
            api_endpoint,
            json=payload,
            auth=jira_auth_headers(email, api_token),
            headers={'Content-Type': 'application/json'},
            timeout=30
        )
        
        if response.status_code == 204:  # Success - No Content
            logger.info(f"Successfully updated issue {issue_key} description")
            return True, None
        else:
            error_msg = f"Failed to update issue {issue_key}: HTTP {response.status_code}"
            if response.text:
                try:
                    error_data = response.json()
                    if 'errors' in error_data:
                        error_details = ', '.join([f"{k}: {v}" for k, v in error_data['errors'].items()])
                        error_msg += f" - {error_details}"
                    elif 'errorMessages' in error_data:
                        error_msg += f" - {', '.join(error_data['errorMessages'])}"
                except:
                    error_msg += f" - {response.text[:200]}"
            
            logger.error(error_msg)
            return False, error_msg
            
    except requests.exceptions.Timeout:
        error_msg = 'Request timed out while updating Jira issue.'
        logger.error(error_msg)
        return False, error_msg
    except requests.exceptions.RequestException as e:
        error_msg = f'Network error while updating Jira issue: {str(e)}'
        logger.error(error_msg)
        return False, error_msg
    except Exception as e:
        error_msg = f'Unexpected error while updating Jira issue: {str(e)}'
        logger.exception(error_msg)
        return False, error_msg

@app.route('/api/update_ticket_with_scenarios', methods=['POST'])
def update_ticket_with_scenarios():
    """Update the selected Jira ticket by appending generated test scenarios to its description."""
    try:
        # Check if user is connected to Jira
        if not session.get('jira_connected'):
            logger.warning("Update ticket attempted without Jira connection")
            return jsonify({'success': False, 'error': 'Not connected to Jira.'}), 403
        
        # Get selected ticket and test scenarios from session
        selected = session.get('selected_ticket', {})
        if not selected or not selected.get('key'):
            logger.warning("Update ticket attempted without selected ticket")
            return jsonify({'success': False, 'error': 'No ticket selected.'}), 400
        
        test_scenarios = selected.get('test_scenarios', [])
        if not test_scenarios:
            logger.warning("Update ticket attempted without test scenarios")
            return jsonify({'success': False, 'error': 'No test scenarios available to add.'}), 400
        
        issue_key = selected['key']
        
        # Fetch current issue description from Jira
        jira_url = session.get('jira_url')
        email = session.get('jira_email')
        api_token = session.get('jira_api_token')
        
        try:
            issue_api = f"{jira_url}/rest/api/3/issue/{issue_key}"
            response = requests.get(issue_api, auth=jira_auth_headers(email, api_token), timeout=10)
            
            if response.status_code != 200:
                logger.error(f"Failed to fetch issue {issue_key}: HTTP {response.status_code}")
                return jsonify({'success': False, 'error': 'Failed to fetch current ticket information.'}), 500
            
            issue_data = response.json()
            current_description = issue_data.get('fields', {}).get('description')
            
        except Exception as e:
            logger.error(f"Error fetching issue {issue_key}: {str(e)}")
            return jsonify({'success': False, 'error': 'Failed to fetch current ticket information.'}), 500
        
        # Prepare the test scenarios text to append
        scenarios_text = "\n\n--- Generated Test Scenarios ---\n\n"
        for i, scenario in enumerate(test_scenarios, 1):
            scenarios_text += f"{i}. {scenario}\n"
        
        # Create new description
        if current_description:
            if isinstance(current_description, str):
                # Plain text description
                new_description_text = current_description + scenarios_text
            else:
                # ADF description - convert to text first, then append
                current_text = adf_to_text(current_description)
                new_description_text = current_text + scenarios_text
        else:
            # No existing description
            new_description_text = scenarios_text.strip()
        
        # Convert to ADF format
        new_description_adf = text_to_adf(new_description_text)
        
        # Try MCP first if available, then fallback to direct API
        success = False
        error_message = None
        
        # Try MCP update if available
        if session.get("mcp_enabled"):
            try:
                from mcp.client import MCPClient
                client = MCPClient()
                result = client.update_issue(issue_key, description=new_description_adf)
                
                if result and not result.get('error'):
                    success = True
                    logger.info(f"Successfully updated issue {issue_key} via MCP")
                else:
                    error_message = result.get('error', 'MCP update failed')
                    logger.warning(f"MCP update failed for {issue_key}: {error_message}")
            except Exception as e:
                error_message = f"MCP update error: {str(e)}"
                logger.error(f"MCP update failed for {issue_key}: {str(e)}")
        
        # Fallback to direct Jira API if MCP failed or unavailable
        if not success:
            success, error_message = update_jira_issue_description(issue_key, new_description_adf)
        
        if success:
            # Update the session with new description
            selected['description'] = new_description_text
            selected['description_html'] = None  # Clear cached HTML
            session['selected_ticket'] = selected
            
            logger.info(f"Successfully updated issue {issue_key} with test scenarios")
            return jsonify({
                'success': True, 
                'message': f'Successfully updated {issue_key} with test scenarios.'
            }), 200
        else:
            return jsonify({
                'success': False, 
                'error': error_message or 'Failed to update ticket.'
            }), 500
            
    except Exception as e:
        logger.exception(f"Unexpected error in update_ticket_with_scenarios: {str(e)}")
        return jsonify({
            'success': False, 
            'error': 'Internal server error occurred while updating ticket.'
        }), 500

def generate_scenarios_with_ai(description, prompt=None):
    if not description:
        logger.error('No description provided for scenario generation')
        return None, 'Description is required.'
        
    # Prepare the prompt
    if prompt:
        full_prompt = f"{prompt}\n\nStory:\n{description}\n\nTest Scenarios:"
    else:
        full_prompt = (
            "Generate possible concise (keep as minimum as possible), end-to-end test scenarios for the story below. "
            "Each scenario should be one sentence, covering the full flow: user action → system behavior → expected outcome. "
            "Focus on critical paths; combine multiple checks when logical. "
            "Avoid minor edge cases unless essential. "
            "Phrase each scenario like: "
            "Verify that [action] results in [expected outcome], including [key condition or variation]."
            f"\n\nStory:\n{description}\n\nTest Scenarios:"
        )
    
    # Check if MCP is enabled and connected
    if session.get("mcp_enabled"):
        # Use MCP AI for test scenario generation
        chat = MCPAIChat()
        try:
            resp = chat.send_message(full_prompt)
            logger.info(f"MCP AI prompt executed: {prompt if prompt else 'default'}")
        except Exception as e:
            logger.error(f"MCP AI error: {e}")
            return None, 'MCP AI error: ' + str(e)
    else:
        # Fall back to Google AI if MCP is not available
        api_key = session.get('genai_api_key')
        if not api_key:
            logger.error('AI API key missing for scenario generation')
            return None, 'AI API key missing.'
        chat = GoogleAIChat(api_key)
        try:
            resp = chat.send_message(full_prompt)
            logger.info(f"Google AI prompt executed: {prompt if prompt else 'default'}")
        except Exception as e:
            logger.error(f"Google AI error: {e}")
            return None, 'AI error: ' + str(e)
    scenarios = []
    if resp:
        for line in resp.splitlines():
            line = line.strip()
            if not line:
                continue
            m = re.match(r"^(?:\d+\.|-|•|\*)\s*(.+)$", line)
            if m:
                scenarios.append(m.group(1).strip())
            else:
                scenarios.append(line)
    return scenarios, None

if __name__ == "__main__":
    app.run(debug=True)
