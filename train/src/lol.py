import requests

def latest_version():
    r = requests.get('https://ddragon.leagueoflegends.com/api/versions.json')
    return r.json()[0]

def champ_names():
    r = requests.get(f'http://ddragon.leagueoflegends.com/cdn/{latest_version()}/data/en_US/champion.json')
    return [s.lower() for s in r.json()['data'].keys()]

if __name__ == '__main__':
    print(champ_names())