from flask import Flask, request, Response
from g4f.client import Client
import json

app = Flask(__name__)
app.config["JSON_SORT_KEYS"] = False

client = Client()

DEVELOPER_INFO = {
    "developer": "@jubayer_Codex",
    "group": "https://t.me/Jubayer_Like",
    "version": "v3.0"
}


@app.route("/", methods=["GET"])
def home():
    data = {
        "message": "Jubayer AI API is running.",
        "endpoint": "/get_ai?question=Your Question",
        "developer": DEVELOPER_INFO
    }

    return Response(
        json.dumps(data, ensure_ascii=False, indent=2),
        mimetype="application/json"
    )


@app.route("/get_ai", methods=["GET"])
def get_ai():
    question = request.args.get("question")

    if not question:
        data = {
            "status": False,
            "error": "Question parameter is required.",
            "developer": DEVELOPER_INFO
        }

        return Response(
            json.dumps(data, ensure_ascii=False, indent=2),
            mimetype="application/json",
            status=400
        )

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "user",
                    "content": question
                }
            ]
        )

        answer = response.choices[0].message.content.strip()

        data = {
            "answer": answer,
            "question": question,
            "status": True,
            "developer": DEVELOPER_INFO
        }

        return Response(
            json.dumps(data, ensure_ascii=False, indent=2),
            mimetype="application/json"
        )

    except Exception as e:
        data = {
            "status": False,
            "error": str(e),
            "developer": DEVELOPER_INFO
        }

        return Response(
            json.dumps(data, ensure_ascii=False, indent=2),
            mimetype="application/json",
            status=500
        )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)