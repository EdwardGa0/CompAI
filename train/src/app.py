from flask import Flask, request, jsonify
from flask_cors import CORS
from train import predict

app = Flask(__name__)
cors = CORS(app)

@app.route("/api/predict")
def hello_world():
    champs = request.args.get('champs').split(',')
    res = predict(champs).tolist()
    return jsonify(res)

if __name__ == '__main__':
    app.run(debug=True)