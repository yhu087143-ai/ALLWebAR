#!/bin/bash
PORT=${PORT:-3001}
while node src/index.js; [ $? -eq 130 ]; do continue; done
