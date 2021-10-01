from numpy.lib.arraysetops import isin
from pymongo import MongoClient
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression
from sklearn import metrics
import pickle
from lol import champ_names
import os
from dotenv import load_dotenv

load_dotenv()
mongo_uri = os.environ.get('MONGO_URI')
client = MongoClient(mongo_uri)
db = client.match_history

dir = os.path.dirname(__file__)
rel_path = '../data/model'
filepath = os.path.join(dir, rel_path)

def update():
    matches = db.matches.find()
    comps = []
    target = []
    for match in matches:
        comps.append(list(map(lambda p: p['championName'].lower(), match['participants'])))
        target.append(int(match['blueWin']))
    data = one_hot(comps)
    clf = LogisticRegression(random_state=42).fit(data, target)

    outfile = open(filepath, 'wb')
    pickle.dump(clf, outfile)
    outfile.close()

def one_hot(comps):
    pos = ['blue_top', 'blue_jg', 'blue_mid', 'blue_bot', 'blue_sup', 'red_top', 'red_jg', 'red_mid', 'red_bot', 'red_sup']
    champs = champ_names()
    comps_df = pd.DataFrame(comps, columns=pos)
    blue = pd.DataFrame(0, index=np.arange(len(comps)), columns=champs)
    for p in pos[:5]:
        blue = blue.add(pd.get_dummies(comps_df[p]), fill_value=0)
    dblue = {}
    for name in list(blue.columns.values):
        dblue[name] = 'blue_' + name
    blue.rename(columns=dblue, inplace=True)

    red = pd.DataFrame(0, index=np.arange(len(comps)), columns=champs)
    for p in pos[5:]:
        red = red.add(pd.get_dummies(comps_df[p]), fill_value=0)
    dred = {}
    for name in list(red.columns.values):
        dred[name] = 'red_' + name
    red.rename(columns=dred, inplace=True)

    data = pd.concat([blue, red], axis=1)
    return data.fillna(0)

def predict(champs):
    champs = [c.lower() for c in champs]
    champs = [np.nan if c == 'null' else c for c in champs]
    infile = open(filepath, 'rb')
    clf = pickle.load(infile)
    infile.close()
    data = one_hot([champs])
    return clf.predict_proba(data)[0]

if __name__ == '__main__':
    t = [['Camille', 'null', 'null', 'null', 'null', 'Garen', 'null', 'null', 'null', 'null'],
    ['garen', 'null', 'null', 'null', 'null', 'Camille', 'null', 'null', 'null', 'null'],
    ['fiora', 'null', 'null', 'null', 'null', 'malphite', 'null', 'null', 'null', 'null'],
    ['malphite', 'null', 'null', 'null', 'null', 'fiora', 'null', 'null', 'null', 'null'],
    ['Camille', 'null', 'null', 'null', 'null', 'Shen', 'null', 'null', 'null', 'null'],
    ['riven', 'null', 'null', 'null', 'null', 'fiora', 'null', 'null', 'null', 'null'],
    ['sett', 'null', 'null', 'null', 'null', 'irelia', 'null', 'null', 'null', 'null'],
    ['malphite', 'null', 'null', 'null', 'null', 'jax', 'null', 'null', 'null', 'null']]
    for i in t:
        print(predict(i))
    