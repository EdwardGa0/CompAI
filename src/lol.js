const riotApi = require('./riot_api');

async function getTopSummoners() {
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

async function puuidToSummoner(puuid) {
  const route = `/lol/summoner/v4/summoners/by-puuid/${puuid}`;
  const data = await riotApi.get('na1', route);
  if (data) return data;
}

async function summonerToPuuid(summoner) {
  const summonerId = summoner.summonerId || summoner.id;
  const route = `/lol/summoner/v4/summoners/${summonerId}`;
  const data = await riotApi.get('na1', route);
  if (data) return data.puuid;
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
  getTopSummoners,
  puuidToSummoner,
  summonerToPuuid,
  puuidToMatchIds,
  getMatch,
};
