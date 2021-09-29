import axios from "axios";
  
async function getChampNames() {
  const version = (await axios.get('https://ddragon.leagueoflegends.com/api/versions.json')).data[0];
  const data = (await axios.get(`http://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`)).data.data;
  return Object.keys(data);
}

export {
  getChampNames
};