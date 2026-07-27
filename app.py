from flask import Flask, request, Response
from g4f.client import Client
import json
import os

app = Flask(__name__)
app.config["JSON_SORT_KEYS"] = False

client = Client()


@app.route("/", methods=["GET"])
def home():
    data = {
        "message": "Bishal AI API is running.",
        "endpoint": "/question?q=Your Question"
    }

    return Response(
        json.dumps(data, ensure_ascii=False, indent=2),
        mimetype="application/json"
    )


@app.route("/question", methods=["GET"])
def get_ai():
    question = request.args.get("q")
    print_button = request.args.get("print", "false").lower() == "true"

    if not question:
        data = {
            "status": False,
            "error": "Question parameter is required. Use ?q=your question"
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

        if print_button:
            print_response = f"""
========================================
        BISHAL AI RESPONSE
========================================

Question: {question}

Answer:
{answer}

========================================
        Printed on: {__import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
========================================
"""
            return Response(
                print_response,
                mimetype="text/plain"
            )

        return Response(
            answer,
            mimetype="text/plain"
        )

    except Exception as e:
        data = {
            "status": False,
            "error": str(e)
        }

        return Response(
            json.dumps(data, ensure_ascii=False, indent=2),
            mimetype="application/json",
            status=500
        )


# For Vercel serverless
app = app

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 5000)), debug=True)
