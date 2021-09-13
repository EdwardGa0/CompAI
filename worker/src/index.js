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
        if (!summoner.name) {
          summoner.name = summoner.summonerName;
        }
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
        topSummoners.map((summoner) => {
          if (!summoner.name) {
            summoner.name = summoner.summonerName;
          }
          return {
            updateOne: {
              filter: { name: summoner.name },
              update: { $set: summoner },
              upsert: true,
            },
          };
        }),
    );
    console.log(result);
  }
}

async function completeSummoners() {
  // fill name attribute
  let cursor = collections.summoners.find({
    name: { $exists: false },
  });
  for await (const summoner of cursor) {
    if (summoner.summonerName) {
      await collections.summoners.updateOne(
          { summonerName: summoner.summonerName },
          { $set: { name: summoner.summonerName } },
      );
    }
  }

  // set puuid for all summoners
  cursor = collections.summoners.find({
    puuid: { $not: { $exists: true, $ne: null } },
  });
  for await (const summoner of cursor) {
    const puuid = await lol.nameToSummoner(summoner.name).puuid;
    const filter = { name: summoner.name };
    if (puuid) {
      const update = { $set: { puuid } };
      await collections.summoners.updateOne(filter, update);
    } else {
      await collections.summoners.deleteOne(filter);
    }
    console.log('set puuid of', summoner.name);
  }
  console.log('puuids complete');

  // set last analyzed for new summoners
  const filter = { lastAnalyzed: { $exists: false } };
  const update = { $set: { lastAnalyzed: daysAgo(3) } };
  await collections.summoners.updateMany(filter, update);
  console.log('set last analyzed');
}

// async function completeMatches() {
//   const cursor = collections.matches.find({
//     blueWin: { $exists: false },
//   });
//   for await (const match of cursor) {
//     const fullMatch = await lol.getMatch(match.matchId);
//     match.blueWin = fullMatch.info.teams[0].win;
//     await collections.matches.updateOne(
//         { matchId: match.matchId },
//         { $set: match },
//     );
//     console.log('match', match.matchId, 'set outcome');
//   }
// }

// async function refreshPuuids() {
//   collections.summoners.deleteMany({
//     $and: [
//       { summonerName: { $exists: false } },
//       { name: { $exists: false } },
//     ],
//   });
//   const cursor = collections.summoners.find();
//   for await (const summoner of cursor) {
//     if (summoner.summonerName) {
//       const newSummoner = await lol.nameToSummoner(summoner.summonerName);
//       if (newSummoner) {
//         await collections.summoners.updateOne(
//             { summonerName: summoner.summonerName },
//             { $set: newSummoner },
//         );
//         console.log(summoner.summonerName, 'updated');
//       } else {
//         collections.summoners.deleteMany(
//             { summonerName: summoner.summonerName },
//         );
//       }
//     } else if (summoner.name) {
//       const newSummoner = await lol.nameToSummoner(summoner.name);
//       if (newSummoner) {
//         await collections.summoners.updateOne(
//             { name: summoner.name },
//             { $set: newSummoner },
//         );
//         console.log(summoner.name, 'updated');
//       } else {
//         collections.summoners.deleteMany({ name: summoner.name });
//       }
//     }
//   }
// }

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
