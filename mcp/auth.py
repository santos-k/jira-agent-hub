import os
import json
import requests
from typing import Dict, Any, Optional, Tuple
from flask import session, redirect, url_for, request
from logger import get_logger, log_exceptions
from mcp.config import mcp_config

logger = get_logger(__name__)

class MCPAuthHandler:
    """Handler for MCP authentication.
    
    This class manages authentication with the MCP server, integrating with
    the existing Jira authentication in the application.
    """
    
    def __init__(self):
        """Initialize the MCP authentication handler."""
        self.server_url = mcp_config.get_server_url()
    
    @log_exceptions
    def setup_from_jira_session(self) -> bool:
        """Set up MCP authentication using existing Jira session data.
        
        Returns:
            bool: True if successful, False otherwise
        """
        if not session.get("jira_authenticated"):
            logger.debug("No active Jira session found for MCP setup")
            return False
        
        # Get Jira credentials from session
        jira_url = session.get("jira_url")
        email = session.get("jira_email")
        api_token = session.get("jira_api_token")
        
        if not all([jira_url, email, api_token]):
            logger.warning("Incomplete Jira credentials in session")
            return False
        
        # Store MCP credentials in session
        session["mcp_enabled"] = True
        session["mcp_auth_method"] = "api_token"
        session["mcp_server_url"] = self.server_url
        
        logger.info(f"MCP authentication set up using Jira API token for {email}")
        return True
    
    @log_exceptions
    def setup_from_oauth(self, cloud_id: str = None, access_token: str = None) -> bool:
        """Set up MCP authentication using OAuth credentials.
        
        Args:
            cloud_id: Atlassian OAuth Cloud ID
            access_token: Atlassian OAuth Access Token
            
        Returns:
            bool: True if successful, False otherwise
        """
        # Use provided credentials or get from config
        oauth_credentials = {}
        
        if cloud_id and access_token:
            oauth_credentials = {"oauth_cloud_id": cloud_id, "oauth_access_token": access_token}
        else:
            oauth_credentials = mcp_config.get_oauth_credentials()
        
        if not oauth_credentials.get("oauth_cloud_id") or not oauth_credentials.get("oauth_access_token"):
            logger.warning("Incomplete OAuth credentials for MCP setup")
            return False
        
        # Verify OAuth credentials with MCP server
        try:
            headers = {
                "Authorization": f"Bearer {oauth_credentials['oauth_access_token']}",
                "X-Atlassian-Cloud-ID": oauth_credentials['oauth_cloud_id']
            }
            resp = requests.get(f"{self.server_url}/api/v1/status", headers=headers, timeout=10)
            
            if resp.status_code != 200:
                logger.error(f"OAuth verification failed with status {resp.status_code}: {resp.text}")
                return False
        except Exception as e:
            logger.error(f"OAuth verification failed: {str(e)}")
            return False
        
        # Store MCP credentials in session
        session["mcp_enabled"] = True
        session["mcp_auth_method"] = "oauth"
        session["mcp_server_url"] = self.server_url
        session["mcp_oauth_cloud_id"] = oauth_credentials["oauth_cloud_id"]
        session["mcp_oauth_access_token"] = oauth_credentials["oauth_access_token"]
        
        logger.info(f"MCP authentication set up using OAuth for cloud ID {oauth_credentials['oauth_cloud_id']}")
        return True
    
    @log_exceptions
    def get_client_config(self) -> Dict[str, Any]:
        """Get MCP client configuration for frontend.
        
        Returns:
            Dict containing MCP client configuration
        """
        config = {
            "enabled": session.get("mcp_enabled", False),
            "server_url": session.get("mcp_server_url", self.server_url),
            "auth_method": session.get("mcp_auth_method", None)
        }
        
        return config
    
    @log_exceptions
    def clear_auth(self) -> None:
        """Clear MCP authentication data from session."""
        session.pop("mcp_enabled", None)
        session.pop("mcp_auth_method", None)
        session.pop("mcp_server_url", None)
        session.pop("mcp_oauth_cloud_id", None)
        session.pop("mcp_oauth_access_token", None)
        
        logger.info("MCP authentication data cleared from session")

# Create a singleton instance
mcp_auth = MCPAuthHandler()