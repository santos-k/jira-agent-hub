import json
import requests
from typing import Dict, Any, Optional, List, Union
from flask import session, request, jsonify, Blueprint
from logger import get_logger, log_exceptions
from mcp.client import MCPClient
from mcp.auth import mcp_auth
from mcp.config import mcp_config

logger = get_logger(__name__)

# Create Blueprint for MCP API routes
mcp_bp = Blueprint('mcp', __name__, url_prefix='/api/mcp')

@mcp_bp.route('/status', methods=['GET'])
@log_exceptions
def mcp_status():
    """Get MCP integration status.
    
    Returns:
        JSON response with MCP status
    """
    status = {
        "enabled": mcp_config.is_enabled(),
        "connected": session.get("mcp_enabled", False),
        "auth_method": session.get("mcp_auth_method"),
        "server_url": mcp_config.get_server_url()
    }
    
    return jsonify(status)

@mcp_bp.route('/setup', methods=['POST'])
@log_exceptions
def setup_mcp():
    """Set up MCP integration using existing Jira session.
    
    Returns:
        JSON response with setup status
    """
    if not mcp_config.is_enabled():
        return jsonify({"success": False, "error": "MCP integration is not enabled"}), 400
    
    success = mcp_auth.setup_from_jira_session()
    
    if success:
        return jsonify({"success": True})
    else:
        return jsonify({"success": False, "error": "Failed to set up MCP with Jira session"}), 400

@mcp_bp.route('/setup/oauth', methods=['POST'])
@log_exceptions
def setup_mcp_oauth():
    """Set up MCP integration using OAuth credentials.
    
    Returns:
        JSON response with setup status
    """
    if not mcp_config.is_enabled():
        return jsonify({"success": False, "error": "MCP integration is not enabled"}), 400
    
    data = request.get_json()
    cloud_id = data.get('cloud_id')
    access_token = data.get('access_token')
    
    success = mcp_auth.setup_from_oauth(cloud_id, access_token)
    
    if success:
        return jsonify({"success": True})
    else:
        return jsonify({"success": False, "error": "Failed to set up MCP with OAuth credentials"}), 400

@mcp_bp.route('/execute', methods=['POST'])
@log_exceptions
def execute_mcp_action():
    """Execute an MCP action.
    
    Returns:
        JSON response with action result
    """
    if not session.get("mcp_enabled"):
        return jsonify({"success": False, "error": "MCP is not set up"}), 400
    
    data = request.get_json()
    action = data.get('action')
    params = data.get('params', {})
    
    if not action:
        return jsonify({"success": False, "error": "No action specified"}), 400
    
    # Create MCP client
    client = MCPClient()
    
    # Execute action
    try:
        result = client.execute_action(action, params)
        return jsonify({"success": True, "result": result})
    except Exception as e:
        logger.error(f"Failed to execute MCP action {action}: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 400

@mcp_bp.route('/search', methods=['POST'])
@log_exceptions
def search_issues():
    """Search Jira issues using MCP.
    
    Returns:
        JSON response with search results
    """
    if not session.get("mcp_enabled"):
        return jsonify({"success": False, "error": "MCP is not set up"}), 400
    
    data = request.get_json()
    query = data.get('query')
    max_results = data.get('max_results', 10)
    
    if not query:
        return jsonify({"success": False, "error": "No query specified"}), 400
    
    # Create MCP client
    client = MCPClient()
    
    # Search issues
    try:
        issues = client.search_issues(query, max_results)
        return jsonify({"success": True, "issues": issues})
    except Exception as e:
        logger.error(f"Failed to search issues with MCP: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 400

@mcp_bp.route('/issue/<issue_key>', methods=['GET'])
@log_exceptions
def get_issue(issue_key):
    """Get a Jira issue using MCP.
    
    Args:
        issue_key: Jira issue key
        
    Returns:
        JSON response with issue details
    """
    if not session.get("mcp_enabled"):
        return jsonify({"success": False, "error": "MCP is not set up"}), 400
    
    # Create MCP client
    client = MCPClient()
    
    # Get issue
    try:
        issue = client.get_issue(issue_key)
        return jsonify({"success": True, "issue": issue})
    except Exception as e:
        logger.error(f"Failed to get issue {issue_key} with MCP: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 400

@mcp_bp.route('/issue', methods=['POST'])
@log_exceptions
def create_issue():
    """Create a Jira issue using MCP.
    
    Returns:
        JSON response with created issue
    """
    if not session.get("mcp_enabled"):
        return jsonify({"success": False, "error": "MCP is not set up"}), 400
    
    data = request.get_json()
    
    # Create MCP client
    client = MCPClient()
    
    # Create issue
    try:
        issue = client.create_issue(data)
        return jsonify({"success": True, "issue": issue})
    except Exception as e:
        logger.error(f"Failed to create issue with MCP: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 400

@mcp_bp.route('/issue/<issue_key>', methods=['PUT'])
@log_exceptions
def update_issue(issue_key):
    """Update a Jira issue using MCP.
    
    Args:
        issue_key: Jira issue key
        
    Returns:
        JSON response with update status
    """
    if not session.get("mcp_enabled"):
        return jsonify({"success": False, "error": "MCP is not set up"}), 400
    
    data = request.get_json()
    
    # Create MCP client
    client = MCPClient()
    
    # Update issue
    try:
        success = client.update_issue(issue_key, data)
        return jsonify({"success": success})
    except Exception as e:
        logger.error(f"Failed to update issue {issue_key} with MCP: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 400

@mcp_bp.route('/issue/<issue_key>/comment', methods=['POST'])
@log_exceptions
def add_comment(issue_key):
    """Add a comment to a Jira issue using MCP.
    
    Args:
        issue_key: Jira issue key
        
    Returns:
        JSON response with comment status
    """
    if not session.get("mcp_enabled"):
        return jsonify({"success": False, "error": "MCP is not set up"}), 400
    
    data = request.get_json()
    comment = data.get('comment')
    
    if not comment:
        return jsonify({"success": False, "error": "No comment specified"}), 400
    
    # Create MCP client
    client = MCPClient()
    
    # Add comment
    try:
        success = client.add_comment(issue_key, comment)
        return jsonify({"success": success})
    except Exception as e:
        logger.error(f"Failed to add comment to issue {issue_key} with MCP: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 400

@mcp_bp.route('/disconnect', methods=['POST'])
@log_exceptions
def disconnect_mcp():
    """Disconnect MCP integration.
    
    Returns:
        JSON response with disconnect status
    """
    mcp_auth.clear_auth()
    return jsonify({"success": True})