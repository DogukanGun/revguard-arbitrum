"""RevGuard: deterministic revocation-window enforcement for ERC-7710 chains."""
from .core import (
    HEARTBEAT_TTL_S,
    P99_INCLUSION_FINALITY_S,
    RevGuard,
    prometheus_text,
    simulate,
)
from .models import Caveat, Decision, Delegation, Heartbeat

__all__ = [
    "RevGuard",
    "Delegation",
    "Caveat",
    "Heartbeat",
    "Decision",
    "simulate",
    "prometheus_text",
    "HEARTBEAT_TTL_S",
    "P99_INCLUSION_FINALITY_S",
]
__version__ = "0.1.0"
