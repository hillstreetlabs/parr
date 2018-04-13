#!/usr/bin/env bash

set -e

yarn
yarn build

if [ -f server.pid ]
then
  SERVER_PID=`cat server.pid`
<<<<<<< HEAD
  kill $SERVER_PID
  echo "Killed process $SERVER_PID"
=======
  if ! kill $SERVER_PID > /dev/null 2>&1; then
    echo "No process running at $SERVER_PID" >&2
  else
    echo "Killed process $SERVER_PID"
  fi
>>>>>>> cf8ba85a8507a95afc416b4d3ab93410573ee308
fi

echo "Starting server..."
yarn start > logs/production.log 2> logs/production.log &

echo $! > server.pid
echo "Started server with pid $!"
