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

## License
See LICENSE file.
