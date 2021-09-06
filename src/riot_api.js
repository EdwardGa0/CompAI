const axios = require('axios').default;
const { RateLimiter } = require('limiter');

const apiKeys = [0, 1, 2].map((i) => process.env[`RIOT_API_KEY${i}`]);

const limiterSec = Array(3).fill(new RateLimiter({
  tokensPerInterval: 20, interval: 950,
}));

const limiterMin = Array(3).fill(new RateLimiter({
  tokensPerInterval: 100, interval: 119000,
}));

function indexWithMaxTokens() {
  let index = 0;
  for (let i = 1; i < apiKeys.length; i += 1) {
    if (limiterSec[i].getTokensRemaining() >
        limiterSec[index].getTokensRemaining()) {
      index = i;
    }
  }
  return index;
}

async function get(
    region,
    route,
    params = {},
    startIndex = indexWithMaxTokens(),
    attempts = 0,
) {
  const keyIndex = (startIndex + attempts) % apiKeys.length;
  await limiterSec[keyIndex].removeTokens(1);
  await limiterMin[keyIndex].removeTokens(1);
  try {
    const host = `https://${region}.api.riotgames.com`;
    const res = await axios.get(host + route, {
      params: { api_key: apiKeys[keyIndex], ...params },
    });
    return res.data;
  } catch (error) {
    if (attempts == apiKeys.length) {
      if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        console.error(error.response.data);
      } else if (error.request) {
        // The request was made but no response was received
        // `error.request` is an instance of XMLHttpRequest in the browser
        // and an instance of http.ClientRequest in node.js
        console.error(error.request);
      } else {
        // Something happened in setting up the request that triggered an Error
        console.error('Error', error.message);
      }
      console.error(error.config);
      return null;
    }
    return (await get(region, route, params, startIndex, attempts + 1));
  }
}

module.exports = { get };
