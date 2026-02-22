#!/usr/bin/env python3
"""Simple gate checker for phased delivery completeness."""

from __future__ import annotations

import argparse
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
TASK_PLAN = ROOT / "task_plan.md"


PHASE_REQUIREMENTS = {
    0: ["Phase 0", "Status：** completed"],
    1: ["Phase 1", "schema_version", "skill.lock.json", "Status：** completed"],
    2: ["Phase 2", "skill-ref", "install/update/emit/validate/doctor", "Status：** completed"],
    3: ["Phase 3", "Hybrid registry", "Status：** completed"],
    4: ["Phase 4", "subprocess + stdin/stdout JSON", "Status：** completed"],
    5: ["Phase 5", "覆盖率", "Status：** completed"],
}


def check_phase(phase: int, text: str) -> list[str]:
    missing: list[str] = []
    for token in PHASE_REQUIREMENTS[phase]:
        if token not in text:
            missing.append(token)
    # ensure gate command exists for this phase
    gate_pattern = re.compile(rf"python3 scripts/phase_gate_check.py --phase {phase}")
    if not gate_pattern.search(text):
        missing.append(f"gate_command_phase_{phase}")
    return missing


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--phase", type=int, required=True, choices=sorted(PHASE_REQUIREMENTS))
    args = parser.parse_args()

    if not TASK_PLAN.exists():
        print(f"[FAIL] missing file: {TASK_PLAN}")
        return 1

    text = TASK_PLAN.read_text(encoding="utf-8")
    missing = check_phase(args.phase, text)

    if missing:
        print(f"[FAIL] phase {args.phase} missing: {', '.join(missing)}")
        return 1

    print(f"[PASS] phase {args.phase} gate satisfied")
    return 0


if __name__ == "__main__":
    sys.exit(main())
