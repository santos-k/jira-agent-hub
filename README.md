# jira-agent-hub

Lightweight Flask web UI to connect to Jira (Atlassian Cloud) and search tickets, with integrated AI Chat assistance. Stores connection and search results in server-side session so results persist across navigation and refresh.

## Features

### Core Features
- Connect to Jira using Jira URL, Email/Username and API Token (modal in the navbar)
- Search tickets by single key (ABC-123), multiple comma-separated keys, or by JQL
- Display results in a Bootstrap 5 table with ticket links that open in a new tab
- Server-side session persistence of connection info and last search results using flask-session
- Dark/Light theme support with automatic system preference detection
- Responsive design supporting desktop and mobile devices

### AI Chat Interface
- Accessible via the "AI Chat" button in the navigation bar
- Sliding sidebar interface with smooth animations
- Real-time chat interaction with:
  - User message bubbles (right-aligned, primary color)
  - AI response bubbles (left-aligned, secondary color)
  - Message actions for AI responses:
    - Copy to clipboard functionality
    - Response regeneration option
- Keyboard shortcuts:
  - Enter to send message
  - Shift+Enter for new line
- Mobile-responsive design with full-width sidebar on smaller screens

## API Endpoints

### Authentication Endpoints
- `POST /login`
  - Purpose: Authenticate with Jira
  - Parameters:
    - `jira_url`: Jira instance URL
    - `email`: User email
    - `api_token`: Jira API token
  - Response: Redirects to home page with success/error message

- `POST /logout`
  - Purpose: Clear session and logout
  - Response: Redirects to home page

### Search Endpoints
- `GET /`
  - Purpose: Main search interface
  - Response: Renders search page with previous results if any

- `POST /search`
  - Purpose: Search Jira tickets
  - Parameters:
    - `search_query`: Ticket key(s) or JQL query
  - Response: JSON with search results or error message

### AI Chat Endpoints (Frontend-only currently)
- Future backend integration planned for:
  - `POST /api/chat/message`
    - Send user message and get AI response
  - `POST /api/chat/regenerate`
    - Regenerate AI response for previous message

## Project setup

Prerequisites
- Python 3.8 or newer
- pip
- (recommended) Git

1) Clone the repo (if you haven't already):
   git clone <repo-url>
   cd jira-agent-hub

2) Create and activate a virtual environment

- Windows (PowerShell):
  - Create: `python -m venv .venv`
  - Activate: `.\.venv\Scripts\Activate.ps1`

- Windows (CMD):
  - Create: `python -m venv .venv`
  - Activate: `.venv\Scripts\activate.bat`

- macOS / Linux:
  - Create: `python3 -m venv .venv`
  - Activate: `source .venv/bin/activate`

3) Install dependencies: `pip install -r requirements.txt`

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
  `python app.py`

- Alternatively using flask run (when FLASK_APP and env are set):
  set FLASK_APP=app.py        # Windows CMD
  $env:FLASK_APP = "app.py"  # PowerShell
  export FLASK_APP=app.py     # macOS / Linux
  flask run --host=127.0.0.1 --port=5000

7) Open the app in your browser:
   http://127.0.0.1:5000

## UI Features & Theme Support

### Theme System
- Automatic dark/light mode detection based on system preferences
- Manual theme toggle via moon/sun icon in navbar
- Persistent theme selection across sessions
- Theme-aware components:
  - Navigation bar
  - Search interface
  - AI Chat sidebar
  - Message bubbles
  - Buttons and icons

### Responsive Design
- Adaptive layout for different screen sizes
- Mobile-optimized navigation
- Touch-friendly interface elements
- Full-width modals and sidebars on mobile
- Responsive table views for search results

### Security Considerations
- Always run the app over HTTPS in production
- Keep your API tokens secret and rotate them per your security policy
- Use a production-ready session backend (Redis) if you expect multiple app instances
- Implement proper rate limiting for AI chat endpoints when adding backend integration
- Consider implementing user authentication for AI chat feature access control

## Future Work
- Backend integration for AI Chat feature
- Create, update, add comments, and transition tickets via the Jira API
- Fetch tickets assigned to the logged-in user
- Improve authentication handling (token encryption / server-side vault)
- Production-ready session store implementation
- AI chat conversation history persistence
- Enhanced AI capabilities:
  - Ticket analysis and summarization
  - JQL query generation assistance
  - Natural language ticket creation
  - Context-aware responses based on Jira data

## Usage notes
- Use an Atlassian Cloud API token for authentication (https://id.atlassian.com/manage-profile/security/api-tokens).
- When you "Connect to Jira" provide your Jira URL (e.g. https://your-domain.atlassian.net), your Atlassian account email and an API token.
- The app stores the Jira API token in the server-side session for the duration of the session. For production, use secure session storage (Redis) or a secrets manager and avoid storing secrets in plaintext.

## Logging

This project uses a centralized logging facility implemented in logger.py. The logger provides both human-friendly console output and rotating file logs suitable for production.

Key features
- Uses Python's built-in logging module.
- Console + RotatingFileHandler -> logs/app.log (10 MB max per file, 5 backups).
- Log format: [%(asctime)s] [%(levelname)s] [%(name)s:%(funcName)s:%(lineno)d] - %(message)s
- Log levels: DEBUG, INFO, WARNING, ERROR, CRITICAL.
- Request/response logging for Flask endpoints (method, path, status, payload size, duration).
- Decorator @log_exceptions to automatically log exceptions with stack traces and re-raise.
- Easy switch to structured JSON logs for ELK/Splunk.
- Environment-based level: DEBUG in development, INFO in production (configurable via LOG_LEVEL or FLASK_ENV).

Where logs are written
- Human-readable logs and rotating files are stored under the logs/ directory in the project root. Default file: logs/app.log

Environment variables
- LOG_LEVEL: optional, can be DEBUG/INFO/WARNING/ERROR/CRITICAL. If not set, FLASK_ENV=development enables DEBUG; otherwise INFO.
- LOG_JSON: set to 1 or true to emit JSON-formatted logs (good for ELK/Splunk ingestion).
- FLASK_ENV: if set to development, the default level is DEBUG.

Basic usage

- Import a logger in any module:

    from logger import get_logger
    logger = get_logger(__name__)
    logger.info("Starting important task")

- Use the decorator to log unhandled exceptions and stack traces:

    from logger import log_exceptions

    @log_exceptions
    def risky_operation():
        # exceptions will be logged with stack trace
        ...

Flask request/response logging
- The app registers before_request/after_request hooks that record request duration, payload size and status for each request. This log line is emitted at INFO level.

Structured JSON logs
- Enable structured JSON logs by setting LOG_JSON=1 in the environment. The logger will then emit JSON objects containing timestamp, level, logger, function, line and message fields to both console and file.

Extending for production
- Logs are written to logs/app.log and rotated when they exceed 10 MB (5 backups retained).
- To integrate with centralized logging (ELK/Splunk), enable JSON mode and ship logs/app.log with your log forwarder.

Notes and next steps
- Replace any remaining print() calls across the project with logger.* calls for consistent logs.
- The logger creates the logs/ directory automatically on first import.

## Google GenAI AI Chat

This project includes an optional Google GenAI (Gemini) chat integration.

Installation
- Install the library and other dependencies: `pip install -r requirements.txt` (google-genai will be installed by requirements).

API Key
- The Google GenAI API key is entered via the UI when you open the AI Chat sidebar and is stored in the server-side session for the duration of the session.
- Alternatively you can POST the key to the endpoint `/api/ai/set_key` (json: `{ "api_key": "YOUR_KEY" }`).
- If no API key is present the UI prompts the user to add one. If the user skips, the UI will show "AI not available without API Key" behavior.

Running the AI Chat (development)
- Start the Flask app: `python app.py` (the AI endpoints are available under `/api/ai/*`).
- The original prompt suggested uvicorn; this integration is implemented as Flask endpoints in app.py. If you want a separate ASGI app, we can add one.

API endpoints
- GET /api/ai/has_key  — returns `{ "has_key": true|false }` to indicate whether a key is stored in the session.
- POST /api/ai/set_key — store API key in session (body: `{ "api_key": "..." }`).
- POST /api/ai/chat — send a message to the AI (body: `{ "message": "..." }`). Returns `{ "response": "..." }` or `{ "error": "..." }`.

Client-side usage
- The AI Chat button in the navbar opens a sidebar. If no API key is present, a modal prompts for one.
- The sidebar provides an input, send button, loading state, message history, copy and regenerate buttons.

Sample Python usage (SDK example)

from google import genai
client = genai.Client(api_key="your_api_key_here")
chat = client.chats.create(model="gemini-2.0-flash-001")

try:
    response = chat.send_message("tell me a story")
    print("Story:\n", response.text)
except Exception as e:
    print("Error:", e)

try:
    response = chat.send_message("summarize in 1 sentence")
    print("Summarized:\n", response.text)
except Exception as e:
    print("Error:", e)

Logging & error handling
- AI-related logs are written to logs/ai_chat.log and to the console. Format: `%(asctime)s | %(levelname)s | %(name)s | %(message)s`.
- The integration logs:
  - INFO when chat sessions start, when messages are sent, when responses are received, and when API keys are saved.
  - WARNING when the user attempts to chat without an API key.
  - ERROR/exception when API calls fail or unexpected errors occur.
- Frontend UI events are also posted to `/log_event` and emitted as INFO logs (theme toggles, AI open/close, send, response rendered).

Troubleshooting
- If the google-genai package is not installed you will see a warning and the AI endpoints will return appropriate errors. Install the dependency with `pip install google-genai`.
- Logs are available in logs/ai_chat.log for diagnosing API failures and payload details.

Security note
- API keys are stored in the server-side session only and not written to disk. For production consider a secure secrets store and proper session backend (Redis) and TLS.

## License
See LICENSE file.
