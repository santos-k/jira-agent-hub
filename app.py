from flask import Flask, render_template, request, redirect, url_for, session, jsonify, flash, g
from flask_session import Session

import requests
import os
import re
import time
import json
import logger as logutil
from ai.google_ai import GoogleAIChat
import logging as _logging
logger = logutil.get_logger(__name__)
# Import new JIRA client
from jira_client import JiraClient, get_jira_client

# Configuration
app = Flask(__name__, template_folder="templates", static_folder="static")
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "change-me-in-production")
app.config["SESSION_TYPE"] = "filesystem"
app.config["SESSION_PERMANENT"] = False
Session(app)

# Initialize logger
logger = logutil.get_logger(__name__)
ai_logger = _logging.getLogger('ai_chat')

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
def validate_jira_connection(jira_url, email, api_token):
    """
    Validate Jira connection using the new JIRA client.
    
    Args:
        jira_url: Jira server URL
        email: User email
        api_token: API token
        
    Returns:
        User info dict if successful, None if failed
    """
    try:
        client = JiraClient(jira_url, email, api_token)
        user_data = client.validate_connection()
        
        if user_data:
            logger.info("Successfully validated Jira connection for %s", email)
            return user_data
        else:
            logger.warning("Jira validation failed for %s", email)
            return None
    except Exception as e:
        logger.exception("Exception validating Jira connection to %s: %s", jira_url, str(e))
        return None

@logutil.log_exceptions
def search_issues(jira_url, email, api_token, jql, max_results=50):
    """
    Search issues using the new JIRA client.
    
    Args:
        jira_url: Jira server URL
        email: User email
        api_token: API token
        jql: JQL query string
        max_results: Maximum results to return
        
    Returns:
        Search results dict
    """
    try:
        client = JiraClient(jira_url, email, api_token)
        results = client.search_issues(jql, max_results)
        
        if "error" in results:
            logger.error("Search error: %s", results["error"])
        else:
            logger.info("Search successful for JQL: %s", jql)
            
        return results
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
                child_text = adf_to_text(child)
                if child_text:
                    text_parts.append(child_text)
        # Handle different node types
        node_type = node.get('type', '')
        if node_type == 'paragraph':
            text_parts.append('\n')
        elif node_type == 'hardBreak':
            text_parts.append('\n')
        elif node_type in ['bulletList', 'orderedList']:
            text_parts.append('\n')
        elif node_type == 'listItem':
            text_parts.insert(0, '• ')
            text_parts.append('\n')
    elif isinstance(node, list):
        for n in node:
            child_text = adf_to_text(n)
            if child_text:
                text_parts.append(child_text)
    result = ''.join([p for p in text_parts if p])
    logger.debug("Extracted text from ADF node: %s", (result[:200] + '...') if len(result) > 200 else result)
    return result

@logutil.log_exceptions
def process_test_scenarios_content(content):
    """
    Process test scenarios content to ensure it's properly formatted as HTML.
    Handles plain text, markdown, and existing HTML content.
    """
    if not content:
        return ''
    
    if isinstance(content, str):
        # If it's a string, check if it contains HTML tags
        if '<' in content and '>' in content:
            return content
        else:
            # Convert plain text to HTML with proper line breaks
            html_content = content.replace('\n', '<br>\n')
            # If it looks like markdown, convert basic markdown elements
            import re
            # Convert **bold** to <strong>bold</strong>
            html_content = re.sub(r'\*\*(.*?)\*\*', r'<strong>\1</strong>', html_content)
            # Convert *italic* to <em>italic</em>  
            html_content = re.sub(r'\*(.*?)\*', r'<em>\1</em>', html_content)
            # Convert markdown links [text](url) to <a href="url">text</a>
            html_content = re.sub(r'\[([^\]]+)\]\(([^\)]+)\)', r'<a href="\2">\1</a>', html_content)
            
            # Convert markdown lists
            lines = html_content.split('\n')
            processed_lines = []
            in_list = False
            list_type = None
            
            for line in lines:
                if re.match(r'^\s*[-*+]\s+', line):
                    if not in_list:
                        processed_lines.append('<ul>')
                        in_list = True
                        list_type = 'ul'
                    elif list_type != 'ul':
                        processed_lines.append('</ol>')
                        processed_lines.append('<ul>')
                        list_type = 'ul'
                    processed_lines.append(f'<li>{re.sub(r"^\s*[-*+]\s+", "", line)}</li>')
                elif re.match(r'^\s*\d+\.\s+', line):
                    if not in_list:
                        processed_lines.append('<ol>')
                        in_list = True
                        list_type = 'ol'
                    elif list_type != 'ol':
                        processed_lines.append('</ul>')
                        processed_lines.append('<ol>')
                        list_type = 'ol'
                    processed_lines.append(f'<li>{re.sub(r"^\s*\d+\.\s+", "", line)}</li>')
                else:
                    if in_list:
                        if list_type == 'ul':
                            processed_lines.append('</ul>')
                        else:
                            processed_lines.append('</ol>')
                        in_list = False
                        list_type = None
                    processed_lines.append(line)
            
            # Close any open list at the end
            if in_list:
                if list_type == 'ul':
                    processed_lines.append('</ul>')
                else:
                    processed_lines.append('</ol>')
            
            return '\n'.join(processed_lines)
    else:
        # Handle ADF or other structured content
        return adf_to_text(content)

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
    session["jira_authenticated"] = True  # Add this for compatibility
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
    keys = ["jira_connected", "jira_authenticated", "jira_url", "jira_email", "jira_api_token", "user_full_name", "user_email", "user_initials", "search_results", "last_query", "selected_ticket"]
    
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
        # If query is empty, fetch all tickets assigned to current user with allowed issue types
        jql = "assignee = currentUser() AND issuetype in (Story, Defect, Bug)"
        max_results = 200  # Increase limit for assigned issues to get all results
    else:
        max_results = 50  # Keep original limit for specific searches
        # Detect whether input is a list of keys or a JQL
        # Simple heuristic: commas or single tokens that look like KEY-123 -> treat as keys
        q = query
        # Normalize ticket keys to uppercase (Jira is case-insensitive for keys but keep display uppercase)
        # If it looks like a comma-separated list of keys
        if "," in q:
            keys = [k.strip().upper() for k in q.split(",") if k.strip()]
            if keys and all(" " not in k for k in keys):
                jql = f"issuekey in ({', '.join(keys)}) AND issuetype in (Story, Defect, Bug)"
            else:
                jql = f"({q}) AND issuetype in (Story, Defect, Bug)"
        else:
            # single token - detect single issue key pattern like ABC-123 (case-insensitive)
            single_key_match = re.match(r"^([A-Za-z0-9]+-\d+)$", q.strip())
            if single_key_match:
                key = single_key_match.group(1).upper()
                jql = f"issuekey = {key} AND issuetype in (Story, Defect, Bug)"
            else:
                # treat as JQL directly but add issue type filter
                jql = f"({q}) AND issuetype in (Story, Defect, Bug)"

    jira_url = session.get("jira_url")
    email = session.get("jira_email")
    api_token = session.get("jira_api_token")

    resp = search_issues(jira_url, email, api_token, jql, max_results)
    if isinstance(resp, dict) and resp.get("error"):
        logger.error("Search error: %s", resp.get("error"))
        flash(str(resp.get("error", "Unknown error")), "danger")
        return redirect(url_for("index"))

    issues = resp.get("issues", [])
    results = []
    # Since we're filtering in JQL now, we may not need to filter again, but keep it for safety
    allowed_issue_types = {"Story", "Defect", "Bug"}
    
    for issue in issues:
        fields = issue.get("fields", {})
        
        # Get issue type and check if it's allowed
        issuetype = fields.get("issuetype", {})
        issue_type_name = issuetype.get("name", "")
        
        # Skip issues that are not Story, Defect, or Bug (backup filter)
        if issue_type_name not in allowed_issue_types:
            continue
            
        assignee = fields.get("assignee")
        assignee_name = assignee.get("displayName") if assignee else "Unassigned"
        status = fields.get("status")
        status_name = status.get("name") if status else ""
        key = issue.get("key")
        summary = fields.get("summary") or ""
        updated = fields.get("updated") or ""
        
        # Format the updated date to be more readable
        updated_display = ""
        if updated:
            try:
                from datetime import datetime
                logger.debug(f"Processing updated field for {key}: {updated}")
                
                # Handle different date formats from Jira
                if updated.endswith('Z'):
                    # Remove Z and add timezone
                    updated = updated[:-1] + '+00:00'
                elif '+' in updated and updated.count(':') >= 2:
                    # Handle format like 2024-01-15T10:30:00.000+0000
                    if updated.endswith('00') and updated[-5] != ':':
                        updated = updated[:-2] + ':' + updated[-2:]
                
                # Parse the datetime and keep as ISO format for client-side conversion
                dt = datetime.fromisoformat(updated.replace('Z', '+00:00'))
                # Send ISO timestamp to frontend for client-side timezone conversion
                updated_display = dt.isoformat()
                logger.debug(f"Sending ISO timestamp for {key}: {updated_display}")
            except Exception as e:
                logger.warning(f"Failed to parse updated date '{updated}' for {key}: {e}")
                # Fallback: try to extract just the date part
                if len(updated) >= 10:
                    updated_display = updated[:10]  # Get YYYY-MM-DD part
                else:
                    updated_display = updated
        
        ticket_url = f"{jira_url}/browse/{key}"
        results.append({
            "key": key,
            "summary": summary,
            "assignee": assignee_name,
            "status": status_name,
            "issue_type": issue_type_name,
            "updated": updated_display,
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
    test_scenarios_html = ''
    try:
        jira_url = session.get('jira_url')
        email = session.get('jira_email')
        api_token = session.get('jira_api_token')
        if jira_url and email and api_token:
            logger.debug("Fetching issue %s using JIRA client", key)
            client = JiraClient(jira_url, email, api_token)
            issue_data = client.get_issue(key, expand="description,renderedFields")
            
            if "error" not in issue_data:
                # Get plain text description
                desc = issue_data.get('fields', {}).get('description')
                if isinstance(desc, str):
                    description_text = desc
                else:
                    description_text = adf_to_text(desc)
                # Get HTML rendered description
                rendered_desc = issue_data.get('renderedFields', {}).get('description')
                if rendered_desc:
                    description_html = rendered_desc
                
                # Get test scenarios from custom field
                test_scenarios_raw = issue_data.get('fields', {}).get('customfield_11334')
                test_scenarios_html = ''
                if test_scenarios_raw:
                    logger.debug(f"Test scenarios raw data for {key}: {type(test_scenarios_raw)} - {str(test_scenarios_raw)[:200]}...")
                    # Try to get rendered version first
                    rendered_test_scenarios = issue_data.get('renderedFields', {}).get('customfield_11334')
                    if rendered_test_scenarios:
                        test_scenarios_html = rendered_test_scenarios
                        logger.debug(f"Using rendered test scenarios for {key}: {str(rendered_test_scenarios)[:200]}...")
                    else:
                        # Process the raw content (could be ADF, markdown, or plain text)
                        test_scenarios_html = process_test_scenarios_content(test_scenarios_raw)
                        logger.debug(f"Processed test scenarios for {key}: {str(test_scenarios_html)[:200]}...")
                else:
                    logger.debug(f"No test scenarios found for {key}")
            else:
                logger.warning("Failed to fetch issue %s: %s", key, issue_data.get('error'))
                description_text = ''
                description_html = ''
                test_scenarios_html = ''
    except Exception:
        logger.exception("Exception while fetching issue %s", key)
        description_text = ''
        description_html = ''
        test_scenarios_html = ''

    # store ticket info including description in session
    session['selected_ticket'] = {
        'key': key,
        'url': url,
        'summary': summary,
        'description': description_text,
        'description_html': description_html,
        'test_scenarios_field': test_scenarios_html
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
    
    # Re-run search logic with same logic as search endpoint
    if not last_query:
        # If query is empty, fetch all tickets assigned to current user with allowed issue types
        jql = "assignee = currentUser() AND issuetype in (Story, Defect, Bug)"
        max_results = 200  # Increase limit for assigned issues to get all results
    else:
        max_results = 50  # Keep original limit for specific searches
        q = last_query
        if "," in q:
            keys = [k.strip().upper() for k in q.split(",") if k.strip()]
            if keys and all(" " not in k for k in keys):
                jql = f"issuekey in ({', '.join(keys)}) AND issuetype in (Story, Defect, Bug)"
            else:
                jql = f"({q}) AND issuetype in (Story, Defect, Bug)"
        else:
            single_key_match = re.match(r"^([A-Za-z0-9]+-\d+)$", q.strip())
            if single_key_match:
                key = single_key_match.group(1).upper()
                jql = f"issuekey = {key} AND issuetype in (Story, Defect, Bug)"
            else:
                jql = f"({q}) AND issuetype in (Story, Defect, Bug)"
                
    jira_url = session.get("jira_url")
    email = session.get("jira_email")
    api_token = session.get("jira_api_token")
    resp = search_issues(jira_url, email, api_token, jql, max_results)
    if isinstance(resp, dict) and resp.get("error"):
        logger.error("Refresh search error: %s", resp.get("error"))
        return jsonify({'success': False, 'message': resp.get('error')}), 500
    issues = resp.get("issues", [])
    results = []
    # Since we're filtering in JQL now, we may not need to filter again, but keep it for safety
    allowed_issue_types = {"Story", "Defect", "Bug"}
    
    for issue in issues:
        fields = issue.get("fields", {})
        
        # Get issue type and check if it's allowed
        issuetype = fields.get("issuetype", {})
        issue_type_name = issuetype.get("name", "")
        
        # Skip issues that are not Story, Defect, or Bug (backup filter)
        if issue_type_name not in allowed_issue_types:
            continue
            
        assignee = fields.get("assignee")
        assignee_name = assignee.get("displayName") if assignee else "Unassigned"
        status = fields.get("status")
        status_name = status.get("name") if status else ""
        key = issue.get("key")
        summary = fields.get("summary") or ""
        updated = fields.get("updated") or ""
        
        # Format the updated date to be more readable
        updated_display = ""
        if updated:
            try:
                from datetime import datetime
                logger.debug(f"Processing updated field for {key}: {updated}")
                
                # Handle different date formats from Jira
                if updated.endswith('Z'):
                    # Remove Z and add timezone
                    updated = updated[:-1] + '+00:00'
                elif '+' in updated and updated.count(':') >= 2:
                    # Handle format like 2024-01-15T10:30:00.000+0000
                    if updated.endswith('00') and updated[-5] != ':':
                        updated = updated[:-2] + ':' + updated[-2:]
                
                # Parse the datetime and keep as ISO format for client-side conversion
                dt = datetime.fromisoformat(updated.replace('Z', '+00:00'))
                # Send ISO timestamp to frontend for client-side timezone conversion
                updated_display = dt.isoformat()
                logger.debug(f"Sending ISO timestamp for {key}: {updated_display}")
            except Exception as e:
                logger.warning(f"Failed to parse updated date '{updated}' for {key}: {e}")
                # Fallback: try to extract just the date part
                if len(updated) >= 10:
                    updated_display = updated[:10]  # Get YYYY-MM-DD part
                else:
                    updated_display = updated
        
        ticket_url = f"{jira_url}/browse/{key}"
        results.append({
            "key": key,
            "summary": summary,
            "assignee": assignee_name,
            "status": status_name,
            "issue_type": issue_type_name,
            "updated": updated_display,
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
        test_scenarios_html = ''
        try:
            logger.debug("Refreshing issue %s using JIRA client", key)
            client = JiraClient(jira_url, email, api_token)
            issue_data = client.get_issue(key, expand="description,renderedFields")
            
            if "error" not in issue_data:
                desc = issue_data.get('fields', {}).get('description')
                if isinstance(desc, str):
                    description_text = desc
                else:
                    description_text = adf_to_text(desc)
                rendered_desc = issue_data.get('renderedFields', {}).get('description')
                if rendered_desc:
                    description_html = rendered_desc
                
                # Get test scenarios from custom field
                test_scenarios_raw = issue_data.get('fields', {}).get('customfield_11334')
                test_scenarios_html = ''
                if test_scenarios_raw:
                    # Try to get rendered version first
                    rendered_test_scenarios = issue_data.get('renderedFields', {}).get('customfield_11334')
                    if rendered_test_scenarios:
                        test_scenarios_html = rendered_test_scenarios
                    else:
                        # Process the raw content (could be ADF, markdown, or plain text)
                        test_scenarios_html = process_test_scenarios_content(test_scenarios_raw)
            else:
                logger.warning("Failed to refresh issue %s: %s", key, issue_data.get('error'))
                # Preserve existing description if refresh fails
                description_text = selected.get('description', '')
                description_html = selected.get('description_html', '')
                test_scenarios_html = selected.get('test_scenarios_field', '')
        except Exception:
            logger.exception("Exception while refreshing issue %s", key)
            # Preserve existing description if refresh fails
            description_text = selected.get('description', '')
            description_html = selected.get('description_html', '')
            test_scenarios_html = selected.get('test_scenarios_field', '')
        selected_info = {
            'key': key,
            'url': url,
            'summary': summary,
            'description': description_text,
            'description_html': description_html,
            'test_scenarios_field': test_scenarios_html
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
        # Apply the same filtering as used in frontend display to ensure consistency
        if scenarios:
            filtered_scenarios = [scenario for scenario in scenarios if not (scenario.lower().startswith("here are") or "test scenario" in scenario.lower())]
        else:
            filtered_scenarios = scenarios
        selected = session.get('selected_ticket', {})
        selected['test_scenarios'] = filtered_scenarios
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
            logger.error('Manual prompt error: No AI API key in session')
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
        # Apply the same filtering as used in frontend display to ensure consistency
        if scenarios:
            filtered_scenarios = [scenario for scenario in scenarios if not (scenario.lower().startswith("here are") or "test scenario" in scenario.lower())]
        else:
            filtered_scenarios = scenarios
        selected['test_scenarios'] = filtered_scenarios
        selected['last_prompt'] = prompt
        selected['scenario_history'] = history
        session['selected_ticket'] = selected
        # Return new scenarios and last history item
        last_history = history[-1] if history else None
        scenario_count = len(scenarios) if scenarios else 0
        logger.info(f"Manual prompt success: {scenario_count} scenarios generated.")
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
    """
    Update a Jira issue's description using the JIRA client.
    
    Args:
        issue_key: The Jira issue key (e.g., PROJECT-123)
        new_description: The new description in ADF format
        
    Returns:
        Tuple: (success: bool, error_message: str or None)
    """
    try:
        client = get_jira_client()
        
        if not client.is_authenticated():
            return False, 'Jira connection not available.'
        
        # Update the issue description
        result = client.update_issue(issue_key, description=new_description)
        
        if result.get('success'):
            logger.info(f"Successfully updated issue {issue_key} description")
            return True, None
        else:
            error_msg = result.get('error', f'Failed to update issue {issue_key}')
            logger.error(error_msg)
            return False, error_msg
            
    except Exception as e:
        error_msg = f'Unexpected error while updating Jira issue: {str(e)}'
        logger.exception(error_msg)
        return False, error_msg

@app.route('/api/update_ticket_with_scenarios', methods=['POST'])
def update_ticket_with_scenarios():
    """Update the selected Jira ticket by appending generated test scenarios to the Test Plan custom field."""
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
        
        # Fetch current custom field content from Jira
        try:
            client = get_jira_client()
            
            if not client.is_authenticated():
                logger.error(f"Not authenticated with Jira for issue {issue_key}")
                return jsonify({'success': False, 'error': 'Not authenticated with Jira.'}), 403
            
            issue_data = client.get_issue(issue_key)
            
            if "error" in issue_data:
                logger.error(f"Failed to fetch issue {issue_key}: {issue_data['error']}")
                return jsonify({'success': False, 'error': 'Failed to fetch current ticket information.'}), 500
            
            # Get the current Test Plan custom field content
            current_test_plan = issue_data.get('fields', {}).get('customfield_11334', '')
            
            # Convert ADF to text if needed
            if isinstance(current_test_plan, dict):
                current_test_plan = adf_to_text(current_test_plan)
            elif current_test_plan is None:
                current_test_plan = ''
            
            logger.debug(f"Current Test Plan content for {issue_key}: {current_test_plan[:200]}...")
            
        except Exception as e:
            logger.error(f"Error fetching issue {issue_key}: {str(e)}")
            return jsonify({'success': False, 'error': 'Failed to fetch current ticket information.'}), 500
        
        # Parse and update the Test Plan content
        updated_test_plan = update_test_plan_scenarios(current_test_plan, test_scenarios)
        
        # Return preview for user confirmation
        return jsonify({
            'success': True, 
            'preview': True,
            'current_content': current_test_plan,
            'updated_content': updated_test_plan,
            'message': 'Preview of Test Plan update. Please confirm to proceed.'
        }), 200
            
    except Exception as e:
        logger.exception(f"Unexpected error in update_ticket_with_scenarios: {str(e)}")
        return jsonify({
            'success': False, 
            'error': 'Internal server error occurred while preparing ticket update.'
        }), 500

@app.route('/api/confirm_update_ticket_with_scenarios', methods=['POST'])
def confirm_update_ticket_with_scenarios():
    """Confirm and execute the Test Plan custom field update."""
    try:
        # Check if user is connected to Jira
        if not session.get('jira_connected'):
            logger.warning("Confirm update attempted without Jira connection")
            return jsonify({'success': False, 'error': 'Not connected to Jira.'}), 403
        
        # Get selected ticket and test scenarios from session
        selected = session.get('selected_ticket', {})
        if not selected or not selected.get('key'):
            logger.warning("Confirm update attempted without selected ticket")
            return jsonify({'success': False, 'error': 'No ticket selected.'}), 400
        
        test_scenarios = selected.get('test_scenarios', [])
        if not test_scenarios:
            logger.warning("Confirm update attempted without test scenarios")
            return jsonify({'success': False, 'error': 'No test scenarios available to add.'}), 400
        
        issue_key = selected['key']
        
        # Get the updated content from request
        data = request.get_json() or {}
        updated_content = data.get('updated_content', '')
        
        if not updated_content:
            return jsonify({'success': False, 'error': 'No updated content provided.'}), 400
        
        # Update the custom field using JIRA client
        try:
            client = get_jira_client()
            
            if not client.is_authenticated():
                logger.error(f"Not authenticated with Jira for issue {issue_key}")
                return jsonify({'success': False, 'error': 'Authentication failed with Jira.'}), 403
            
            # Use JIRA library method to update the custom field
            result = client.update_issue(issue_key, **{"customfield_11334": updated_content})
            
            if result.get('success'):
                # Update the session with new test plan content
                selected['test_plan_field'] = updated_content
                session['selected_ticket'] = selected
                
                logger.info(f"Successfully updated Test Plan for issue {issue_key}")
                return jsonify({
                    'success': True, 
                    'message': f'Test Plan updated for {issue_key}.'
                }), 200
            else:
                error_msg = result.get('error', 'Failed to update Test Plan.')
                # Handle specific JIRA field error
                if "Field 'customfield_11334' cannot be set" in error_msg:
                    error_msg = "Test Plan field not available on this ticket type."
                logger.error(f"Failed to update Test Plan for {issue_key}: {error_msg}")
                return jsonify({
                    'success': False, 
                    'error': error_msg
                }), 500
                
        except Exception as e:
            error_msg = str(e)
            # Handle specific JIRA field error
            if "Field 'customfield_11334' cannot be set" in error_msg:
                error_msg = "Test Plan field not available on this ticket type."
                logger.error(f"Failed to update Test Plan for {issue_key}: {error_msg}")
                return jsonify({'success': False, 'error': error_msg}), 500
            else:
                logger.error(f"Error updating Test Plan for {issue_key}: {error_msg}")
                return jsonify({'success': False, 'error': 'Failed to update Test Plan.'}), 500
            
    except Exception as e:
        logger.exception(f"Unexpected error in confirm_update_ticket_with_scenarios: {str(e)}")
        return jsonify({
            'success': False, 
            'error': 'Internal server error occurred while updating ticket.'
        }), 500

@logutil.log_exceptions
def update_test_plan_scenarios(current_content, test_scenarios):
    """
    Update the Test Scenarios section in the Test Plan content.
    
    Args:
        current_content: Current Test Plan content
        test_scenarios: List of test scenarios to add
        
    Returns:
        Updated Test Plan content with scenarios
    """
    if not current_content:
        # If no existing content, create a basic template
        current_content = (
            "Testing Environment URL: \n\n"
            "Permissions: \n\n"
            "Prerequisites: \n\n"
            "Testing Tools: \n\n"
            "Navigation: \n\n"
            "Test Data: \n\n"
            "Test Scenarios: \n\n"
            "Approved By: \n\n\n"
        )
    
    # Find the Test Scenarios section
    lines = current_content.split('\n')
    updated_lines = []
    scenarios_section_found = False
    scenarios_added = False
    
    for i, line in enumerate(lines):
        if 'Test Scenarios:' in line and not scenarios_section_found:
            scenarios_section_found = True
            updated_lines.append(line)
            
            # Add an empty line after "Test Scenarios:"
            updated_lines.append('')
            
            # Add the numbered test scenarios
            for j, scenario in enumerate(test_scenarios, 1):
                updated_lines.append(f"{j}. {scenario}")
            
            updated_lines.append('')  # Add empty line after scenarios
            scenarios_added = True
            
            # Skip existing content until we find the next section or "Approved By:"
            k = i + 1
            while k < len(lines):
                next_line = lines[k].strip()
                # Stop when we find the next section (containing ":" and not empty)
                if next_line and ':' in next_line and not next_line.startswith(('1.', '2.', '3.', '4.', '5.', '6.', '7.', '8.', '9.')):
                    break
                k += 1
            
            # Continue from the next section
            for remaining_line in lines[k:]:
                updated_lines.append(remaining_line)
            break
        else:
            updated_lines.append(line)
    
    # If Test Scenarios section wasn't found, append it before "Approved By:"
    if not scenarios_added:
        # Look for "Approved By:" and insert before it
        for i, line in enumerate(updated_lines):
            if 'Approved By:' in line:
                # Insert Test Scenarios section before Approved By
                updated_lines.insert(i, 'Test Scenarios: ')
                updated_lines.insert(i + 1, '')
                
                for j, scenario in enumerate(test_scenarios, 1):
                    updated_lines.insert(i + 2 + j, f"{j}. {scenario}")
                
                updated_lines.insert(i + 2 + len(test_scenarios), '')
                break
        else:
            # If "Approved By:" not found, append at the end
            updated_lines.extend([
                'Test Scenarios: ',
                ''
            ])
            for j, scenario in enumerate(test_scenarios, 1):
                updated_lines.append(f"{j}. {scenario}")
            updated_lines.extend(['', 'Approved By: ', '', ''])
    
    return '\n'.join(updated_lines)

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
    
    # Use Google AI for test scenario generation
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
