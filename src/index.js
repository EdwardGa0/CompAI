require('dotenv').config();

const { MongoClient } = require('mongodb');
const ProgressBar = require('progress');
const _ = require('lodash');

const lol = require('./lol');

const client = new MongoClient(
    process.env.MONGO_URI,
    { useNewUrlParser: true, useUnifiedTopology: true },
);

const collections = {};

// create summoner doc if not exist
async function createSummoners() {
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
async function setPuuids() {
  const cursor = collections.summoners.find({
    puuid: { $exists: false },
  });
  const bar = new ProgressBar(
      'getting puuids [:bar] :percent :etas',
      {
        total: await cursor.count(),
        width: 30,
      },
  );
  for await (const summoner of cursor) {
    const puuid = await lol.summonerToPuuid(summoner);
    if (puuid) {
      const filter = { summonerId: summoner.summonerId };
      const update = { $set: { puuid } };
      await collections.summoners.updateOne(filter, update);
      bar.tick();
    }
  }
}

async function addMatches(matchIds) {
  const bar = new ProgressBar(
      'adding matches [:bar] :percent :etas',
      {
        total: matchIds.length,
        width: 30,
      },
  );
  const options = { upsert: true };
  for (const id of matchIds) {
    const match = await lol.getMatch(id);
    if (match) {
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
      bar.tick();
    }
  }
}

async function updateMatches() {
  const cursor = collections.summoners.find();
  const bar = new ProgressBar(
      'getting matchIds [:bar] :percent :etas',
      {
        total: await cursor.count(),
        width: 30,
      },
  );
  for await (const summoner of cursor) {
    if (summoner.puuid) {
      const matchIds = await lol.puuidToMatchIds(summoner.puuid);
      if (matchIds && matchIds.length) {
        await addMatches(matchIds);
        bar.tick();
      }
    }
  }
}

async function run() {
  try {
    await client.connect();
    const database = client.db('match_history');
    collections.summoners = database.collection('summoners');
    collections.matches = database.collection('matches');
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await createSummoners();
      await setPuuids();
      await updateMatches();
    }
  } finally {
    await client.close();
  }
}

run().catch(console.dir);
