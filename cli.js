#!/usr/bin/env node
const args = process.argv.slice(2);

if (!args.length) {
  require('./app');
} else {
  require('./lib/cli').run(args).then(code => process.exit(code), e => {
    console.error(e.message);
    process.exit(1);
  });
}
