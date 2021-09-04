require('dotenv').config();

const { MongoClient } = require('mongodb');
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
  for await (const summoner of cursor) {
    const puuid = await lol.summonerToPuuid(summoner);
    if (puuid) {
      const filter = { summonerId: summoner.summonerId };
      const update = { $set: { puuid } };
      await collections.summoners.updateOne(filter, update);
      console.log('set puuid: ', puuid);
    }
  }
}

async function addMatches(matchIds) {
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
      console.log('added match: ', id);
    }
  }
}

async function updateMatches() {
  const cursor = collections.summoners.find();
  for await (const summoner of cursor) {
    if (summoner.puuid) {
      const matchIds = await lol.puuidToMatchIds(summoner.puuid);
      if (matchIds && matchIds.length) {
        await addMatches(matchIds);
        console.log('finished matches');
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
