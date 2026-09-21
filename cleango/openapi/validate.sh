#!/usr/bin/env bash
# Validate the LUMI OpenAPI contract (structure + reference resolution).
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
python3 - "$DIR/lumi-api-v1.yaml" <<'PY'
import sys, re, yaml
from openapi_spec_validator import validate
from openapi_spec_validator.readers import read_from_filename
path = sys.argv[1]
spec, _ = read_from_filename(path)
validate(spec)
text = open(path).read()
doc = yaml.safe_load(text)
missing = []
for r in set(re.findall(r'#/([^"\'\s}]+)', text)):
    node = doc
    for part in r.split('/'):
        if isinstance(node, dict) and part in node:
            node = node[part]
        else:
            missing.append(r); break
assert not missing, f"dangling refs: {missing}"
paths = spec['paths']
ops = sum(1 for p in paths.values() for m in p if m in ('get','post','patch','put','delete'))
print(f"OK — OpenAPI {spec['openapi']}: {len(paths)} paths, {ops} operations, "
      f"{len(spec['components']['schemas'])} schemas, all refs resolve")
PY
