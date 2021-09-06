const axios = require('axios').default;
const { RateLimiter } = require('limiter');
const dotenv = require('dotenv');

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
    let keepAlive = false;
    if (error.response) {
      if ([401, 403].includes(error.response.status)) { // unauthorized
        dotenv.config();
        keepAlive = true;
      }
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.log(error.response.data);
    } else if (error.request) {
      // The request was made but no response was received
      // `error.request` is an instance of XMLHttpRequest in the browser
      // and an instance of http.ClientRequest in node.js
      console.log(error.request);
    } else {
      // Something happened in setting up the request that triggered an Error
      console.log('Error', error.message);
    }
    console.log(error.config);
    if (attempts < apiKeys.length) {
      return (await get(region, route, params, startIndex, attempts + 1));
    }
    if (keepAlive) {
      await new Promise((r) => setTimeout(r, 60000));
      return (await get(region, route, params, startIndex));
    }
    return null;
  }
}

module.exports = { get };
