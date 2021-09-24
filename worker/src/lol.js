const riotApi = require('./riot_api');

async function mastersPlusSummoners() {
  const leagues = ['challenger', 'grandmaster', 'master'];
  const routes = leagues.map((league) =>
    `/lol/league/v4/${league}leagues/by-queue/RANKED_SOLO_5x5`);
  const summoners = [];
  for (const route of routes) {
    const data = await riotApi.get('na1', route);
    if (data) summoners.push(...data.entries);
  }
  return summoners;
}

async function diamondSummoners() {
  const tiers = ['I', 'II', 'III', 'IV'];
  const routes = tiers.map((tier) =>
    `/lol/league/v4/entries/RANKED_SOLO_5x5/DIAMOND/${tier}`);
  const summoners = [];
  for (const route of routes) {
    let page = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const data = await riotApi.get('na1', route, { page });
      if (data && data.length) {
        summoners.push(...data);
        console.log('got page', page);
        page += 1;
      } else {
        break;
      }
    }
  }
  return summoners;
}

async function topSummoners() {
  const mastersPlus = await mastersPlusSummoners();
  const diamond = await diamondSummoners();
  return [...mastersPlus, ...diamond].filter((a, index, self) =>
    index === self.findIndex((b) => (
      a.summonerName === b.summonerName
    )),
  );
}

async function puuidToSummoner(puuid) {
  const route = `/lol/summoner/v4/summoners/by-puuid/${puuid}`;
  const data = await riotApi.get('na1', route);
  if (data) return data;
}

async function nameToSummoner(summonerName) {
  const route = `/lol/summoner/v4/summoners/by-name/${summonerName}`;
  const data = await riotApi.get('na1', route);
  if (data) return data;
}

async function puuidToMatchIds(puuid, count) {
  const route = `/lol/match/v5/matches/by-puuid/${puuid}/ids`;
  const params = { count, type: 'ranked' };
  const data = await riotApi.get('americas', route, params);
  if (data) return data;
}

async function getMatch(matchId) {
  const route = `/lol/match/v5/matches/${matchId}`;
  const data = await riotApi.get('americas', route);
  if (data) return data;
}

module.exports = {
  topSummoners,
  puuidToSummoner,
  nameToSummoner,
  puuidToMatchIds,
  getMatch,
};
