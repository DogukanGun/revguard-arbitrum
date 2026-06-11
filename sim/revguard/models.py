"""Typed data models for the RevGuard ERC-7710 redelegation revocation prototype.

These mirror the SDK's typed models (Delegation, Caveat, Heartbeat, Decision)
but are intentionally small, framework-free, and dependency-free so the core
algorithm and its deterministic window bound can be reasoned about and tested
in isolation.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass(frozen=True)
class Caveat:
    """A single on-chain caveat enforcer attached to a delegation.

    ``enforcer`` names the enforcer contract (e.g. ``"TimestampEnforcer"``);
    ``terms`` carries the ABI-encoded-equivalent parameters as a plain dict.
    """

    enforcer: str
    terms: dict = field(default_factory=dict)


@dataclass
class Heartbeat:
    """A short-TTL, signed off-chain freshness proof for a delegator.

    Authority passively expires once ``now > issued_at + ttl_s``, requiring no
    cooperation from any downstream link (layer (c) of the design).
    """

    delegator: str
    issued_at: float
    ttl_s: float
    signature: str = "0xsig"

    def fresh_at(self, now: float) -> bool:
        return now <= self.issued_at + self.ttl_s

    def remaining_at(self, now: float) -> float:
        return max(0.0, (self.issued_at + self.ttl_s) - now)


@dataclass
class Delegation:
    """One link in an ERC-7710 redelegation chain (delegator -> delegate)."""

    delegation_hash: str
    delegator: str
    delegate: str
    epoch: int                      # delegator epoch stamped at creation time
    not_before: float               # TimestampEnforcer afterThreshold
    not_after: float                # TimestampEnforcer beforeThreshold (hard TTL)
    caveats: list[Caveat] = field(default_factory=list)


@dataclass
class Decision:
    """Result of full-chain re-validation at redemption time."""

    allowed: bool
    reason: str = "ok"
    failing_link: Optional[str] = None
    checked_links: int = 0
