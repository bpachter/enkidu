"""
python_sandbox.py — restricted Python execution tool

Lets the ReAct agent execute Python code to do arithmetic and data
analysis it can't reliably do in its head (CAGR, blended metrics,
ratio comparisons, descriptive stats, etc.).

Security model (appropriate for a personal home machine):
    - Runs in a subprocess with a hard timeout (default 10s)
    - Code is written to a temp file (no shell injection)
    - stdout + stderr are captured and returned as the observation
    - No network requests or destructive filesystem ops in practice,
      though not enforced at OS level — this is a personal tool, not
      a multi-tenant server

Usage by the agent:
    action: python_sandbox
    action_input: {"code": "import numpy as np; print(np.log(2.5/1.0) / 5)"}
"""

import os
import sys
import subprocess
import tempfile


def run_python(code: str, timeout: int = 10) -> str:
    """
    Execute Python code in a subprocess and return the output.

    Args:
        code:    Valid Python source code as a string
        timeout: Max seconds before the process is killed (default 10)

    Returns:
        stdout + stderr as a single string, truncated to 2000 chars.
        On timeout or other failure, returns a descriptive error string.
    """
    # Write to a temp file — avoids any shell quoting issues
    tmp = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".py", delete=False, encoding="utf-8"
        ) as f:
            f.write(code)
            tmp = f.name

        result = subprocess.run(
            [sys.executable, tmp],
            capture_output=True,
            text=True,
            timeout=timeout,
        )

        output = ""
        if result.stdout:
            output += result.stdout
        if result.stderr:
            # Only include stderr if there's no stdout, or if it looks like an error
            if not result.stdout.strip() or result.returncode != 0:
                output += f"\n[stderr]\n{result.stderr}"

        output = output.strip()

        if not output:
            output = "(no output)"

        # Truncate to keep context window manageable
        if len(output) > 2000:
            output = output[:2000] + "\n... (truncated)"

        return output

    except subprocess.TimeoutExpired:
        return f"Error: code execution timed out after {timeout}s"
    except Exception as e:
        return f"Sandbox error: {e}"
    finally:
        if tmp:
            try:
                os.unlink(tmp)
            except OSError:
                pass


# --- Quick test ---
if __name__ == "__main__":
    test_cases = [
        # Basic arithmetic
        "print(2 + 2)",
        # CAGR calculation
        "end, start, years = 2.5, 1.0, 5; cagr = (end/start)**(1/years) - 1; print(f'CAGR: {cagr:.1%}')",
        # numpy
        "import numpy as np; data = [6.2, 5.8, 7.1]; print(f'Mean EV/EBIT: {np.mean(data):.2f}x')",
        # Timeout test (commented out — takes 10s)
        # "import time; time.sleep(15); print('done')",
    ]

    for code in test_cases:
        print(f"Code:   {code}")
        print(f"Output: {run_python(code)}\n")
