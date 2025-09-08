import json
import logging
from typing import Dict, Any, Optional, List
from mcp.client import MCPClient
from mcp.config import mcp_config
from logger import get_logger, log_exceptions

logger = get_logger(__name__)

class MCPAIChat:
    """
    MCP AI Chat client for generating test scenarios using Jira's Model Context Protocol (MCP).
    This class provides an interface similar to GoogleAIChat for easy integration.
    """
    
    def __init__(self, api_key=None):
        """
        Initialize the MCP AI Chat client.
        
        Args:
            api_key: Not used for MCP, but kept for compatibility with GoogleAIChat
        """
        self.client = MCPClient()
        self.history = []
        self.initialized = self.client.is_authenticated()
        
        if not self.initialized:
            logger.warning("MCP AI client not initialized: MCP not authenticated")
    
    def start_chat(self):
        """
        Start a new chat session.
        """
        self.history = []
        return True
    
    @log_exceptions
    def send_message(self, message: str) -> Optional[str]:
        """
        Send a message to the MCP AI service and get a response.
        
        Args:
            message: The message to send to the AI
            
        Returns:
            The AI's response as a string, or None if there was an error
        """
        if not self.initialized:
            logger.error("Cannot send message: MCP AI client not initialized")
            return None
        
        # Check if MCP AI is enabled
        if not mcp_config.get("mcp_ai_enabled", True):
            logger.error("MCP AI is disabled in configuration")
            return None
        
        try:
            # Add the user message to history
            self.history.append({"role": "user", "content": message})
            
            # Get AI configuration from MCP config
            model = mcp_config.get("mcp_ai_model", "default")
            max_tokens = mcp_config.get("mcp_ai_max_tokens", 1000)
            
            # Execute the generate_content action via MCP
            result = self.client.execute_mcp_action("generate_content", {
                "prompt": message,
                "history": self.history[:-1],  # Send previous history excluding the current message
                "model": model,
                "max_tokens": max_tokens
            })
            
            if "error" in result:
                logger.error(f"MCP AI error: {result['error']}")
                return None
            
            # Extract the response text
            response_text = self._extract_response_text(result)
            
            # Add the assistant's response to history
            if response_text:
                self.history.append({"role": "assistant", "content": response_text})
            
            return response_text
        
        except Exception as e:
            logger.exception(f"Error sending message to MCP AI: {str(e)}")
            return None
    
    def _extract_response_text(self, result: Dict[str, Any]) -> Optional[str]:
        """
        Extract the response text from the MCP AI result.
        
        Args:
            result: The result from the MCP AI service
            
        Returns:
            The extracted text, or None if it couldn't be extracted
        """
        try:
            # Check if the result contains a content field
            if "content" in result:
                return result["content"]
            
            # Check if the result contains a response field with content
            if "response" in result and isinstance(result["response"], dict):
                if "content" in result["response"]:
                    return result["response"]["content"]
            
            # Check if the result contains a text field
            if "text" in result:
                return result["text"]
            
            # If we can't find a standard field, return the entire result as a string
            return json.dumps(result)
        
        except Exception as e:
            logger.exception(f"Error extracting response text from MCP AI result: {str(e)}")
            return None