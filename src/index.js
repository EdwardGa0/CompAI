require('dotenv').config();

const { MongoClient } = require('mongodb');
const ProgressBar = require('progress');
const _ = require('lodash');

const lol = require('./lol');

const client = new MongoClient(
    process.env.MONGO_URI,
    { useNewUrlParser: true, useUnifiedTopology: true },
);

async function run() {
  try {
    await client.connect();
    const database = client.db('match_history');
    const summonerCol = database.collection('summoners');

    // create summoner doc if not exist
    let topSummoners;
    while (!topSummoners || !topSummoners.length) {
      topSummoners = await lol.getTopSummoners();
    }
    const result = await summonerCol.bulkWrite(
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

    // set puuid for all summoners
    let cursor = summonerCol.find({
      puuid: { $exists: false },
    });
    let bar = new ProgressBar(
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
        await summonerCol.updateOne(filter, update);
        bar.tick();
      }
    }

    // get set of match ids
    const matchCol = database.collection('matches');
    const matchIdsSet = new Set();
    cursor = summonerCol.find();
    bar = new ProgressBar(
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
          matchIds.forEach((id) => matchIdsSet.add(id));
          bar.tick();
        }
      }
    }

    // update matches
    bar = new ProgressBar(
        'adding matches [:bar] :percent :etas',
        {
          total: matchIdsSet.size,
          width: 30,
        },
    );
    const options = { upsert: true };
    for (const id of matchIdsSet) {
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
        await matchCol.updateOne(filter, update, options);
        bar.tick();
      }
    }
  } finally {
    await client.close();
  }
}

run().catch(console.dir);
