from pymongo import MongoClient
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression
from sklearn import metrics
import pickle
from lol import champ_names
import os

mongo_uri = 'mongodb+srv://admin:admin123@cluster1.fk1yn.mongodb.net/match_history?retryWrites=true&w=majority'
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
        comps.append(list(map(lambda p: p['championName'], match['participants'])))
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
    for p in pos:
        blue += pd.get_dummies(comps_df[p])
    dblue = {}
    for name in list(blue.columns.values):
        dblue[name] = 'blue_' + name
    blue.rename(columns=dblue, inplace=True)

    red = pd.DataFrame(0, index=np.arange(len(comps)), columns=champs)
    for p in pos:
        red += pd.get_dummies(comps_df[p])
    dred = {}
    for name in list(red.columns.values):
        dred[name] = 'red_' + name
    red.rename(columns=dred, inplace=True)

    data = pd.concat([blue, red], axis=1)
    return data.fillna(0)

def predict(champs):
    infile = open(filepath, 'rb')
    clf = pickle.load(infile)
    infile.close()
    data = one_hot([champs])
    print(data)
    return clf.predict_proba(data)

if __name__ == '__main__':
    update()
    res = predict(['Garen', 'Nunu', 'Ekko', 'Ashe', 'Thresh', 'Sett', 'XinZhao', 'Annie', 'Ziggs', 'Leona'])
    print(res)