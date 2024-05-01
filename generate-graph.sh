#!/usr/bin/env bash

set -euo pipefail

graph="$1"
graphname="$2"

export NODE_OPTIONS=--max-old-space-size=20000

node dist/run.mjs graph pregenerate "$graph" "$graphname"
node dist/run.mjs graph preload     "$graph" "$graphname"

i=0
while node dist/run.mjs graph render "$graph" "$graphname" $i
do
  let i=i+1
done

node dist/run.mjs graph commit      "$graph" "$graphname"