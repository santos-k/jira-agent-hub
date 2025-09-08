import os
import requests
import json
import logging
from typing import Dict, List, Any, Optional
from requests.auth import HTTPBasicAuth
from logger import get_logger, log_exceptions

logger = get_logger(__name__)

class MCPClient:
    """Client for interacting with Atlassian's Model Context Protocol (MCP) server.
    
    This client provides methods to connect to and interact with Jira through the MCP server,
    allowing AI assistants to perform operations on Jira data.
    """
    
    def __init__(self, 
                 jira_url: str = None, 
                 email: str = None, 
                 api_token: str = None,
                 mcp_server_url: str = None,
                 oauth_cloud_id: str = None,
                 oauth_access_token: str = None):
        """Initialize the MCP client.
        
        Args:
            jira_url: Base URL of the Jira instance
            email: User email for Jira API token authentication
            api_token: Jira API token
            mcp_server_url: URL of the MCP server (defaults to Atlassian's Remote MCP server)
            oauth_cloud_id: Atlassian OAuth Cloud ID (for OAuth authentication)
            oauth_access_token: Atlassian OAuth Access Token (for OAuth authentication)
        """
        self.jira_url = jira_url
        self.email = email
        self.api_token = api_token
        self.mcp_server_url = mcp_server_url or os.environ.get("MCP_SERVER_URL", "https://mcp.atlassian.com")
        self.oauth_cloud_id = oauth_cloud_id or os.environ.get("ATLASSIAN_OAUTH_CLOUD_ID")
        self.oauth_access_token = oauth_access_token or os.environ.get("ATLASSIAN_OAUTH_ACCESS_TOKEN")
        self.session = requests.Session()
        
        # Configure authentication if credentials are provided
        if self.email and self.api_token:
            self.auth_method = "api_token"
            self.session.auth = HTTPBasicAuth(self.email, self.api_token)
        elif self.oauth_cloud_id and self.oauth_access_token:
            self.auth_method = "oauth"
            self.session.headers.update({
                "Authorization": f"Bearer {self.oauth_access_token}",
                "X-Atlassian-Cloud-ID": self.oauth_cloud_id
            })
        else:
            self.auth_method = None
    
    @log_exceptions
    def is_authenticated(self) -> bool:
        """Check if the client is authenticated with valid credentials.
        
        Returns:
            bool: True if authenticated, False otherwise
        """
        if not self.auth_method:
            return False
            
        try:
            if self.auth_method == "api_token":
                # Test authentication using Jira API
                api = f"{self.jira_url.rstrip('/')}/rest/api/3/myself"
                resp = self.session.get(api, timeout=10)
                return resp.status_code == 200
            elif self.auth_method == "oauth":
                # Test authentication using MCP server
                api = f"{self.mcp_server_url}/api/v1/status"
                resp = self.session.get(api, timeout=10)
                return resp.status_code == 200
            return False
        except Exception as e:
            logger.error(f"Authentication check failed: {str(e)}")
            return False
    
    @log_exceptions
    def execute_mcp_action(self, action: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """Execute an MCP action on the server.
        
        Args:
            action: The MCP action to execute
            params: Parameters for the action
            
        Returns:
            Dict containing the response from the MCP server
        """
        if not self.auth_method:
            return {"error": "Not authenticated. Please provide valid credentials."}
            
        try:
            api = f"{self.mcp_server_url}/api/v1/actions/{action}"
            headers = {"Content-Type": "application/json"}
            
            # Add Jira URL to params if using API token auth
            if self.auth_method == "api_token" and self.jira_url:
                params["jira_url"] = self.jira_url
                
            resp = self.session.post(api, json=params, headers=headers, timeout=30)
            
            if resp.status_code == 200:
                return resp.json()
            else:
                logger.error(f"MCP action {action} failed with status {resp.status_code}: {resp.text}")
                return {"error": f"MCP server returned {resp.status_code}: {resp.text}"}
        except Exception as e:
            logger.exception(f"Exception during MCP action {action}: {str(e)}")
            return {"error": str(e)}
    
    # Common MCP actions
    
    @log_exceptions
    def search_issues(self, jql: str, max_results: int = 50) -> Dict[str, Any]:
        """Search for Jira issues using JQL.
        
        Args:
            jql: JQL query string
            max_results: Maximum number of results to return
            
        Returns:
            Dict containing search results
        """
        return self.execute_mcp_action("search_issues", {
            "jql": jql,
            "maxResults": max_results
        })
    
    @log_exceptions
    def get_issue(self, issue_key: str) -> Dict[str, Any]:
        """Get a specific Jira issue by key.
        
        Args:
            issue_key: The Jira issue key (e.g., PROJECT-123)
            
        Returns:
            Dict containing issue details
        """
        return self.execute_mcp_action("get_issue", {
            "issue_key": issue_key
        })
    
    @log_exceptions
    def create_issue(self, 
                     project_key: str, 
                     summary: str, 
                     description: str = None, 
                     issue_type: str = "Task",
                     **fields) -> Dict[str, Any]:
        """Create a new Jira issue.
        
        Args:
            project_key: The project key
            summary: Issue summary
            description: Issue description
            issue_type: Type of issue (Task, Bug, Story, etc.)
            **fields: Additional fields to set on the issue
            
        Returns:
            Dict containing the created issue
        """
        params = {
            "project_key": project_key,
            "summary": summary,
            "issue_type": issue_type,
            "fields": fields
        }
        
        if description:
            params["description"] = description
            
        return self.execute_mcp_action("create_issue", params)
    
    @log_exceptions
    def update_issue(self, issue_key: str, **fields) -> Dict[str, Any]:
        """Update an existing Jira issue.
        
        Args:
            issue_key: The Jira issue key (e.g., PROJECT-123)
            **fields: Fields to update on the issue
            
        Returns:
            Dict containing the updated issue
        """
        return self.execute_mcp_action("update_issue", {
            "issue_key": issue_key,
            "fields": fields
        })
    
    @log_exceptions
    def add_comment(self, issue_key: str, comment: str) -> Dict[str, Any]:
        """Add a comment to a Jira issue.
        
        Args:
            issue_key: The Jira issue key (e.g., PROJECT-123)
            comment: Comment text
            
        Returns:
            Dict containing the added comment
        """
        return self.execute_mcp_action("add_comment", {
            "issue_key": issue_key,
            "comment": comment
        })