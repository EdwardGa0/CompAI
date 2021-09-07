require('dotenv').config();
require('log-timestamp');

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
    if (!summoner || _.isEmpty(summoner)) {
      summoner = await lol.puuidToSummoner(puuid);
      if (summoner) {
        summoner.lastAnalyzed = daysAgo(3);
        await collections.summoners.insertOne(summoner);
      }
    }
  }
  console.log('match', id, 'processed');
}


async function scheduler() {
  // go through oldest last update summoners and added matches to queue
  const cursor = await collections.summoners.find({
    puuid: { $exists: true },
  }).sort( { lastAnalyzed: 1 });
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
        console.log('summoner puuid', summoner.puuid, 'scheduled');
      }
    }
  }
}

// create seed summoner doc if not exist
async function createSeedSummoners() {
  const topSummoners = await lol.getTopSummoners();
  if (topSummoners && topSummoners.length) {
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
}

async function completeSummoners() {
  // set puuid for all summoners
  const cursor = collections.summoners.find({
    puuid: { $not: { $exists: true, $ne: null } },
  });
  for await (const summoner of cursor) {
    const puuid = await lol.summonerToPuuid(summoner);
    const filter = { summonerId: summoner.summonerId };
    if (puuid) {
      const update = { $set: { puuid } };
      await collections.summoners.updateOne(filter, update);
    }
    console.log('set puuid of summonerId', summoner.summonerId);
  }
  console.log('puuids complete');

  // set last analyzed for new summoners
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
