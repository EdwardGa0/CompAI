require('dotenv').config();

const { MongoClient } = require('mongodb');
const _ = require('lodash');

const lol = require('./lol');

const client = new MongoClient(
    process.env.MONGO_URI,
    { useNewUrlParser: true, useUnifiedTopology: true },
);

const collections = {};
const queue = require('fastq').promise(worker, 1);

function daysAgo(n) {
  const nDaysAgo = new Date();
  nDaysAgo.setDate(nDaysAgo.getDate() - n);
  return nDaysAgo;
}

async function worker(id) {
  const match = await lol.getMatch(id);
  if (!match) return;

  // add match
  const options = { upsert: true };
  const filteredMatch = {
    matchId: match.metadata.matchId,
    gameVersion: match.info.gameVersion,
    participants: match.info.participants.map((participant) => (
      _.pick(
          participant,
          ['championId', 'championName', 'lane', 'puuid'],
      )),
    ),
  };
  const filter = { matchId: id };
  const update = { $set: filteredMatch };
  await collections.matches.updateOne(filter, update, options);

  // add players
  const puuids = filteredMatch.participants.map(
      (participant) => participant.puuid,
  );
  for (const puuid of puuids) {
    let summoner = await collections.summoners.findOne({ puuid });
    if (!summoner) {
      summoner = await lol.puuidToSummoner(puuid);
      await collections.summoners.insertOne(summoner);
    }
  }
  console.log('match', id, 'processed');
}


async function scheduler() {
  // go through oldest last update summoners and added matches to queue
  const cursor = await collections.summoners.find().sort( { lastAnalyzed: 1 });
  for await (const summoner of cursor) {
    const diff = Math.abs(summoner.lastAnalyzed - new Date());
    const milliPerGame = 30 * 60 * 1000;
    const count = Math.min(Math.floor(diff / milliPerGame), 100);
    if (count > 0) {
      const matchIds = await lol.puuidToMatchIds(summoner.puuid, count);
      if (matchIds && matchIds.length) {
        for (const id of matchIds) {
          await queue.push(id);
        }
        const filter = { puuid: summoner.puuid };
        const update = { $set: { lastAnalyzed: new Date() } };
        collections.summoners.updateOne(filter, update);
      }
    }
  }
}

// create seed summoner doc if not exist
async function createSeedSummoners() {
  let topSummoners;
  while (!topSummoners || !topSummoners.length) {
    topSummoners = await lol.getTopSummoners();
  }
  const result = await collections.summoners.bulkWrite(
      topSummoners.map((summoner) =>
        ({
          updateOne: {
            filter: { summonerId: summoner.summonerId },
            update: { $set: summoner },
            upsert: true,
          },
        }),
      ),
  );
  console.log(result);
}

// set puuid for all summoners
async function completeSummoners() {
  const cursor = collections.summoners.find({
    puuid: { $exists: false },
  });
  for await (const summoner of cursor) {
    const puuid = await lol.summonerToPuuid(summoner);
    if (puuid) {
      const filter = { summonerId: summoner.summonerId };
      const update = { $set: { puuid } };
      await collections.summoners.updateOne(filter, update);
    }
  }
  console.log('set puuids');

  const filter = { lastAnalyzed: { $exists: false } };
  const update = { $set: { lastAnalyzed: daysAgo(3) } };
  await collections.summoners.updateMany(filter, update);
  console.log('set last analyzed');
}

async function run() {
  try {
    await client.connect();
    const database = client.db('match_history');
    collections.summoners = database.collection('summoners');
    collections.matches = database.collection('matches');

    await createSeedSummoners();
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await completeSummoners();
      await scheduler();
      console.log('done');
    }
  } finally {
    await client.close();
  }
}

run().catch(console.dir);
