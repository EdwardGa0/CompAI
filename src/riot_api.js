const axios = require('axios').default;
const { RateLimiter } = require('limiter');
const readline = require('readline');

let apiKey = process.env.RIOT_API_KEY;

function input(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => rl.question(query, (ans) => {
    rl.close();
    resolve(ans);
  }));
}

const limiterSec = new RateLimiter({
  tokensPerInterval: 20, interval: 950,
});

const limiterMin = new RateLimiter({
  tokensPerInterval: 100, interval: 119000,
});

async function get(region, route, params = {}) {
  await limiterSec.removeTokens(1);
  await limiterMin.removeTokens(1);
  try {
    const host = `https://${region}.api.riotgames.com`;
    const res = await axios.get(host + route, {
      params: {
        api_key: apiKey,
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
          await limiterSec.removeTokens(limiterSec.getTokensRemaining());
          await limiterMin.removeTokens(limiterMin.getTokensRemaining());
          return (await get(region, route, params));
        case 503: // service unavailable
          return (await get(region, route, params));
        case 403: // Forbidden
          apiKey = await input('Provide valid API key: ');
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
