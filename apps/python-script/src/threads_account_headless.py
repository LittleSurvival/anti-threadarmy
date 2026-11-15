"""Headless command-line entry point; --send explicitly enables one lookup."""

from threads_account_search import main

if __name__ == "__main__":
    raise SystemExit(main())
