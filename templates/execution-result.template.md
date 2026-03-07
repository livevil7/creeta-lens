---
id: exec_{timestamp}_{hex}
type: execution
created: {iso_datetime}
status: {final_status}
generator: lens/{skill_name}
language: {language}
parent: {plan_id}
refs: [{plan_id}]
---

# Execution Result / {header_result}

**Plan reference**: {plan_id}

## Summary

| Item | Value |
|------|-------|
| Started | {start_time} |
| Completed | {end_time} |
| Duration | {duration} |
| Final Status | {final_status} |
| Skill | /{skill_name} |

## Outcome Detail

### Expected vs Actual

| # | Expected | Actual | Achieved |
|---|----------|--------|----------|
{outcomes_comparison}

## Issues

{?issues}
| # | Issue | Severity | Cause | Resolved |
|---|-------|----------|-------|----------|
{issues_table}
{/issues}
{?no_issues}
No issues encountered during execution.
{/no_issues}

## Lessons Learned

{lessons|default:N/A}

## Follow-up Actions

{followup|default:No follow-up actions required.}
