#!/usr/bin/env bash

set -euo pipefail

port=27080

ssh -NfL $port:localhost:$port shoegaze