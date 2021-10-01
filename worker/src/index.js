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
          ['championId', 'championName', 'puuid'],
      )),
    ),
    blueWin: match.info.teams[0].win,
  };
  const filter = { matchId: id };
  const update = { $set: filteredMatch };
  await collections.matches.updateOne(filter, update, options);
  console.log('match', id, 'processed');
}


async function scheduler() {
  // go through oldest last update summoners and added matches to queue
  const cursor = await collections.summoners.find({
    demoted: false,
    puuid: { $exists: true },
  }).sort( { lastAnalyzed: 1 });
  for await (const summoner of cursor) {
    const diff = Math.abs(summoner.lastAnalyzed - new Date());
    const milliPerGame = 30 * 60 * 1000;
    const count = Math.min(Math.floor(diff / milliPerGame), 100);
    if (count) {
      const matchIds = await lol.puuidToMatchIds(summoner.puuid, count);
      if (matchIds && matchIds.length) {
        for (const id of matchIds) {
          await queue.push(id);
        }
        const filter = { puuid: summoner.puuid };
        const update = { $set: { lastAnalyzed: new Date() } };
        collections.summoners.updateOne(filter, update);
        console.log('summoner puuid', summoner.puuid, 'scheduled');
      } else {
        await updateSummoner(summoner);
      }
    }
  }
}

async function updateSummoner(summoner) {
  const summonerName = summoner.summonerName;
  const newSummoner = await lol.nameToSummoner(summonerName);
  if (newSummoner) {
    await collections.summoners.updateOne(
        { summonerName },
        { $set: newSummoner },
    );
    console.log(summonerName, 'updated');
  } else {
    collections.summoners.deleteMany({ summonerName });
  }
}

// create seed summoner doc if not exist
async function addSummoners() {
  const topSummoners = await lol.topSummoners();
  if (topSummoners && topSummoners.length) {
    const result = await collections.summoners.bulkWrite(
        topSummoners.map((summoner) => {
          return {
            updateOne: {
              filter: { summonerName: summoner.summonerName },
              update: { $set: summoner },
              upsert: true,
            },
          };
        }),
    );
    console.log(result);
  }
  const summonerNames = topSummoners.map((summoner) => summoner.summonerName);
  await collections.summoners.updateMany(
      { summonerName: { $in: summonerNames } },
      { $set: { demoted: false } },
  );
  await collections.summoners.updateMany(
      { summonerName: { $nin: summonerNames } },
      { $set: { demoted: true } },
  );
  console.log('set demoted');
}

async function completeSummoners() {
  // delete duplicate
  const summonerNames = await collections.summoners.distinct('summonerName');
  for (const summonerName of summonerNames) {
    const cursor = collections.summoners.find({ summonerName });
    if (cursor.count() > 1) {
      const summoner = await cursor.next();
      await collections.summoners.deleteMany({ summonerName });
      await collections.summoners.insertOne(summoner);
    }
  }
  console.log('duplicates deleted');

  // set puuid for all summoners
  const cursor = collections.summoners.find({
    puuid: { $not: { $exists: true, $ne: null } },
  });
  for await (const summoner of cursor) {
    await updateSummoner(summoner);
  }
  console.log('puuids complete');

  // set last analyzed for new summoners
  const filter = { lastAnalyzed: { $exists: false } };
  const update = { $set: { lastAnalyzed: daysAgo(3) } };
  await collections.summoners.updateMany(filter, update);
  console.log('set last analyzed');

  // set demoted false
  await collections.summoners.updateMany(
      { demoted: { $exists: false } },
      { $set: { demoted: false } },
  );
  console.log('filled demoted');
}

async function run() {
  try {
    await client.connect();
    const database = client.db('match_history');
    collections.summoners = database.collection('summoners');
    collections.matches = database.collection('matches');

    // eslint-disable-next-line no-constant-condition
    while (true) {
      await addSummoners();
      await completeSummoners();
      await scheduler();
      console.log('done');
    }
  } finally {
    await client.close();
  }
}

run().catch(console.dir);
