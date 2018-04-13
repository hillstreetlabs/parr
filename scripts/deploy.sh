#!/usr/bin/env bash

set -e

yarn
yarn build

if [ -f server.pid ]
then
  SERVER_PID=`cat server.pid`
  kill $SERVER_PID
  echo "Killed process $SERVER_PID"
fi

echo "Starting server..."
yarn start > logs/production.log 2> logs/production.log &

echo $! > server.pid
echo "Started server with pid $!"
