import logging
from typing import Optional

logger = logging.getLogger('ai_chat')

# Try to import google-genai
try:
    from google import genai  # type: ignore
    _HAS_GENAI = True
except Exception as e:
    genai = None  # type: ignore
    _HAS_GENAI = False
    logger.warning('google-genai package not available: %s', str(e))


class GoogleAIChat:
    """Wrapper around google-genai chat functionality.

    Methods return simple strings on error for upstream handling.
    """

    def __init__(self, api_key: Optional[str]):
        self.api_key = api_key
        self.client = None
        self.chat = None

        if not api_key:
            logger.error('API key missing during GoogleAIChat initialization')
            return

        if not _HAS_GENAI:
            logger.error('google-genai package not installed; cannot initialize client')
            return

        try:
            # Initialize the genai client
            self.client = genai.Client(api_key=api_key)
            logger.info('GoogleAIChat client initialized')
            logger.debug('Client object: %s', getattr(self.client, '__dict__', str(self.client)))
        except Exception as e:
            msg = str(e)
            if '401' in msg or 'Unauthorized' in msg or 'unauthorized' in msg.lower() or 'invalid' in msg.lower():
                logger.error('Invalid API key or unauthorized: %s', msg)
            else:
                logger.exception('Failed to initialize Google GenAI client')
            self.client = None

    def start_chat(self, model: str = "gemini-2.0-flash-001") -> str:
        """Create a chat session with the given model.

        Returns "Chat started" on success or an error string on failure.
        """
        if not self.client:
            logger.error('Cannot start chat: client not initialized')
            return "Invalid API Key or unauthorized"

        try:
            logger.info('Starting chat session with model=%s', model)
            self.chat = self.client.chats.create(model=model)
            logger.debug('Chat session created: %s', getattr(self.chat, '__dict__', str(self.chat)))
            return "Chat started"
        except Exception as e:
            msg = str(e)
            if '401' in msg or 'Unauthorized' in msg or 'unauthorized' in msg.lower():
                logger.error('Invalid API key or unauthorized when starting chat: %s', msg)
                return "Invalid API Key or unauthorized"
            logger.exception('Failed to start chat session')
            return "AI service unavailable"

    def send_message(self, message: str) -> str:
        """Send a user message to the chat and return the AI response text.

        Returns plain text response or a short error string on failure.
        """
        if not self.client:
            logger.error('send_message called but client is not initialized')
            return "Invalid API Key or unauthorized"

        if not self.chat:
            start = self.start_chat()
            if start != "Chat started":
                # start_chat already logged details
                return start

        try:
            logger.info('Sending message to GenAI (truncated): %s', (message[:200] + '...') if len(message) > 200 else message)
            logger.debug('Request payload: %s', {'message': message})

            # Send message using the chat session
            response = self.chat.send_message(message)

            # Try common extraction patterns
            text = None

            # 1) direct .text attribute
            try:
                text = getattr(response, 'text', None)
            except Exception:
                text = None

            # 2) response.output -> list of content pieces
            if not text:
                try:
                    out = getattr(response, 'output', None)
                    if out and isinstance(out, (list, tuple)) and len(out) > 0:
                        parts = []
                        for part in out:
                            # part may be dict-like or object
                            c = None
                            if isinstance(part, dict):
                                c = part.get('content') or part.get('text')
                            else:
                                c = getattr(part, 'content', None) or getattr(part, 'text', None)

                            if isinstance(c, list):
                                for item in c:
                                    if isinstance(item, dict):
                                        parts.append(item.get('text') or str(item))
                                    else:
                                        parts.append(str(item))
                            elif isinstance(c, str):
                                parts.append(c)

                        if parts:
                            text = '\n'.join(parts)
                except Exception:
                    logger.debug('Exception while extracting response.output', exc_info=True)

            # 3) fallback: check .choices or other fields
            if not text:
                try:
                    choices = getattr(response, 'choices', None) or (response.get('choices') if isinstance(response, dict) else None)
                    if choices and isinstance(choices, (list, tuple)) and len(choices) > 0:
                        first = choices[0]
                        if isinstance(first, dict):
                            text = first.get('message') or first.get('text') or first.get('content')
                        else:
                            text = getattr(first, 'text', None) or getattr(first, 'message', None)
                except Exception:
                    logger.debug('Exception while extracting response.choices', exc_info=True)

            # 4) final fallback: string representation
            if not text:
                text = str(response)

            logger.info('Received response from GenAI (len=%d)', len(text) if text else 0)
            logger.debug('Response raw payload: %s', getattr(response, '__dict__', str(response)))
            return text

        except Exception as e:
            msg = str(e)
            low = msg.lower()
            # Detect common API key invalid messages returned by GenAI SDK
            if ('401' in msg) or ('unauthorized' in low) or ('api key not valid' in low) or ('api_key_invalid' in low) or ('invalid_argument' in low) or ('invalid' in low and 'key' in low):
                logger.error('Invalid API key or unauthorized during send_message: %s', msg)
                return "Invalid API Key or unauthorized"
            logger.exception('Exception when calling GenAI send_message')
            return "AI service unavailable"
