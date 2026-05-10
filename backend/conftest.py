"""Pytest config — adds backend/ to sys.path so absolute imports work."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
