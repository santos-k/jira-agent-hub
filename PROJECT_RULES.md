# Jira Agent Hub - Project Rules

## Project Overview

Jira Agent Hub is a lightweight Flask web application that provides a user interface to connect to Jira (Atlassian Cloud), search for tickets, and includes an integrated AI Chat assistance feature. The application stores connection and search results in server-side sessions for persistence across navigation and page refreshes.

## Project Structure

```
├── ai/                    # AI integration modules
│   ├── __init__.py
│   └── google_ai.py       # Google Gemini AI integration
├── ai_engine/             # Additional AI engine components
├── static/                # Static assets
│   ├── css/               # CSS stylesheets
│   └── js/                # JavaScript files
├── templates/             # HTML templates
├── logs/                  # Application logs directory
├── app.py                 # Main application entry point
├── logger.py              # Centralized logging facility
├── logging_setup.py       # Logging configuration
├── requirements.txt       # Project dependencies
└── README.md              # Project documentation
```

## Coding Standards

### Python Code Style

1. **PEP 8 Compliance**: Follow [PEP 8](https://www.python.org/dev/peps/pep-0008/) style guide for Python code.
2. **Docstrings**: Use docstrings for all functions, classes, and modules following [PEP 257](https://www.python.org/dev/peps/pep-0257/).
3. **Type Hints**: Use type hints where appropriate to improve code readability and IDE support.
4. **Exception Handling**: Use specific exception types and the `@log_exceptions` decorator from `logger.py` for consistent error handling.
5. **Imports**: Organize imports in the following order:
   - Standard library imports
   - Third-party imports
   - Local application imports

### JavaScript Code Style

1. **ES6+ Features**: Use modern JavaScript features where appropriate.
2. **Event Handling**: Use event delegation where possible for better performance.
3. **Error Handling**: Always include error handling in fetch/AJAX calls.
4. **DOM Manipulation**: Check for element existence before manipulating DOM elements.

### HTML/CSS Standards

1. **Bootstrap 5**: Use Bootstrap 5 components and utilities for consistent UI.
2. **Responsive Design**: Ensure all UI components work on both desktop and mobile devices.
3. **Theme Support**: Support both light and dark themes using the theme system.

## Logging Guidelines

1. **Use the Centralized Logger**: Always use the project's logger from `logger.py` instead of print statements:
   ```python
   from logger import get_logger
   logger = get_logger(__name__)
   logger.info("Starting important task")
   ```

2. **Log Levels**:
   - `DEBUG`: Detailed information, typically useful only for diagnosing problems
   - `INFO`: Confirmation that things are working as expected
   - `WARNING`: Indication that something unexpected happened, but the application is still working
   - `ERROR`: Due to a more serious problem, the application has not been able to perform a function
   - `CRITICAL`: A serious error indicating that the program itself may be unable to continue running

3. **Exception Logging**: Use the `@log_exceptions` decorator for automatic exception logging with stack traces.

## API Integration Standards

### Jira API

1. **Authentication**: Use HTTPBasicAuth with email/username and API token.
2. **Error Handling**: Always check response status codes and handle errors appropriately.
3. **Rate Limiting**: Be mindful of Jira API rate limits and implement appropriate backoff strategies.

### Jira MCP (Model Context Protocol)

1. **Configuration**: Use the `mcp_config` module for all MCP configuration settings.
2. **Authentication**: Support both API token (via existing Jira session) and OAuth authentication methods.
3. **Integration**: Use the `MCPClient` class for all interactions with the MCP server.
4. **Error Handling**: Implement proper error handling and logging for all MCP operations.
5. **Fallback**: Always provide fallback to standard Jira API when MCP is unavailable or disabled.

### AI Integration

1. **API Keys**: Never hardcode API keys. Use environment variables or the UI for key management.
2. **Error Handling**: Implement graceful fallbacks when AI services are unavailable.
3. **Response Processing**: Always validate and sanitize AI responses before displaying to users.

## Testing Guidelines

1. **Unit Tests**: Write unit tests for all new functionality.
2. **Integration Tests**: Test API integrations with mock responses.
3. **UI Testing**: Test UI components across different browsers and screen sizes.

## Git Workflow

1. **Branch Naming**: Use descriptive branch names with prefixes:
   - `feature/` for new features
   - `bugfix/` for bug fixes
   - `hotfix/` for critical fixes
   - `refactor/` for code refactoring

2. **Commit Messages**: Write clear, concise commit messages in the imperative mood.
   - Good: "Add user authentication feature"
   - Bad: "Added stuff"

3. **Pull Requests**: Create descriptive pull requests with:
   - Summary of changes
   - Related issue numbers
   - Testing steps

## Environment Variables

1. **Required Variables**:
   - `FLASK_SECRET_KEY`: Secret key for Flask session encryption
   - `FLASK_ENV`: Application environment (development/production)

2. **Optional Variables**:
   - `LOG_LEVEL`: Logging level (DEBUG/INFO/WARNING/ERROR/CRITICAL)
   - `LOG_JSON`: Set to 1 or true for JSON-formatted logs

## Deployment Guidelines

1. **Environment Setup**:
   - Use a virtual environment for Python dependencies
   - Set appropriate environment variables

2. **Production Configuration**:
   - Set `FLASK_ENV=production`
   - Use a strong, random `FLASK_SECRET_KEY`
   - Configure appropriate logging levels

3. **Server Requirements**:
   - Python 3.8 or newer
   - Appropriate web server (e.g., Gunicorn, uWSGI) with reverse proxy (e.g., Nginx)

## Contribution Guidelines

1. **New Features**:
   - Discuss major changes via issues before implementation
   - Ensure code follows project standards
   - Include appropriate tests and documentation

2. **Bug Fixes**:
   - Reference the issue number in commit messages
   - Include steps to reproduce in the PR description

3. **Documentation**:
   - Update README.md for user-facing changes
   - Update code comments and docstrings for developer-facing changes

## Security Guidelines

1. **API Keys and Secrets**:
   - Never commit API keys or secrets to the repository
   - Use environment variables or secure storage

2. **User Data**:
   - Store sensitive user data (like API tokens) only in server-side sessions
   - Implement appropriate session timeout and security measures

3. **Input Validation**:
   - Validate and sanitize all user inputs
   - Use parameterized queries for database operations

## Performance Guidelines

1. **Resource Usage**:
   - Minimize memory usage in long-running processes
   - Implement appropriate caching strategies

2. **Response Times**:
   - Optimize database queries and API calls
   - Use asynchronous processing for long-running tasks

## Accessibility Guidelines

1. **WCAG Compliance**:
   - Follow Web Content Accessibility Guidelines (WCAG) 2.1 AA standards
   - Ensure proper contrast ratios for text and UI elements

2. **Keyboard Navigation**:
   - Ensure all interactive elements are keyboard accessible
   - Implement appropriate focus management

3. **Screen Readers**:
   - Use appropriate ARIA attributes
   - Test with screen readers