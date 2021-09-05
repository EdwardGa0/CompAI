const axios = require('axios').default;
const { RateLimiter } = require('limiter');

const apiKeys = [0, 1, 2].map((i) => process.env[`RIOT_API_KEY${i}`]);
let keyIndex = 0;

const limiterSec = Array(3).fill(new RateLimiter({
  tokensPerInterval: 20, interval: 950,
}));

const limiterMin = Array(3).fill(new RateLimiter({
  tokensPerInterval: 100, interval: 119000,
}));

async function get(region, route, params = {}) {
  await limiterSec[keyIndex].removeTokens(1);
  await limiterMin[keyIndex].removeTokens(1);
  try {
    const host = `https://${region}.api.riotgames.com`;
    const res = await axios.get(host + route, {
      params: {
        api_key: apiKeys[keyIndex],
        ...params,
      },
    });
    return res.data;
  } catch (error) {
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      switch (error.response.status) {
        case 429: // rate limit exceeded
        case 503: // service unavailable
          keyIndex = (keyIndex + 1) % apiKeys.length;
          return (await get(region, route, params));
      }
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
}

module.exports = { get };
