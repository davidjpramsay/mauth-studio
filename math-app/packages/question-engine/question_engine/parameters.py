import random
import re

INT_PATTERN = re.compile(r"^int\[(-?\d+),(-?\d+)\]$")


def sample_int(spec: str, rng: random.Random, fallback: int = 1) -> int:
    match = INT_PATTERN.match(spec)
    if not match:
        return fallback
    low, high = int(match.group(1)), int(match.group(2))
    return rng.randint(low, high)
