import logging
import os

LOG_DIR = os.path.join(os.path.dirname(__file__), 'logs')
os.makedirs(LOG_DIR, exist_ok=True)

AI_LOG_FILE = os.path.join(LOG_DIR, 'ai_chat.log')
FORMAT = '%(asctime)s | %(levelname)s | %(name)s | %(message)s'


def setup_ai_logging(level=logging.INFO):
    logger = logging.getLogger('ai_chat')
    if logger.handlers:
        return
    logger.setLevel(level)

    # Console handler
    ch = logging.StreamHandler()
    ch.setLevel(level)
    ch.setFormatter(logging.Formatter(FORMAT))
    logger.addHandler(ch)

    # File handler (rotating not strictly required here but can be added)
    try:
        from logging.handlers import RotatingFileHandler
        fh = RotatingFileHandler(AI_LOG_FILE, maxBytes=5 * 1024 * 1024, backupCount=3, encoding='utf-8')
    except Exception:
        fh = logging.FileHandler(AI_LOG_FILE, encoding='utf-8')
    fh.setLevel(level)
    fh.setFormatter(logging.Formatter(FORMAT))
    logger.addHandler(fh)

    # Do not propagate to root twice
    logger.propagate = False


if __name__ == '__main__':
    setup_ai_logging()
    logging.getLogger('ai_chat').info('ai logging setup complete')

