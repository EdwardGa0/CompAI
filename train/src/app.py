from flask import Flask, request, jsonify
from train import predict

app = Flask(__name__)

@app.route("/api/predict")
def hello_world():
    champs = request.args.get('champs').split(',')
    res = predict(champs).tolist()
    return jsonify(res)

if __name__ == '__main__':
    app.run(debug=True)