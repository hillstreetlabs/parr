#!/usr/bin/env bash

set -e

yarn
yarn build

if [ -f server.pid ]
then
  SERVER_PID=`cat server.pid`
  if ! kill $SERVER_PID > /dev/null 2>&1; then
    echo "No process running at $SERVER_PID" >&2
  else
    echo "Killed process $SERVER_PID"
  fi
fi

echo "Starting server..."
node dist/index.js > logs/production.log 2> logs/production.log &

echo $! > server.pid
echo "Started server with pid $!"
