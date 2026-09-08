# Vendored skill — ui-ux-pro-max

Source: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill (v2.11.0, MIT).
Author: NextLevelBuilder.

Only the self-contained `ui-ux-pro-max` skill is vendored here: a local,
searchable CSV database of UI/UX design rules (styles, palettes, fonts,
UX guidelines, motion, charts) plus a pure-Python search tool.

Reviewed before committing:
- scripts use the Python standard library only (csv/json/re/pathlib/argparse…);
- NO network calls, NO subprocess/os.system, NO eval/exec;
- the only file writes are the optional `--design-system --persist` output.

The upstream bundle's other sub-skills (background image fetching, shadcn
subprocess, logo-generation API calls) were deliberately NOT vendored to keep
this repo free of network/exec surface.

Usage:
  python ".claude/skills/ui-ux-pro-max/scripts/search.py" "<query>" --design-system
