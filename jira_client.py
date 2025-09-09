"""
Jira Client Module

This module provides a simplified interface to Atlassian Jira using the official Python JIRA package.
It replaces the previous MCP-based implementation with direct API calls for better reliability and performance.
"""

import os
import json
from typing import Dict, List, Any, Optional, Tuple
from jira import JIRA
from jira.exceptions import JIRAError
from flask import session
from logger import get_logger, log_exceptions

logger = get_logger(__name__)


class JiraClient:
    """
    Client for interacting with Atlassian Jira using the official Python JIRA package.
    
    This client provides methods to connect to and interact with Jira directly,
    replacing the previous MCP-based implementation.
    """
    
    def __init__(self, jira_url: Optional[str] = None, email: Optional[str] = None, api_token: Optional[str] = None):
        """
        Initialize the Jira client.
        
        Args:
            jira_url: Base URL of the Jira instance
            email: User email for Jira API token authentication
            api_token: Jira API token
        """
        self.jira_url = jira_url
        self.email = email
        self.api_token = api_token
        self.jira = None
        self._authenticated = False
        
        if self.jira_url and self.email and self.api_token:
            self._connect()
    
    @classmethod
    def from_session(cls) -> 'JiraClient':
        """
        Create a JiraClient instance from Flask session data.
        
        Returns:
            JiraClient instance initialized with session credentials
        """
        jira_url = session.get("jira_url")
        email = session.get("jira_email") 
        api_token = session.get("jira_api_token")
        
        if not all([jira_url, email, api_token]):
            logger.warning("Incomplete Jira credentials in session")
            return cls()
        
        return cls(jira_url, email, api_token)
    
    @log_exceptions
    def _connect(self) -> bool:
        """
        Establish connection to Jira.
        
        Returns:
            bool: True if connection successful, False otherwise
        """
        try:
            # Ensure we have valid credentials
            if not all([self.jira_url, self.email, self.api_token]):
                logger.warning("Missing required credentials for Jira connection")
                return False
                
            # Create JIRA instance with basic authentication
            # Ensure both email and api_token are strings before creating tuple
            if self.email is None or self.api_token is None:
                logger.error("Email or API token is None, cannot authenticate")
                return False
                
            self.jira = JIRA(
                server=self.jira_url,
                basic_auth=(self.email, self.api_token),
                options={'verify': True}
            )
            
            # Test the connection by fetching current user info
            current_user = self.jira.current_user()
            self._authenticated = True
            
            logger.info(f"Successfully connected to Jira as {current_user}")
            return True
            
        except JIRAError as e:
            logger.error(f"JIRA connection failed: {e}")
            self._authenticated = False
            return False
        except Exception as e:
            logger.error(f"Unexpected error connecting to Jira: {e}")
            self._authenticated = False
            return False
    
    @log_exceptions
    def is_authenticated(self) -> bool:
        """
        Check if the client is authenticated with valid credentials.
        
        Returns:
            bool: True if authenticated, False otherwise
        """
        if not self._authenticated or not self.jira:
            return False
        
        try:
            # Test connection by making a simple API call
            if self.jira:
                self.jira.current_user()
                return True
            return False
        except Exception:
            self._authenticated = False
            return False
    
    @log_exceptions
    def validate_connection(self) -> Optional[Dict[str, Any]]:
        """
        Validate the Jira connection and return user info.
        
        Returns:
            Dict containing user info if successful, None if failed
        """
        if not self.is_authenticated():
            if not self._connect():
                return None
        
        try:
            if self.jira:
                user_key = self.jira.current_user()
                user_data = self.jira.user(user_key)
            else:
                return None
            
            # Build user info dict with safe attribute access
            user_info = {
                'displayName': getattr(user_data, 'displayName', ''),
                'emailAddress': getattr(user_data, 'emailAddress', ''),
                'accountId': getattr(user_data, 'accountId', '')
            }
            
            # Add name if available (some Jira instances don't have this field)
            if hasattr(user_data, 'name'):
                user_info['name'] = user_data.name
            elif hasattr(user_data, 'key'):
                user_info['name'] = user_data.key
            else:
                user_info['name'] = user_info['displayName']
            
            return user_info
        except Exception as e:
            logger.error(f"Failed to get user info: {e}")
            return None
    
    @log_exceptions
    def search_issues(self, jql: str, max_results: int = 50, expand: Optional[str] = None) -> Dict[str, Any]:
        """
        Search for Jira issues using JQL.
        
        Args:
            jql: JQL query string
            max_results: Maximum number of results to return
            expand: Fields to expand (comma-separated string)
            
        Returns:
            Dict containing search results in Jira API format
        """
        if not self.is_authenticated():
            return {"error": "Not authenticated with Jira"}
        
        try:
            logger.debug(f"Searching Jira with JQL: {jql}")
            
            if not self.jira:
                return {"error": "JIRA client not initialized"}
            
            # Perform search
            issues = self.jira.search_issues(
                jql_str=jql,
                maxResults=max_results,
                expand=expand
            )
            
            # Convert to format compatible with existing frontend
            results = {
                "total": len(issues),
                "maxResults": max_results,
                "issues": []
            }
            
            for issue in issues:
                issue_data = {
                    "key": issue.key,
                    "id": issue.id,
                    "self": issue.self,
                    "fields": {
                        "summary": issue.fields.summary,
                        "status": {
                            "name": issue.fields.status.name,
                            "statusCategory": {
                                "name": issue.fields.status.statusCategory.name
                            }
                        },
                        "assignee": None,
                        "priority": None,
                        "issuetype": {
                            "name": issue.fields.issuetype.name
                        },
                        "updated": getattr(issue.fields, 'updated', '')
                    }
                }
                
                # Add assignee if present
                if hasattr(issue.fields, 'assignee') and issue.fields.assignee:
                    issue_data["fields"]["assignee"] = {
                        "displayName": getattr(issue.fields.assignee, 'displayName', ''),
                        "emailAddress": getattr(issue.fields.assignee, 'emailAddress', ''),
                        "accountId": getattr(issue.fields.assignee, 'accountId', '')
                    }
                
                # Add priority if present
                if hasattr(issue.fields, 'priority') and issue.fields.priority:
                    issue_data["fields"]["priority"] = {
                        "name": issue.fields.priority.name
                    }
                
                # Add description if requested in expand
                if expand and 'description' in expand and hasattr(issue.fields, 'description'):
                    issue_data["fields"]["description"] = issue.fields.description
                
                results["issues"].append(issue_data)
            
            logger.info(f"Search completed: {len(issues)} results found")
            return results
            
        except JIRAError as e:
            logger.error(f"JIRA search error: {e}")
            return {"error": f"JIRA search failed: {str(e)}"}
        except Exception as e:
            logger.error(f"Unexpected search error: {e}")
            return {"error": f"Search failed: {str(e)}"}
    
    @log_exceptions
    def get_issue(self, issue_key: str, expand: str = "description,renderedFields") -> Dict[str, Any]:
        """
        Get a specific Jira issue by key.
        
        Args:
            issue_key: The Jira issue key (e.g., PROJECT-123)
            expand: Fields to expand (comma-separated string)
            
        Returns:
            Dict containing issue details in Jira API format
        """
        if not self.is_authenticated():
            return {"error": "Not authenticated with Jira"}
        
        try:
            logger.debug(f"Fetching issue: {issue_key}")
            
            if not self.jira:
                return {"error": "JIRA client not initialized"}
            
            issue = self.jira.issue(issue_key, expand=expand)
            
            # Convert to format compatible with existing frontend
            issue_data = {
                "key": issue.key,
                "id": issue.id,
                "self": issue.self,
                "fields": {
                    "summary": issue.fields.summary,
                    "description": getattr(issue.fields, 'description', None),
                    "status": {
                        "name": issue.fields.status.name,
                        "statusCategory": {
                            "name": issue.fields.status.statusCategory.name
                        }
                    },
                    "assignee": None,
                    "priority": None,
                    "issuetype": {
                        "name": issue.fields.issuetype.name
                    },
                    "project": {
                        "key": issue.fields.project.key,
                        "name": issue.fields.project.name
                    },
                    "updated": getattr(issue.fields, 'updated', '')
                }
            }
            
            # Add assignee if present
            if hasattr(issue.fields, 'assignee') and issue.fields.assignee:
                issue_data["fields"]["assignee"] = {
                    "displayName": getattr(issue.fields.assignee, 'displayName', ''),
                    "emailAddress": getattr(issue.fields.assignee, 'emailAddress', ''),
                    "accountId": getattr(issue.fields.assignee, 'accountId', '')
                }
            
            # Add priority if present
            if hasattr(issue.fields, 'priority') and issue.fields.priority:
                issue_data["fields"]["priority"] = {
                    "name": issue.fields.priority.name
                }
            
            # Add rendered fields if expanded
            if expand and 'renderedFields' in expand:
                rendered_fields = getattr(issue, 'renderedFields', {})
                issue_data["renderedFields"] = {}
                if hasattr(rendered_fields, 'description') and getattr(rendered_fields, 'description', None):
                    issue_data["renderedFields"]["description"] = getattr(rendered_fields, 'description')
                # Add custom field for test scenarios if available
                custom_field_rendered = getattr(rendered_fields, 'customfield_11334', None)
                if custom_field_rendered:
                    issue_data["renderedFields"]["customfield_11334"] = custom_field_rendered
                    logger.debug(f"Found rendered customfield_11334: {str(custom_field_rendered)[:200]}...")
            
            # Add custom field for test scenarios (raw value)
            if hasattr(issue.fields, 'customfield_11334'):
                test_scenarios_raw = getattr(issue.fields, 'customfield_11334')
                issue_data["fields"]["customfield_11334"] = test_scenarios_raw
                logger.debug(f"Found customfield_11334: {str(test_scenarios_raw)[:200]}...")
            
            logger.info(f"Successfully fetched issue: {issue_key}")
            return issue_data
            
        except JIRAError as e:
            logger.error(f"JIRA get issue error for {issue_key}: {e}")
            return {"error": f"Failed to get issue {issue_key}: {str(e)}"}
        except Exception as e:
            logger.error(f"Unexpected error getting issue {issue_key}: {e}")
            return {"error": f"Failed to get issue {issue_key}: {str(e)}"}
    
    @log_exceptions
    def create_issue(self, project_key: str, summary: str, description: Optional[str] = None, 
                    issue_type: str = "Task", **fields) -> Dict[str, Any]:
        """
        Create a new Jira issue.
        
        Args:
            project_key: The project key
            summary: Issue summary
            description: Issue description
            issue_type: Type of issue (Task, Bug, Story, etc.)
            **fields: Additional fields to set on the issue
            
        Returns:
            Dict containing the created issue data
        """
        if not self.is_authenticated():
            return {"error": "Not authenticated with Jira"}
        
        try:
            logger.debug(f"Creating issue in project {project_key}")
            
            if not self.jira:
                return {"error": "JIRA client not initialized"}
            
            # Prepare issue fields
            issue_dict = {
                'project': {'key': project_key},
                'summary': summary,
                'issuetype': {'name': issue_type}
            }
            
            if description:
                issue_dict['description'] = description
            
            # Add any additional fields
            issue_dict.update(fields)
            
            # Create the issue
            new_issue = self.jira.create_issue(fields=issue_dict)
            
            # Return issue data in consistent format
            result = {
                "key": new_issue.key,
                "id": new_issue.id,
                "self": new_issue.self,
                "success": True
            }
            
            logger.info(f"Successfully created issue: {new_issue.key}")
            return result
            
        except JIRAError as e:
            logger.error(f"JIRA create issue error: {e}")
            return {"error": f"Failed to create issue: {str(e)}"}
        except Exception as e:
            logger.error(f"Unexpected error creating issue: {e}")
            return {"error": f"Failed to create issue: {str(e)}"}
    
    @log_exceptions
    def update_issue(self, issue_key: str, **fields) -> Dict[str, Any]:
        """
        Update an existing Jira issue.
        
        Args:
            issue_key: The Jira issue key (e.g., PROJECT-123)
            **fields: Fields to update on the issue
            
        Returns:
            Dict containing update status
        """
        if not self.is_authenticated():
            return {"error": "Not authenticated with Jira"}
        
        try:
            logger.debug(f"Updating issue: {issue_key}")
            
            if not self.jira:
                return {"error": "JIRA client not initialized"}
            
            # Special handling for description field with ADF content
            # Use direct REST API call for ADF content to ensure proper handling
            if 'description' in fields and isinstance(fields['description'], dict):
                # Use direct REST API for ADF content
                import requests
                from requests.auth import HTTPBasicAuth
                
                logger.debug(f"Updating issue {issue_key} with ADF description: {fields['description']}")
                
                # Construct the API URL (ensure we use API v3 for ADF support)
                api_url = f"{self.jira_url}/rest/api/3/issue/{issue_key}"
                
                # Prepare the update payload
                update_payload = {
                    "fields": fields
                }
                
                logger.debug(f"API URL: {api_url}")
                logger.debug(f"Update payload: {update_payload}")
                
                # Make the API call
                response = requests.put(
                    api_url,
                    auth=HTTPBasicAuth(self.email, self.api_token),
                    headers={
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    json=update_payload,
                    timeout=30
                )
                
                logger.debug(f"Response status: {response.status_code}")
                logger.debug(f"Response text: {response.text[:500]}...")
                
                if response.status_code == 204:  # No Content - success
                    logger.info(f"Successfully updated issue {issue_key} via REST API")
                    return {"success": True}
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
                    return {"error": error_msg}
            # For custom fields and non-ADF content, use the standard JIRA library method
            issue = self.jira.issue(issue_key)
            issue.update(fields=fields)
            
            logger.info(f"Successfully updated issue: {issue_key}")
            return {"success": True}
            
        except JIRAError as e:
            logger.error(f"JIRA update issue error for {issue_key}: {e}")
            return {"error": f"Failed to update issue {issue_key}: {str(e)}"}
        except Exception as e:
            logger.error(f"Unexpected error updating issue {issue_key}: {e}")
            return {"error": f"Failed to update issue {issue_key}: {str(e)}"}
    
    @log_exceptions
    def add_comment(self, issue_key: str, comment: str) -> Dict[str, Any]:
        """
        Add a comment to a Jira issue.
        
        Args:
            issue_key: The Jira issue key (e.g., PROJECT-123)
            comment: Comment text
            
        Returns:
            Dict containing the added comment data
        """
        if not self.is_authenticated():
            return {"error": "Not authenticated with Jira"}
        
        try:
            logger.debug(f"Adding comment to issue: {issue_key}")
            
            if not self.jira:
                return {"error": "JIRA client not initialized"}
            
            comment_obj = self.jira.add_comment(issue_key, comment)
            
            result = {
                "id": comment_obj.id,
                "body": comment_obj.body,
                "author": {
                    "displayName": getattr(comment_obj.author, 'displayName', ''),
                    "accountId": getattr(comment_obj.author, 'accountId', '')
                },
                "created": comment_obj.created,
                "success": True
            }
            
            logger.info(f"Successfully added comment to issue: {issue_key}")
            return result
            
        except JIRAError as e:
            logger.error(f"JIRA add comment error for {issue_key}: {e}")
            return {"error": f"Failed to add comment to issue {issue_key}: {str(e)}"}
        except Exception as e:
            logger.error(f"Unexpected error adding comment to {issue_key}: {e}")
            return {"error": f"Failed to add comment to issue {issue_key}: {str(e)}"}
    
    @log_exceptions
    def get_projects(self) -> List[Dict[str, Any]]:
        """
        Get list of projects accessible to the user.
        
        Returns:
            List of project dictionaries
        """
        if not self.is_authenticated():
            return []
        
        try:
            if not self.jira:
                return []
                
            projects = self.jira.projects()
            
            result = []
            for project in projects:
                result.append({
                    "key": project.key,
                    "name": project.name,
                    "id": project.id
                })
            
            logger.info(f"Retrieved {len(result)} projects")
            return result
            
        except Exception as e:
            logger.error(f"Error getting projects: {e}")
            return []


# Convenience functions for backward compatibility
@log_exceptions
def get_jira_client() -> JiraClient:
    """
    Get a JiraClient instance from current session.
    
    Returns:
        JiraClient instance
    """
    return JiraClient.from_session()


@log_exceptions
def validate_jira_connection(jira_url: str, email: str, api_token: str) -> Optional[Dict[str, Any]]:
    """
    Validate Jira connection credentials.
    
    Args:
        jira_url: Jira server URL
        email: User email
        api_token: API token
        
    Returns:
        User info dict if successful, None if failed
    """
    client = JiraClient(jira_url, email, api_token)
    return client.validate_connection()


@log_exceptions
def search_issues(jira_url: str, email: str, api_token: str, jql: str, max_results: int = 50) -> Dict[str, Any]:
    """
    Search issues using JQL (backward compatibility function).
    
    Args:
        jira_url: Jira server URL
        email: User email
        api_token: API token
        jql: JQL query string
        max_results: Maximum results to return
        
    Returns:
        Search results dict
    """
    client = JiraClient(jira_url, email, api_token)
    return client.search_issues(jql, max_results)