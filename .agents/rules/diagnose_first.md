# Rule: Diagnose-First & Evidence-Based Debugging

When handling bug reports, feature changes, or unexpected system behavior:

1. **Always Inspect and Verify First:**
   - Do NOT edit code immediately based on assumptions.
   - Inspect the database, logs, and trace code execution paths to establish empirical evidence for the root cause.

2. **Propose Plan Before Modifying:**
   - Present a clear technical proposal (`implementation_plan.md`) explaining the exact root cause and proposed changes.
   - Wait for explicit user confirmation before applying non-trivial source code modifications.

3. **No Superficial Patches:**
   - Address the actual underlying contract/logic issue instead of masking symptoms.
