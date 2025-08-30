try:
    from flask import Flask, render_template, request, redirect, url_for, session, jsonify, flash
except Exception:
    # Fallback stubs for environments without Flask (used only to satisfy static analysis/editing tools)
    class _StubSession(dict):
        pass

    Flask = object

    def render_template(*a, **k):
        return ""

    class _Req:
        def __init__(self):
            self.form = {}
            self.args = {}
        def get_json(self):
            return {}

    request = _Req()

    def redirect(x):
        return x

    def url_for(x, **k):
        return "/"

    session = _StubSession()

    def jsonify(*a, **k):
        return {}

    def flash(*a, **k):
        return None

try:
    from flask_session import Session
except Exception:
    class Session:
        def __init__(self, app=None):
            pass

import requests
import os
from requests.auth import HTTPBasicAuth
import re

# Configuration
app = Flask(__name__, template_folder="templates", static_folder="static")
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "change-me-in-production")
app.config["SESSION_TYPE"] = "filesystem"
app.config["SESSION_PERMANENT"] = False
Session(app)

# Helpers
def jira_auth_headers(email, api_token):
    auth = HTTPBasicAuth(email, api_token)
    return auth

def validate_jira_connection(jira_url, email, api_token):
    try:
        api = jira_url.rstrip("/") + "/rest/api/3/myself"
        resp = requests.get(api, auth=jira_auth_headers(email, api_token), timeout=10)
        if resp.status_code == 200:
            return resp.json()
        else:
            return None
    except Exception:
        return None

def search_issues(jira_url, email, api_token, jql, max_results=50):
    try:
        api = jira_url.rstrip("/") + "/rest/api/3/search"
        params = {"jql": jql, "maxResults": max_results}
        resp = requests.get(api, params=params, auth=jira_auth_headers(email, api_token), timeout=20)
        if resp.status_code == 200:
            return resp.json()
        else:
            return {"error": f"Jira API returned {resp.status_code}: {resp.text}"}
    except Exception as e:
        return {"error": str(e)}

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
    return ''.join([p for p in text_parts if p])

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

    if not jira_url or not email or not api_token:
        return jsonify({"success": False, "message": "All fields are required."}), 400

    user = validate_jira_connection(jira_url, email, api_token)
    if not user:
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

    return jsonify({"success": True, "user": {"displayName": display_name, "email": email_addr}})

@app.route("/logout", methods=["POST"])
def logout():
    # Clear connection-related session data
    keys = ["jira_connected", "jira_url", "jira_email", "jira_api_token", "user_full_name", "user_email", "user_initials", "search_results", "last_query", "selected_ticket"]
    for k in keys:
        session.pop(k, None)
    return redirect(url_for("index"))

@app.route("/search", methods=["POST"])
def search():
    if not session.get("jira_connected"):
        flash("Please connect to Jira first.", "warning")
        return redirect(url_for("index"))

    query = request.form.get("query", "").strip()
    if not query:
        flash("Search query cannot be empty.", "danger")
        return redirect(url_for("index"))

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
    flash(f"Found {len(results)} issue(s).", "success")
    return redirect(url_for("index"))

@app.route('/select', methods=['POST'])
def select_ticket():
    if not session.get('jira_connected'):
        return jsonify({'success': False, 'message': 'Not connected to Jira.'}), 403
    data = request.get_json() or {}
    key = data.get('key')
    url = data.get('url')
    summary = data.get('summary')
    if not key:
        return jsonify({'success': False, 'message': 'No ticket key provided.'}), 400
    # Attempt to fetch description for the selected issue from Jira
    description_text = ''
    try:
        jira_url = session.get('jira_url')
        email = session.get('jira_email')
        api_token = session.get('jira_api_token')
        if jira_url and email and api_token:
            issue_api = f"{jira_url}/rest/api/3/issue/{key}?fields=description"
            r = requests.get(issue_api, auth=jira_auth_headers(email, api_token), timeout=10)
            if r.status_code == 200:
                issue_data = r.json()
                desc = issue_data.get('fields', {}).get('description')
                if isinstance(desc, str):
                    description_text = desc
                else:
                    # likely Atlassian Document Format (ADF)
                    description_text = adf_to_text(desc)
            else:
                # API call failed; keep description empty but return success
                description_text = ''
    except Exception:
        description_text = ''

    # store ticket info including description in session
    session['selected_ticket'] = {'key': key, 'url': url, 'summary': summary, 'description': description_text}
    return jsonify({'success': True, 'selected': session['selected_ticket']})

@app.route("/clear", methods=["POST"])
def clear_results():
    session.pop("search_results", None)
    session.pop("last_query", None)
    session.pop("selected_ticket", None)
    flash("Search results cleared.", "info")
    return redirect(url_for("index"))

if __name__ == "__main__":
    app.run(debug=True)
