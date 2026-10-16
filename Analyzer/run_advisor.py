"""Convenience launcher: python run_advisor.py scan --path samples"""
import sys

from dfg2_advisor.cli import main

if __name__ == "__main__":
    sys.exit(main())
