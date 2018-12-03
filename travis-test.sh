#!/bin/bash
echo "Branch: $TRAVIS_BRANCH"
make --no-print-directory testbin -C p
ERRORED=$?
if [[  "$ERRORED" == "1" ]]; then
	exit $ERRORED
fi

## NPM eslint
npm install -s eslint

## NPM test
cd r2dec-js
find ./libdec -type f -name "*.js" | xargs ../node_modules/.bin/eslint || ERRORED=1
ls ./*.js | xargs ../node_modules/.bin/eslint || ERRORED=1

exit $ERRORED
