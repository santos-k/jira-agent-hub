# jira-agent-hub

Lightweight Flask web UI to connect to Jira (Atlassian Cloud) and search tickets. Stores connection and search results in server-side session so results persist across navigation and refresh.

Features
- Connect to Jira using Jira URL, Email/Username and API Token (modal in the navbar).
- Search tickets by single key (ABC-123), multiple comma-separated keys, or by JQL.
- Display results in a Bootstrap 5 table with ticket links that open in a new tab.
- Server-side session persistence of connection info and last search results using flask-session (filesystem by default).

Project setup

Prerequisites
- Python 3.8 or newer
- pip
- (recommended) Git

1) Clone the repo (if you haven't already):
   git clone <repo-url>
   cd jira-agent-hub

2) Create and activate a virtual environment

- Windows (PowerShell):
  # Create
  python -m venv .venv
  # Activate
  .\.venv\Scripts\Activate.ps1

- Windows (CMD):
  # Create
  python -m venv .venv
  # Activate
  .venv\Scripts\activate.bat

- macOS / Linux:
  # Create
  python3 -m venv .venv
  # Activate
  source .venv/bin/activate

3) Install dependencies

   pip install -r requirements.txt

4) (optional) Example .env file

Create a file named .env in the project root (optional) with contents like:

FLASK_SECRET_KEY="a-very-secret-value"
FLASK_ENV=development

If you use python-dotenv or another loader the environment variables will be picked up automatically. For development you can also set env vars directly in your shell.

5) Set environment variables (recommended)

- Windows (PowerShell):
  $env:FLASK_SECRET_KEY = "your-secret-key"
  $env:FLASK_ENV = "development"

- macOS / Linux:
  export FLASK_SECRET_KEY="your-secret-key"
  export FLASK_ENV=development

Note: FLASK_SECRET_KEY should be a random, strong string in production.

6) Run the app

- Development quick start:
  python app.py

- Alternatively using flask run (when FLASK_APP and env are set):
  set FLASK_APP=app.py        # Windows CMD
  $env:FLASK_APP = "app.py"  # PowerShell
  export FLASK_APP=app.py     # macOS / Linux
  flask run --host=127.0.0.1 --port=5000

7) Open the app in your browser:
   http://127.0.0.1:5000

## Usage notes
- Use an Atlassian Cloud API token for authentication (https://id.atlassian.com/manage-profile/security/api-tokens).
- When you "Connect to Jira" provide your Jira URL (e.g. https://your-domain.atlassian.net), your Atlassian account email and an API token.
- The app stores the Jira API token in the server-side session for the duration of the session. For production, use secure session storage (Redis) or a secrets manager and avoid storing secrets in plaintext.

## Project layout
- app.py — Flask application and Jira REST integration (search + connect + session handling).
- requirements.txt — Python dependencies.
- templates/ — Jinja2 templates (base.html, login_modal.html, search.html).
- static/ — static assets (CSS/JS).

### Future work (not implemented yet)
- Create, update, add comments, and transition tickets via the Jira API.
- Fetch tickets assigned to the logged-in user.
- Improve authentication handling (token encryption / server-side vault) and production-ready session store.

### Security
- Always run the app over HTTPS in production.
- Keep your API tokens secret and rotate them per your security policy.
- Use a production-ready session backend (Redis) if you expect multiple app instances or require persistent sessions.

### Troubleshooting
- Login fails: verify Jira URL, email and API token. Test the token with curl or Postman by calling /rest/api/3/myself.
- No search results: check that the JQL or issue keys are correct and the authenticated user has permissions to view the issues.
- Static JS not updating: try a hard refresh (Ctrl+F5) to clear cached JS/CSS.

### Selected ticket description
- When you select a ticket in the search results, the app now fetches the issue description from Jira and displays it below the selection area.
- The backend requests the issue via Jira REST (fields=description) and attempts to render plain text. If the description is returned in Atlassian Document Format (ADF), the server extracts text from the ADF structure.
- The description is stored in the server-side session as part of session['selected_ticket'] so it persists across refreshes.

If you do not see the description after selecting a ticket:
- Ensure you are connected to Jira and the authenticated user has permission to view the issue's description.
- Check browser DevTools Network tab for the POST /select request and server response.
- Check server logs for any API error messages.

## License
See LICENSE file.
