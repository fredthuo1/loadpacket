// No dotenv or Prisma connection: all persistence is replaced before Nest starts.
require('ts-node').register({ experimentalResolver: true });
require('./screens-browser-fixture.ts');
