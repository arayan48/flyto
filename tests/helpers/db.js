'use strict';

// Tests that need PostgreSQL run only when FLYTO_TEST_DB_URL is set,
// e.g. FLYTO_TEST_DB_URL=postgres://flyto@localhost:5432/flyto_test
const url = process.env.FLYTO_TEST_DB_URL;

module.exports = {
  url,
  skip: url ? false : 'FLYTO_TEST_DB_URL not set',
};
