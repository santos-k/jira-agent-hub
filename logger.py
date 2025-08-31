import logging
import os
import json
import functools
from logging.handlers import RotatingFileHandler
from typing import Callable



# Ensure logs directory
LOG_DIR = os.path.join(os.path.dirname(__file__), "logs")
os.makedirs(LOG_DIR, exist_ok=True)

# Default formatter required by the project
DEFAULT_FORMAT = "[%(asctime)s] [%(levelname)s] [%(name)s:%(funcName)s:%(lineno)d] - %(message)s"


class JsonFormatter(logging.Formatter):
    """Simple JSON formatter to make future structured logging easy to enable."""

    def format(self, record: logging.LogRecord) -> str:
        base = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "func": record.funcName,
            "line": record.lineno,
            "message": record.getMessage(),
        }
        # Include exception info if present
        if record.exc_info:
            base["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(base, default=str)


_loggers_configured = set()


def _get_level_from_env():
    # LOG_LEVEL can be set; otherwise use FLASK_ENV to choose debug vs info
    lvl = os.getenv("LOG_LEVEL")
    if lvl:
        return getattr(logging, lvl.upper(), logging.INFO)
    if os.getenv("FLASK_ENV") == "development":
        return logging.DEBUG
    return logging.INFO


def get_logger(name: str) -> logging.Logger:
    """Create/configure a logger with console + rotating file handlers.

    The function is idempotent: calling it multiple times for the same name
    will not duplicate handlers.
    """
    logger = logging.getLogger(name)
    if name in _loggers_configured:
        return logger

    level = _get_level_from_env()
    logger.setLevel(level)

    # Human-friendly console handler
    ch = logging.StreamHandler()
    ch.setLevel(level)

    # Rotating file handler
    fh = RotatingFileHandler(
        os.path.join(LOG_DIR, "app.log"), maxBytes=10 * 1024 * 1024, backupCount=5, encoding="utf-8"
    )
    fh.setLevel(level)

    # Choose formatter (JSON if LOG_JSON=1)
    if os.getenv("LOG_JSON") in ("1", "true", "True"):
        formatter = JsonFormatter()
    else:
        formatter = logging.Formatter(DEFAULT_FORMAT)

    ch.setFormatter(formatter)
    fh.setFormatter(formatter)

    logger.addHandler(ch)
    logger.addHandler(fh)

    # Avoid propagating to root handlers more than once
    logger.propagate = False
    _loggers_configured.add(name)
    return logger


def log_exceptions(func: Callable) -> Callable:
    """Decorator to automatically log exceptions raised by the wrapped function
    and re-raise them.

    Usage:
        @log_exceptions
        def my_function(...):
            ...
    """

    # Resolve logger name safely to avoid static-analyzer warnings
    logger_name = getattr(func, "__module__", None) or getattr(func, "__qualname__", "app")
    logger = get_logger(logger_name)

    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except Exception:
            # Log full stacktrace and re-raise to keep existing behaviour
            logger.exception("Unhandled exception in %s", func.__qualname__)
            raise

    return wrapper
