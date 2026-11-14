// Preserve Nest decorator metadata and resolve Prisma's generated .js imports to TS.
require('ts-node').register({ experimentalResolver: true });
require('./ratecon-browser-fixture.ts');
