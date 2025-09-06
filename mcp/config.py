import os
import json
from typing import Dict, Any, Optional
from logger import get_logger

logger = get_logger(__name__)

class MCPConfig:
    """Configuration handler for MCP integration.
    
    This class manages configuration settings for the MCP integration,
    loading from environment variables or a configuration file.
    """
    
    # Default configuration values
    DEFAULT_CONFIG = {
        "mcp_enabled": False,
        "mcp_server_url": "https://mcp.atlassian.com",
        "use_remote_mcp": True,  # Use Atlassian's Remote MCP Server by default
        "local_mcp_url": "http://localhost:8080",  # For self-hosted MCP server
        # AI-specific configuration
        "mcp_ai_enabled": True,  # Enable MCP AI by default when MCP is enabled
        "mcp_ai_model": "default",  # Default AI model to use
        "mcp_ai_max_tokens": 1000,  # Maximum tokens for AI responses
    }
    
    def __init__(self):
        """Initialize the MCP configuration."""
        self.config = self.DEFAULT_CONFIG.copy()
        self.load_from_env()
        self.load_from_file()
    
    def load_from_env(self) -> None:
        """Load configuration from environment variables."""
        # Check if MCP is enabled
        if os.environ.get("MCP_ENABLED", "").lower() in ("true", "1", "yes"):
            self.config["mcp_enabled"] = True
        
        # MCP server URL
        if os.environ.get("MCP_SERVER_URL"):
            self.config["mcp_server_url"] = os.environ.get("MCP_SERVER_URL")
        
        # Remote vs local MCP server
        if os.environ.get("USE_REMOTE_MCP", "").lower() in ("false", "0", "no"):
            self.config["use_remote_mcp"] = False
        
        # Local MCP server URL
        if os.environ.get("LOCAL_MCP_URL"):
            self.config["local_mcp_url"] = os.environ.get("LOCAL_MCP_URL")
        
        # OAuth configuration
        if os.environ.get("ATLASSIAN_OAUTH_CLOUD_ID"):
            self.config["oauth_cloud_id"] = os.environ.get("ATLASSIAN_OAUTH_CLOUD_ID")
        
        if os.environ.get("ATLASSIAN_OAUTH_ACCESS_TOKEN"):
            self.config["oauth_access_token"] = os.environ.get("ATLASSIAN_OAUTH_ACCESS_TOKEN")
    
    def load_from_file(self, config_path: str = None) -> None:
        """Load configuration from a JSON file.
        
        Args:
            config_path: Path to the configuration file. If None, uses default path.
        """
        if not config_path:
            config_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "config", "mcp_config.json")
        
        if not os.path.exists(config_path):
            return
        
        try:
            with open(config_path, "r") as f:
                file_config = json.load(f)
                self.config.update(file_config)
        except Exception as e:
            logger.error(f"Failed to load MCP configuration from {config_path}: {str(e)}")
    
    def get(self, key: str, default: Any = None) -> Any:
        """Get a configuration value.
        
        Args:
            key: Configuration key
            default: Default value if key is not found
            
        Returns:
            Configuration value
        """
        return self.config.get(key, default)
    
    def is_enabled(self) -> bool:
        """Check if MCP integration is enabled.
        
        Returns:
            bool: True if enabled, False otherwise
        """
        return self.config.get("mcp_enabled", False)
    
    def get_server_url(self) -> str:
        """Get the MCP server URL based on configuration.
        
        Returns:
            str: MCP server URL
        """
        if self.config.get("use_remote_mcp", True):
            return self.config.get("mcp_server_url")
        else:
            return self.config.get("local_mcp_url")
    
    def get_oauth_credentials(self) -> Dict[str, str]:
        """Get OAuth credentials if configured.
        
        Returns:
            Dict containing OAuth credentials or empty dict if not configured
        """
        credentials = {}
        
        if self.config.get("oauth_cloud_id"):
            credentials["oauth_cloud_id"] = self.config.get("oauth_cloud_id")
        
        if self.config.get("oauth_access_token"):
            credentials["oauth_access_token"] = self.config.get("oauth_access_token")
        
        return credentials

# Create a singleton instance
mcp_config = MCPConfig()