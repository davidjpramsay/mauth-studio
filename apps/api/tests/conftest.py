"""Isolated TestClient fixtures do not use a network-exposed server."""

import os

os.environ.setdefault("MAUTH_UNSAFE_ALLOW_UNAUTHENTICATED", "1")
