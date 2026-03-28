"""
conftest.py — Root-level pytest configuration.

Adds the project root to sys.path so that `from data.xxx import ...` and
`from agent.xxx import ...` work when pytest is invoked from any directory.
"""

import sys
import os

# Insert the project root at the front of the module search path.
sys.path.insert(0, os.path.dirname(__file__))
