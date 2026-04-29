"""Sample Python module used by the FilePreview demo.

Demonstrates highlight.js syntax coloring on a typical robotics-flavoured
file with imports, dataclasses, type hints, and a main entrypoint.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Iterator


@dataclass(frozen=True)
class JointSample:
    timestamp: float
    angles: tuple[float, ...]

    @property
    def num_joints(self) -> int:
        return len(self.angles)


def load_samples(path: Path) -> Iterator[JointSample]:
    """Yield JointSample rows from a JSONL file at `path`."""
    import json

    with path.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            yield JointSample(
                timestamp=float(row["ts"]),
                angles=tuple(float(x) for x in row["q"]),
            )


def mean_angles(samples: Iterable[JointSample]) -> tuple[float, ...]:
    rows = list(samples)
    if not rows:
        return ()
    n_joints = rows[0].num_joints
    sums = [0.0] * n_joints
    for s in rows:
        for i, a in enumerate(s.angles):
            sums[i] += a
    return tuple(s / len(rows) for s in sums)


if __name__ == "__main__":
    import sys

    path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("joints.jsonl")
    print(mean_angles(load_samples(path)))
